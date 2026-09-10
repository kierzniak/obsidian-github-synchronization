import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import type GitHubSyncPlugin from '../src/main';
import * as obsidian from './helpers/obsidian';
import git from 'isomorphic-git';
import { fixture, Fixture } from './helpers/vault';
import { requestUrl, TestElement } from './helpers/obsidian';
import { showRepositorySetup } from '../src/ui/repository-setup';
import { SyncService } from '../src/services/sync-service';

let seed: Fixture;
let client: Fixture;
let bare: string;
const nativeGit = (args: string[], input?: Buffer) =>
  execFileSync(process.env.GIT_BINARY || 'git', args, {
    input,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
beforeEach(async () => {
  seed = await fixture();
  client = await fixture();
  bare = path.join(seed.dir, 'remote.git');
  nativeGit(['-c', 'init.templateDir=', 'init', '--bare', '-b', 'main', bare]);
  requestUrl.mockImplementation(
    async (params: {
      url: string;
      method?: string;
      headers: Record<string, string>;
      body?: ArrayBuffer;
    }) => {
      const url = new URL(params.url);
      if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/test/notes'))
        throw new Error('Unexpected network destination');
      const auth = Object.entries(params.headers).find(
        ([key]) => key.toLowerCase() === 'authorization',
      );
      if (!auth)
        return {
          status: 401,
          headers: { 'www-authenticate': 'Basic realm="GitHub"' },
          arrayBuffer: new ArrayBuffer(0),
        };
      let output: Buffer;
      let contentType: string;
      if (url.pathname.endsWith('/info/refs')) {
        const service = url.searchParams.get('service');
        if (service !== 'git-upload-pack' && service !== 'git-receive-pack')
          throw new Error('Unexpected Git service');
        const preamble = Buffer.from(`# service=${service}\n`);
        const packet = Buffer.from((preamble.length + 4).toString(16).padStart(4, '0'));
        output = Buffer.concat([
          packet,
          preamble,
          Buffer.from('0000'),
          nativeGit([service.slice(4), '--stateless-rpc', '--advertise-refs', bare]),
        ]);
        contentType = `application/x-${service}-advertisement`;
      } else {
        const command = url.pathname.endsWith('/git-upload-pack')
          ? 'upload-pack'
          : url.pathname.endsWith('/git-receive-pack')
            ? 'receive-pack'
            : null;
        if (!command) throw new Error('Unexpected Git endpoint');
        output = nativeGit([command, '--stateless-rpc', bare], Buffer.from(params.body!));
        contentType = `application/x-git-${command}-result`;
      }
      return {
        status: 200,
        headers: { 'content-type': contentType },
        arrayBuffer: Uint8Array.from(output).buffer,
      };
    },
  );
});
afterEach(async () => {
  requestUrl.mockReset();
  await seed.cleanup();
  await client.cleanup();
});

test('clones, merges another device’s changes, and pushes real Git objects through the mobile HTTP adapter', async () => {
  await seed.repo().initialize();
  const image = Uint8Array.from({ length: 256 }, (_, i) => i);
  await seed.commit({
    'note.md': 'base\n',
    'asset.png': image,
    '.obsidian/preferences.json': 'remote preferences',
  });
  nativeGit(['-C', seed.dir, 'push', bare, 'main']);
  await client.write('.obsidian/preferences.json', 'local preferences');
  const completed = jest.fn(async () => {});
  const sync = new SyncService(
    () => client.settings,
    client.fs,
    '.obsidian',
    async () => null,
    completed,
  );
  const setup = new TestElement();
  await showRepositorySetup(setup as unknown as HTMLElement, {
    hasRepository: () => client.adapter.exists('.git/HEAD'),
    run: async (operation) => {
      await sync.run(operation);
    },
  });
  expect(setup.settings[0].buttons[0].label).toBe('Import repository');
  await setup.settings[0].buttons[0].click();
  expect(setup.settings[0].buttons[0].label).toBe('Sync now');
  expect((await client.read('.obsidian/preferences.json')).toString()).toBe('local preferences');
  expect(await client.repo().changes()).toEqual([]);
  expect(Array.from(await client.read('asset.png'))).toEqual(Array.from(image));
  await seed.commit({ 'remote.md': 'other device' });
  nativeGit(['-C', seed.dir, 'push', bare, 'main']);
  await client.write('local.md', 'my local note');
  await setup.settings[0].buttons[0].click();
  expect((await client.read('remote.md')).toString()).toBe('other device');
  expect(nativeGit(['--git-dir', bare, 'show', 'main:local.md']).toString()).toBe('my local note');
  expect(Array.from(nativeGit(['--git-dir', bare, 'show', 'main:asset.png']))).toEqual(
    Array.from(image),
  );
  expect(completed).toHaveBeenCalledTimes(1);
  expect(await client.repo().changes()).toEqual([]);
  expect(await git.currentBranch(client.options)).toBe('main');
});
test.each(['push', 'sync'] as const)(
  '%s can seed an empty remote without cloning over local notes',
  async (operation) => {
    await client.repo().initialize();
    await client.write('local.md', 'initial note');
    const sync = new SyncService(
      () => client.settings,
      client.fs,
      '.obsidian',
      async () => null,
      async () => {},
    );
    await sync.run(operation);
    expect(nativeGit(['--git-dir', bare, 'show', 'main:local.md']).toString()).toBe('initial note');
    expect(fs.existsSync(client.absolute('.git/HEAD'))).toBe(true);
  },
);

// Run the distributed artifact, not source modules that inherit Node's Buffer.
test.each(['clone', 'init'] as const)(
  'mobile bundle can %s and sync without Node globals',
  async (setupOperation) => {
    const image = Uint8Array.from({ length: 256 }, (_, i) => i);
    if (setupOperation === 'clone') {
      await seed.repo().initialize();
      await seed.commit({ 'note.md': 'base\n', 'asset.png': image });
      nativeGit(['-C', seed.dir, 'push', bare, 'main']);
    }
    const notices: string[] = [];
    const sandbox = vm.createContext({
      module: { exports: {} },
      console,
      TextEncoder,
      TextDecoder,
      URL,
      // The host filesystem boundary and plugin share browser byte types.
      ArrayBuffer,
      Uint8Array,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      document: { hidden: false, addEventListener() {}, removeEventListener() {} },
      require(id: string) {
        if (id !== 'obsidian') throw new Error(`Unavailable mobile dependency: ${id}`);
        return {
          ...obsidian,
          Notice: class {
            constructor(message: string) {
              notices.push(message);
            }
          },
        };
      },
    });
    expect(vm.runInContext('[typeof Buffer, typeof process, typeof global]', sandbox)).toEqual([
      'undefined',
      'undefined',
      'undefined',
    ]);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), sandbox);
    const Plugin = sandbox.module.exports.default;
    const plugin: GitHubSyncPlugin = new Plugin({
      vault: { ...client.vault, on: jest.fn(), offref: jest.fn() },
      workspace: { onLayoutReady() {} },
    });
    plugin.loadData = async () => client.settings;
    await plugin.onload();
    const run = async (operation: 'clone' | 'init' | 'sync') => {
      notices.length = 0;
      await plugin.run(operation);
      expect(notices).toHaveLength(1);
      expect(notices[0]).not.toMatch(/^GitHub sync:/);
    };
    try {
      await run(setupOperation);
      if (setupOperation === 'clone') {
        expect((await client.read('note.md')).toString()).toBe('base\n');
        expect(Array.from(await client.read('asset.png'))).toEqual(Array.from(image));
        await seed.commit({ 'remote.md': 'another device' });
        nativeGit(['-C', seed.dir, 'push', bare, 'main']);
      }
      await client.write('local.md', 'mobile note');
      await client.write('local.png', image);
      await run('sync');
      expect(plugin.settings.lastSyncTime).toBeGreaterThan(0);
      expect(nativeGit(['--git-dir', bare, 'log', '--format=%s', 'main']).toString()).toMatch(
        /^vault backup: 2 changed file\(s\)$/m,
      );
      expect(nativeGit(['--git-dir', bare, 'show', 'main:local.md']).toString()).toBe(
        'mobile note',
      );
      expect(Array.from(nativeGit(['--git-dir', bare, 'show', 'main:local.png']))).toEqual(
        Array.from(image),
      );
      if (setupOperation === 'clone')
        expect((await client.read('remote.md')).toString()).toBe('another device');
      expect(await client.repo().changes()).toEqual([]);
      expect(vm.runInContext('typeof Buffer', sandbox)).toBe('undefined');
    } finally {
      plugin.unload();
    }
  },
);
