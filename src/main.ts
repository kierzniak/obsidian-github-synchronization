import { Notice, Plugin, TAbstractFile } from 'obsidian';
import { DEFAULT_SETTINGS, loadSettings, SyncSettings } from './config';
import { excluded, errorMessage } from './paths';
import { GitHubSyncSettingTab } from './settings';
import { AutoSync } from './services/auto-sync';
import { testConnection } from './services/github-api';
import { ObsidianFSAdapter } from './services/obsidian-fs-adapter';
import { Operation, SyncService } from './services/sync-service';
import { ConflictModal } from './ui/conflict-modal';

export default class GitHubSyncPlugin extends Plugin {
  settings: SyncSettings = loadSettings(DEFAULT_SETTINGS);
  private sync!: SyncService;
  private scheduler!: AutoSync;
  private modals = new Set<ConflictModal>();
  private dirtyDuringSync = false;
  private lastAutoError = '';
  private unloaded = false;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.sync = new SyncService(
      () => this.settings,
      new ObsidianFSAdapter(this.app.vault),
      this.app.vault.configDir,
      (path, local, remote, merged) =>
        new Promise((resolve) => {
          const modal = new ConflictModal(this.app, path, local, remote, merged, (answer) => {
            this.modals.delete(modal);
            resolve(answer);
          });
          this.modals.add(modal);
          modal.open();
        }),
      async () => {
        this.settings.lastSyncTime = Date.now();
        await this.saveSettings(false);
      },
    );
    this.scheduler = new AutoSync(
      () => this.settings,
      () => this.run('sync', false),
    );
    this.addSettingTab(new GitHubSyncSettingTab(this.app, this));
    const commands: Array<[string, string, Operation]> = [
      ['clone', 'Clone repository', 'clone'],
      ['pull', 'Pull from GitHub', 'pull'],
      ['commit', 'Commit changes', 'commit'],
      ['push', 'Push to GitHub', 'push'],
      ['sync', 'Sync with GitHub', 'sync'],
      ['check-status', 'Check sync status', 'status'],
      ['view-history', 'View commit history', 'history'],
      ['init', 'Initialize repository', 'init'],
    ];
    for (const [id, name, operation] of commands)
      this.addCommand({ id: `github-sync-${id}`, name, callback: () => this.run(operation) });
    const changed = (file: TAbstractFile, oldPath?: string) => {
      if (
        excluded(file.path, this.settings.excludePatterns, this.app.vault.configDir) &&
        (!oldPath || excluded(oldPath, this.settings.excludePatterns, this.app.vault.configDir))
      )
        return;
      if (this.sync.busy) this.dirtyDuringSync = true;
      else this.scheduler.changed();
    };
    this.registerEvent(this.app.vault.on('create', changed));
    this.registerEvent(this.app.vault.on('modify', changed));
    this.registerEvent(this.app.vault.on('delete', changed));
    this.registerEvent(this.app.vault.on('rename', changed));
    this.registerDomEvent(document, 'visibilitychange', () => {
      if (!document.hidden && (this.settings.autoSyncEnabled || this.settings.syncOnFileChange))
        void this.run('sync', false);
    });
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) return;
      this.scheduler.configure();
      if (this.settings.pullOnStartup) void this.run('pull', false);
    });
  }
  onunload(): void {
    this.unloaded = true;
    this.scheduler?.stop();
    this.sync?.stop();
    for (const modal of this.modals) modal.close();
  }
  async saveSettings(reconfigure = true): Promise<void> {
    await this.saveData(this.settings);
    if (reconfigure) this.scheduler?.configure();
  }
  async run(operation: Operation, interactive = true): Promise<void> {
    if (this.unloaded || (!interactive && document.hidden)) return;
    try {
      const result = await this.sync.run(operation, interactive);
      if (!result) return;
      this.lastAutoError = '';
      if (interactive)
        new Notice(
          result.message,
          operation === 'history' || operation === 'status' ? 15000 : 6000,
        );
    } catch (error) {
      const message = errorMessage(error);
      if (interactive || message !== this.lastAutoError)
        new Notice(`GitHub sync: ${message}`, 10000);
      if (!interactive) this.lastAutoError = message;
    } finally {
      if (!this.sync.busy && this.dirtyDuringSync) {
        this.dirtyDuringSync = false;
        this.scheduler.changed();
      }
    }
  }
  async testConnection(): Promise<void> {
    try {
      await testConnection({ ...this.settings });
      new Notice('GitHub connection successful.');
    } catch (error) {
      new Notice(errorMessage(error), 10000);
    }
  }
}
