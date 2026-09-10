import { DataAdapter, TFile, Vault } from 'obsidian';
import { vaultPath } from '../paths';

function fsError(code: string, path: string): Error & { code: string } {
  return Object.assign(new Error(`${code}: ${path}`), { code });
}
function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
/** Expose the complete filesystem to Git; the Git service applies sync exclusions. */
export class ObsidianFSAdapter {
  readonly promises: VaultFileSystem;
  constructor(vault: Vault, adapter: DataAdapter = vault.adapter) {
    this.promises = new VaultFileSystem(vault, adapter);
  }
}
class VaultFileSystem {
  constructor(
    private vault: Vault,
    private adapter: DataAdapter,
  ) {}

  async readFile(
    path: string,
    options?: { encoding?: string } | string,
  ): Promise<string | Uint8Array> {
    path = vaultPath(path);
    if (!(await this.adapter.exists(path))) throw fsError('ENOENT', path);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? this.adapter.read(path) : new Uint8Array(await this.adapter.readBinary(path));
  }
  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    path = vaultPath(path);
    if (!path) throw fsError('EISDIR', path);
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    if (parent) await this.mkdir(parent, { recursive: true });
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const buffer = arrayBuffer(bytes);
    const hidden = path.split('/').some((part) => part.startsWith('.'));
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.modifyBinary(file, buffer);
    } else if (hidden || (await this.adapter.exists(path))) {
      await this.adapter.writeBinary(path, buffer);
    } else {
      await this.vault.createBinary(path, buffer);
    }
  }
  async readdir(path: string): Promise<string[]> {
    path = vaultPath(path);
    if (!(await this.stat(path)).isDirectory()) throw fsError('ENOTDIR', path);
    const result = await this.adapter.list(path);
    return [...result.files, ...result.folders].map((child) =>
      child.slice(path ? path.length + 1 : 0),
    );
  }
  async mkdir(path: string, options?: { recursive?: boolean } | number): Promise<void> {
    path = vaultPath(path);
    const recursive = typeof options === 'object' && options.recursive;
    if (!path) return;
    if (await this.adapter.exists(path)) {
      if (recursive && (await this.stat(path)).isDirectory()) return;
      throw fsError('EEXIST', path);
    }
    const slash = path.lastIndexOf('/');
    if (slash >= 0) {
      const parent = path.slice(0, slash);
      if (recursive) await this.mkdir(parent, { recursive: true });
      else if (!(await this.adapter.exists(parent))) throw fsError('ENOENT', parent);
    }
    try {
      if (path.split('/').some((part) => part.startsWith('.'))) await this.adapter.mkdir(path);
      else await this.vault.createFolder(path);
    } catch (error) {
      if (!recursive || !(await this.adapter.exists(path))) throw error;
    }
  }
  async unlink(path: string): Promise<void> {
    path = vaultPath(path);
    const stat = await this.stat(path);
    if (stat.isDirectory()) throw fsError('EISDIR', path);
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.vault.delete(file);
    else await this.adapter.remove(path);
  }
  async rmdir(path: string): Promise<void> {
    path = vaultPath(path);
    if (!path) throw fsError('EPERM', path);
    if ((await this.readdir(path)).length) throw fsError('ENOTEMPTY', path);
    await this.adapter.rmdir(path, false);
  }
  async stat(path: string) {
    path = vaultPath(path);
    const stat = path
      ? await this.adapter.stat(path)
      : { type: 'folder', size: 0, mtime: 0, ctime: 0 };
    if (!stat) throw fsError('ENOENT', path);
    const directory = stat.type === 'folder';
    return {
      type: directory ? 'dir' : 'file',
      mode: directory ? 0o40755 : 0o100644,
      size: stat.size,
      mtimeMs: stat.mtime,
      ctimeMs: stat.ctime,
      mtime: new Date(stat.mtime),
      ctime: new Date(stat.ctime),
      dev: 1,
      ino: 0,
      uid: 0,
      gid: 0,
      isFile: () => !directory,
      isDirectory: () => directory,
      isSymbolicLink: () => false,
    };
  }
  lstat(path: string) {
    return this.stat(path);
  }
  async readlink(path: string): Promise<string> {
    throw fsError('ENOTSUP', path);
  }
  async symlink(_target: string, path: string): Promise<void> {
    throw fsError('ENOTSUP', path);
  }
  async chmod(path: string, _mode: number): Promise<void> {
    await this.stat(path);
  }
  async rename(from: string, to: string): Promise<void> {
    await this.adapter.rename(vaultPath(from), vaultPath(to));
  }
}
