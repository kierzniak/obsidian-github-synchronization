import { SyncSettings } from '../config';
import { ResolveConflict } from './conflict-resolver';
import { GitRepository } from './git-repository';
import { ObsidianFSAdapter } from './obsidian-fs-adapter';

export type Operation =
  | 'sync'
  | 'pull'
  | 'push'
  | 'commit'
  | 'clone'
  | 'init'
  | 'status'
  | 'history';
export interface OperationResult {
  message: string;
  synced: boolean;
}
/** Serialize every command, including status, because Git may refresh the index. */
export class SyncService {
  private running = false;
  private stopped = false;
  get busy(): boolean {
    return this.running;
  }
  constructor(
    private settings: () => SyncSettings,
    private fs: ObsidianFSAdapter,
    private configDir: string,
    private resolve: ResolveConflict,
    private completed: () => Promise<void>,
  ) {}
  stop(): void {
    this.stopped = true;
  }
  async run(operation: Operation, interactive = true): Promise<OperationResult | null> {
    if (this.stopped) return null;
    if (this.running) {
      if (interactive) throw new Error('A sync operation is already running.');
      return null;
    }
    this.running = true;
    try {
      const settings = {
        ...this.settings(),
        excludePatterns: [...this.settings().excludePatterns],
      };
      const repo = new GitRepository(this.fs, settings, this.configDir, () => this.stopped);
      if (operation === 'init') {
        await repo.initialize();
        return { message: 'Repository initialized.', synced: false };
      }
      if (operation === 'clone') {
        await repo.clone();
        return { message: 'Repository cloned.', synced: false };
      }
      await repo.prepare();
      if (operation === 'status') {
        const changes = await repo.changes();
        return {
          message: changes.length
            ? changes.map((change) => `${change.type}: ${change.path}`).join('\n')
            : 'No uncommitted changes.',
          synced: false,
        };
      }
      if (operation === 'history') return { message: await repo.history(), synced: false };
      const committed = await repo.commit();
      if (operation === 'commit')
        return {
          message: committed ? `Committed ${committed} changed file(s).` : 'No changes to commit.',
          synced: false,
        };
      if (this.stopped) return null;
      let received = 0;
      if (operation === 'pull' || operation === 'sync')
        received = await repo.pull(interactive ? this.resolve : undefined);
      if (this.stopped) return null;
      if (operation === 'push' || operation === 'sync') await repo.push();
      // Update the timestamp only if these settings still describe the completed transfer.
      if (
        settings.repositoryUrl === this.settings().repositoryUrl &&
        settings.branch === this.settings().branch
      )
        await this.completed();
      return {
        message: `${operation === 'pull' ? 'Pull' : operation === 'push' ? 'Push' : 'Sync'} complete. ${committed} committed, ${received} received.`,
        synced: true,
      };
    } finally {
      this.running = false;
    }
  }
}
