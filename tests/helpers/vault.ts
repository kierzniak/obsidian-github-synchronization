import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import git from 'isomorphic-git';
import type { DataAdapter, Vault } from 'obsidian';
import { TFile, TFolder } from './obsidian';
import { ObsidianFSAdapter } from '../../src/services/obsidian-fs-adapter';
import { loadSettings } from '../../src/config';
import { GitRepository } from '../../src/services/git-repository';

export async function fixture() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'obsidian-sync-test-'));
  const absolute = (p: string) => path.join(dir, p);
  const write = async (p: string, content: string | Uint8Array) => {
    await fs.promises.mkdir(path.dirname(absolute(p)), { recursive: true });
    await fs.promises.writeFile(absolute(p), content);
  };
  const adapter = {
    exists: async (p: string) => fs.existsSync(absolute(p)),
    stat: async (p: string) => {
      try {
        const s = await fs.promises.stat(absolute(p));
        return {
          type: s.isDirectory() ? 'folder' : 'file',
          size: s.size,
          mtime: s.mtimeMs,
          ctime: s.ctimeMs,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    read: async (p: string) => fs.promises.readFile(absolute(p), 'utf8'),
    readBinary: async (p: string) => {
      const b = await fs.promises.readFile(absolute(p));
      return Uint8Array.from(b).buffer;
    },
    writeBinary: async (p: string, data: ArrayBuffer) => {
      if (!(data instanceof ArrayBuffer)) throw new Error('Expected ArrayBuffer (mobile contract)');
      await fs.promises.writeFile(absolute(p), new Uint8Array(data));
    },
    list: async (p: string) => {
      const entries = await fs.promises.readdir(absolute(p), { withFileTypes: true });
      return {
        files: entries.filter((e) => e.isFile()).map((e) => path.posix.join(p, e.name)),
        folders: entries.filter((e) => e.isDirectory()).map((e) => path.posix.join(p, e.name)),
      };
    },
    mkdir: async (p: string) => fs.promises.mkdir(absolute(p)),
    remove: async (p: string) => fs.promises.unlink(absolute(p)),
    rmdir: async (p: string) => fs.promises.rmdir(absolute(p)),
    rename: async (a: string, b: string) => fs.promises.rename(absolute(a), absolute(b)),
  };
  const vault = {
    adapter,
    configDir: '.obsidian',
    getAbstractFileByPath: (p: string) => {
      if (p.split('/').some((part) => part.startsWith('.')) || !fs.existsSync(absolute(p)))
        return null;
      return fs.statSync(absolute(p)).isDirectory() ? new TFolder(p) : new TFile(p);
    },
    modifyBinary: async (file: TFile, data: ArrayBuffer) => adapter.writeBinary(file.path, data),
    createBinary: async (p: string, data: ArrayBuffer) => {
      if (fs.existsSync(absolute(p))) throw new Error('File already exists');
      await adapter.writeBinary(p, data);
    },
    createFolder: adapter.mkdir,
    delete: async (file: TFile) => adapter.remove(file.path),
  };
  const gitfs = new ObsidianFSAdapter(vault as unknown as Vault, adapter as unknown as DataAdapter);
  const options = { fs: gitfs, dir: '.' };
  const settings = loadSettings({
    repositoryUrl: 'test/notes',
    personalAccessToken: 'test-token',
    authorName: 'Test',
    authorEmail: 'test@example.invalid',
  });
  const repo = () =>
    new GitRepository(gitfs, { ...settings, excludePatterns: [...settings.excludePatterns] });
  const commit = async (files: Record<string, string | Uint8Array>, message = 'fixture') => {
    for (const [p, content] of Object.entries(files)) {
      await write(p, content);
      await git.add({ ...options, filepath: p });
    }
    return git.commit({
      ...options,
      message,
      author: { name: 'Test', email: 'test@example.invalid' },
    });
  };
  return {
    dir,
    absolute,
    write,
    adapter,
    vault,
    fs: gitfs,
    options,
    settings,
    repo,
    commit,
    read: (p: string) => fs.promises.readFile(absolute(p)),
    cleanup: () => fs.promises.rm(dir, { recursive: true, force: true }),
  };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
