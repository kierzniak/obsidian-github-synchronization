import { App, PluginSettingTab, Setting } from 'obsidian';
import type GitHubSyncPlugin from './main';
import type { SyncSettings } from './config';
import { showRepositorySetup } from './ui/repository-setup';

export class GitHubSyncSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private syncPlugin: GitHubSyncPlugin,
  ) {
    super(app, syncPlugin);
  }
  display(): void {
    const { containerEl } = this;
    const plugin = this.syncPlugin;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'GitHub synchronization' });
    const text = (
      key: 'repositoryUrl' | 'personalAccessToken' | 'branch' | 'authorName' | 'authorEmail',
      name: string,
      description: string,
    ) => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addText((input) => {
          if (key === 'personalAccessToken') input.inputEl.type = 'password';
          input.setValue(plugin.settings[key]).onChange(async (value) => {
            plugin.settings[key] = value.trim();
            await plugin.saveSettings();
          });
        });
    };
    text(
      'repositoryUrl',
      'Repository',
      'owner/repository or a GitHub HTTPS URL. Use a separate vault for a different repository.',
    );
    text(
      'personalAccessToken',
      'Personal access token',
      'Requires repository contents read/write access. Stored locally in plugin settings; never included in sync.',
    );
    text('branch', 'Branch', 'GitHub branch to import or sync, such as main.');
    void showRepositorySetup(containerEl.createDiv(), plugin);
    text('authorName', 'Author name', 'Name recorded in commits.');
    text('authorEmail', 'Author email', 'Email recorded in commits.');
    const toggle = (
      key: 'autoSyncEnabled' | 'pullOnStartup' | 'syncOnFileChange',
      name: string,
      description: string,
    ) => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addToggle((input) =>
          input.setValue(plugin.settings[key]).onChange(async (value) => {
            plugin.settings[key] = value;
            await plugin.saveSettings();
          }),
        );
    };
    toggle(
      'autoSyncEnabled',
      'Periodic sync',
      'Sync while Obsidian is open. Mobile background execution is not guaranteed.',
    );
    new Setting(containerEl)
      .setName('Sync interval')
      .setDesc('Minutes between syncs, from 1 to 1440.')
      .addText((input) =>
        input.setValue(String(plugin.settings.autoSyncInterval)).onChange(async (value) => {
          const minutes = Number(value);
          if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440) {
            plugin.settings.autoSyncInterval = minutes;
            await plugin.saveSettings();
          }
        }),
      );
    toggle(
      'pullOnStartup',
      'Pull on startup',
      'Save local edits as a commit, then receive remote changes after the vault is ready.',
    );
    toggle(
      'syncOnFileChange',
      'Sync after edits',
      'Sync after three seconds without edits and when returning to the app.',
    );
    new Setting(containerEl)
      .setName('Excluded files')
      .setDesc(
        'One glob pattern per line. Existing tracked files stay in Git history; exclusions never delete them.',
      )
      .addTextArea((input) =>
        input.setValue(plugin.settings.excludePatterns.join('\n')).onChange(async (value) => {
          plugin.settings.excludePatterns = value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
          await plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName('Text conflicts')
      .setDesc(
        'Keep independent edits from both devices. For overlapping edits, ask during manual sync or prefer a side. Binary conflicts stop safely.',
      )
      .addDropdown((input) =>
        input
          .addOption('manual', 'Ask me')
          .addOption('local', 'Prefer local edits')
          .addOption('remote', 'Prefer remote edits')
          .setValue(plugin.settings.conflictResolutionMode)
          .onChange(async (value) => {
            plugin.settings.conflictResolutionMode =
              value as SyncSettings['conflictResolutionMode'];
            await plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName('Test connection')
      .addButton((button) => button.setButtonText('Test').onClick(() => plugin.testConnection()));
    containerEl.createEl('p', {
      text: plugin.settings.lastSyncTime
        ? `Last successful transfer: ${new Date(plugin.settings.lastSyncTime).toLocaleString()}`
        : 'No successful transfer yet.',
    });
  }
}
