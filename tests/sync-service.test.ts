import { fixture, Fixture } from './helpers/vault';
import { SyncService } from '../src/services/sync-service';
import { GitRepository } from '../src/services/git-repository';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
  await f.repo().initialize();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await f.cleanup();
});
function service(completed = jest.fn(async () => {})) {
  return new SyncService(
    () => f.settings,
    f.fs,
    '.obsidian',
    async () => null,
    completed,
  );
}
test('serializes commands and does not start another background operation', async () => {
  await f.write('note.md', 'local edits');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pull = jest.spyOn(GitRepository.prototype, 'pull').mockImplementation(async () => {
    await pending;
    return 0;
  });
  const push = jest.spyOn(GitRepository.prototype, 'push').mockResolvedValue();
  const sync = service();
  const first = sync.run('sync');
  expect(sync.busy).toBe(true);
  await expect(sync.run('commit')).rejects.toThrow('already running');
  expect(await sync.run('sync', false)).toBeNull();
  release();
  await first;
  expect(pull).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledTimes(1);
  expect(sync.busy).toBe(false);
});
test('saves local edits before pull and never pushes after a failed pull', async () => {
  await f.write('note.md', 'my precious note');
  jest.spyOn(GitRepository.prototype, 'pull').mockImplementation(async function (
    this: GitRepository,
  ) {
    expect(await this.head()).not.toBeNull();
    expect(await this.changes()).toEqual([]);
    throw new Error('Merge conflict');
  });
  const push = jest.spyOn(GitRepository.prototype, 'push');
  const completed = jest.fn(async () => {});
  const sync = service(completed);
  await expect(sync.run('sync')).rejects.toThrow('Merge conflict');
  expect(push).not.toHaveBeenCalled();
  expect(completed).not.toHaveBeenCalled();
  expect(sync.busy).toBe(false);
  expect((await f.read('note.md')).toString()).toBe('my precious note');
});
test('configuration is snapshotted per operation and changed settings are used next time', async () => {
  await f.commit({ 'note.md': 'note' });
  const tokens: string[] = [];
  jest.spyOn(GitRepository.prototype, 'push').mockImplementation(async function (
    this: GitRepository,
  ) {
    tokens.push(this.settings.personalAccessToken);
    f.settings.personalAccessToken = 'next-token';
  });
  const sync = service();
  await sync.run('push');
  await sync.run('push');
  expect(tokens).toEqual(['test-token', 'next-token']);
});
test('unload stops later network steps and future commands', async () => {
  await f.commit({ 'note.md': 'note' });
  const sync = service();
  jest.spyOn(GitRepository.prototype, 'pull').mockImplementation(async () => {
    sync.stop();
    return 0;
  });
  const push = jest.spyOn(GitRepository.prototype, 'push');
  expect(await sync.run('sync')).toBeNull();
  expect(push).not.toHaveBeenCalled();
  expect(await sync.run('commit')).toBeNull();
});
test('background sync never opens a manual conflict modal', async () => {
  await f.commit({ 'note.md': 'note' });
  const pull = jest
    .spyOn(GitRepository.prototype, 'pull')
    .mockRejectedValue(new Error('Resolve conflict'));
  await expect(service().run('sync', false)).rejects.toThrow('Resolve conflict');
  expect(pull).toHaveBeenCalledWith(undefined);
});
