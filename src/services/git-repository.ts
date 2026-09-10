import git from 'isomorphic-git';
import type { SyncSettings } from '../config';
import { excluded, repositoryUrl } from '../paths';
import { ObsidianFSAdapter } from './obsidian-fs-adapter';
import { mergeDriver, ResolveConflict, SyncConflict } from './conflict-resolver';
import http from './http';
import { commitMessage } from './commit-message';
import { Change, getChanges, changedFiles } from './git-changes';
import { Checkout } from './checkout';

/** One immutable configuration per operation; no cached token or remote. */
export class GitRepository {
  private readonly options;
  private readonly url: string;
  constructor(
    readonly fs: ObsidianFSAdapter,
    readonly settings: SyncSettings,
    private configDir = '.obsidian',
    private cancelled: () => boolean = () => false,
  ) {
    this.options = { fs, dir: '.' };
    this.url = repositoryUrl(settings.repositoryUrl);
    const branch = settings.branch;
    if (
      !branch ||
      /[\s~^:?*[\\]/.test(branch) ||
      [...branch].some((char) => char.charCodeAt(0) < 32) ||
      branch.includes('..') ||
      branch.includes('@{') ||
      branch.includes('//') ||
      /(^[/.]|[/.]$|\.lock(?:\/|$))/.test(branch)
    ) {
      throw new Error('Enter a valid Git branch name.');
    }
  }
  private get author() {
    return {
      name: this.settings.authorName.trim() || 'Obsidian',
      email: this.settings.authorEmail.trim() || 'obsidian@localhost',
    };
  }
  private get network() {
    const token = this.settings.personalAccessToken.trim();
    if (!token) throw new Error('Enter a personal access token.');
    return {
      http,
      url: this.url,
      onAuth: (url: string) => {
        if (new URL(url).origin !== 'https://github.com')
          throw new Error('Refusing to send the token outside GitHub.');
        return { username: token, password: 'x-oauth-basic' };
      },
    };
  }
  private ensureActive(): void {
    if (this.cancelled()) throw new Error('Sync stopped because the plugin was unloaded.');
  }
  private ignores(path: string) {
    return excluded(path, this.settings.excludePatterns, this.configDir);
  }
  async exists(): Promise<boolean> {
    try {
      await this.fs.promises.stat('.git');
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return false;
      throw error;
    }
  }
  async prepare(): Promise<void> {
    if (!(await this.exists()))
      throw new Error(
        'Open GitHub Synchronization settings and select Import repository to download an existing repository, or Initialize repository for local notes.',
      );
    const branch = await git.currentBranch(this.options);
    if (branch !== this.settings.branch)
      throw new Error(
        `The vault is on branch ${branch || '(detached)'}. Select that branch in settings before syncing.`,
      );
    for (const path of [
      '.git/MERGE_HEAD',
      '.git/CHERRY_PICK_HEAD',
      '.git/REVERT_HEAD',
      '.git/rebase-merge',
      '.git/rebase-apply',
    ]) {
      try {
        await this.fs.promises.stat(path);
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') continue;
        throw error;
      }
      throw new Error('Finish the existing Git merge, rebase, or cherry-pick before syncing.');
    }
    const remotes = await git.listRemotes(this.options);
    const origin = remotes.find((remote) => remote.remote === 'origin');
    if (!origin || repositoryUrl(origin.url).toLowerCase() !== this.url.toLowerCase())
      throw new Error(
        'The configured repository differs from this vault’s Git remote. Use a separate vault for another repository.',
      );
    await new Checkout(this.fs, this.settings.branch).resume();
  }
  async initialize(): Promise<void> {
    if (await this.exists()) {
      await this.prepare();
      return;
    }
    await git.init({ ...this.options, defaultBranch: this.settings.branch });
    await git.addRemote({ ...this.options, remote: 'origin', url: this.url });
  }
  async clone(): Promise<void> {
    if (await this.exists()) throw new Error('A Git repository already exists in this vault.');
    const entries = await this.fs.promises.readdir('.');
    if (entries.some((path) => ![this.configDir, '.trash', '.DS_Store'].includes(path)))
      throw new Error('Clone into an empty vault to protect existing notes.');
    // Download history before touching notes. A failed clone is left for inspection, never deleted automatically.
    await git.clone({
      ...this.options,
      ...this.network,
      ref: this.settings.branch,
      singleBranch: true,
      noCheckout: true,
    });
    this.ensureActive();
    const files = await git.listFiles({ ...this.options, ref: 'HEAD' });
    const allowed = files.filter((path) => !this.ignores(path));
    if (allowed.length)
      await git.checkout({ ...this.options, ref: this.settings.branch, filepaths: allowed });
    // Keep skipped tracked files in the index without writing them over local configuration.
    await git.walk({
      ...this.options,
      trees: [git.TREE({ ref: 'HEAD' })],
      map: async (path, [entry]) => {
        if (this.ignores(path) && (await entry?.type()) === 'blob') {
          await git.updateIndex({
            ...this.options,
            filepath: path,
            oid: await entry!.oid(),
            mode: await entry!.mode(),
            add: true,
          });
        }
      },
    });
  }
  async changes(): Promise<Change[]> {
    return getChanges(this.fs, this.settings, this.configDir, await this.head());
  }
  async commit(): Promise<number> {
    const changes = await this.changes();
    if (!changes.length) return 0;
    for (const change of changes) {
      const options = { ...this.options, filepath: change.path };
      if (change.type === 'deleted') await git.remove(options);
      else await git.add(options);
    }
    await git.commit({
      ...this.options,
      message: commitMessage(changes),
      author: this.author,
    });
    return changes.length;
  }
  async head(): Promise<string | null> {
    try {
      return await git.resolveRef({ ...this.options, ref: 'HEAD' });
    } catch (error) {
      if ((error as { code?: string }).code === 'NotFoundError') return null;
      throw error;
    }
  }
  /** Never let a text merge decode a binary attachment. Both versions remain in Git history. */
  private async checkBinaryConflicts(local: string, remote: string): Promise<void> {
    const bases = await git.findMergeBase({ ...this.options, oids: [local, remote] });
    if (!bases.length)
      throw new Error(
        'Local and remote repositories have unrelated histories. Clone into a separate vault.',
      );
    const base = bases[0];
    const localChanges = new Set(await changedFiles(this.fs, base, local));
    const overlapping = (await changedFiles(this.fs, base, remote)).filter((path) =>
      localChanges.has(path),
    );
    for (const path of overlapping) {
      const versions = await Promise.all(
        [local, remote].map(async (oid) => {
          try {
            return await git.readBlob({ ...this.options, oid, filepath: path });
          } catch (error) {
            if ((error as { code?: string }).code === 'NotFoundError') return null;
            throw error;
          }
        }),
      );
      if (versions[0]?.oid === versions[1]?.oid) continue;
      for (const oid of [local, remote, base]) {
        try {
          const { blob } = await git.readBlob({ ...this.options, oid, filepath: path });
          try {
            if (blob.includes(0)) throw new Error('Binary');
            new TextDecoder('utf-8', { fatal: true }).decode(blob);
          } catch {
            throw new SyncConflict(
              `Binary conflict in ${path}. Both versions are saved in Git; resolve it with a Git client before syncing.`,
              [path],
            );
          }
        } catch (error) {
          if ((error as { code?: string }).code === 'NotFoundError') continue;
          throw error;
        }
      }
    }
  }
  async pull(resolve?: ResolveConflict): Promise<number> {
    const local = await this.head();
    if (!local)
      throw new Error(
        'This repository has no local commit. Clone the existing repository into an empty vault.',
      );
    const fetched = await git.fetch({
      ...this.options,
      ...this.network,
      ref: this.settings.branch,
      singleBranch: true,
      remote: 'origin',
    });
    if (!fetched.fetchHead) return 0; // An empty remote can be seeded by the subsequent push.
    this.ensureActive();
    return this.mergeRemote(local, fetched.fetchHead, resolve);
  }
  /** Separated from transport so real Git histories can be tested entirely offline. */
  async mergeRemote(local: string, remote: string, resolve?: ResolveConflict): Promise<number> {
    if (local === remote) return 0;
    await this.checkBinaryConflicts(local, remote);
    const result = await git.merge({
      ...this.options,
      ours: local,
      theirs: remote,
      noUpdateBranch: true,
      abortOnConflict: true,
      author: this.author,
      mergeDriver: mergeDriver(this.settings.conflictResolutionMode, resolve),
    });
    if (!result.oid) throw new Error('Git did not return a merged commit.');
    const files = await changedFiles(this.fs, local, result.oid);
    const blocked = files.filter((path) => this.ignores(path));
    if (blocked.length)
      throw new Error(
        `Remote changes touch excluded files: ${blocked.join(', ')}. Resolve those files with a Git client before syncing.`,
      );
    if (!files.length && result.oid === local) return 0;
    // Check for edits made while fetching/resolving. Never force a checkout over new edits.
    if ((await this.changes()).length)
      throw new Error('Notes changed during sync. Your edits are intact; sync again.');
    if ((await this.head()) !== local)
      throw new Error(
        'Git history changed during sync. Sync again after the other Git operation finishes.',
      );
    this.ensureActive();
    await new Checkout(this.fs, this.settings.branch).apply(local, result.oid);
    return files.length;
  }
  async push(): Promise<void> {
    const result = await git.push({
      ...this.options,
      ...this.network,
      ref: this.settings.branch,
      remote: 'origin',
      force: false,
    });
    if (!result.ok || Object.values(result.refs).some((ref) => !ref.ok))
      throw new Error(
        result.error || 'GitHub rejected the push. Pull and resolve remote changes first.',
      );
  }
  async history(): Promise<string> {
    const entries = await git.log({ ...this.options, depth: 10 });
    return entries
      .map((entry) => `${entry.oid.slice(0, 7)}  ${entry.commit.message.trim()}`)
      .join('\n');
  }
}
