import type { App, PluginManifest } from 'obsidian';
import GitHubSyncPlugin from '../src/main';
import { SyncService } from '../src/services/sync-service';
import { Notice } from './helpers/obsidian';
import { fixture, Fixture } from './helpers/vault';
let f: Fixture;
let layoutReady: () => void;
let doc: { hidden: boolean; addEventListener: jest.Mock; removeEventListener: jest.Mock };
let plugin: GitHubSyncPlugin;
let offref: jest.Mock;
beforeEach(async () => {
  jest.useFakeTimers();
  Notice.messages = [];
  f = await fixture();
  doc = { hidden: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
  offref = jest.fn();
  const app = {
    vault: { ...f.vault, on: jest.fn((name, callback) => ({ name, callback })), offref },
    workspace: {
      onLayoutReady: (callback: () => void) => {
        layoutReady = callback;
      },
    },
  };
  plugin = new GitHubSyncPlugin(app as unknown as App, {} as PluginManifest);
});
afterEach(async () => {
  plugin.unload();
  jest.restoreAllMocks();
  jest.useRealTimers();
  await f.cleanup();
  Reflect.deleteProperty(globalThis, 'document');
});
test('startup waits for vault readiness, preserves command IDs and cleans up timers/listeners', async () => {
  jest
    .spyOn(plugin, 'loadData')
    .mockResolvedValue({ ...f.settings, pullOnStartup: true, autoSyncEnabled: true });
  const run = jest.spyOn(plugin, 'run').mockResolvedValue();
  const command = jest.spyOn(plugin, 'addCommand');
  await plugin.onload();
  expect(run).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  layoutReady();
  expect(run).toHaveBeenCalledWith('pull', false);
  expect(jest.getTimerCount()).toBe(1);
  expect(command.mock.calls.map(([c]) => c.id)).toContain('github-sync-check-status');
  plugin.unload();
  expect(jest.getTimerCount()).toBe(0);
  expect(offref).toHaveBeenCalledTimes(4);
  expect(doc.removeEventListener).toHaveBeenCalledTimes(1);
});
test('an unloaded plugin cannot start later from a delayed layout-ready callback', async () => {
  jest
    .spyOn(plugin, 'loadData')
    .mockResolvedValue({ ...f.settings, pullOnStartup: true, autoSyncEnabled: true });
  const run = jest.spyOn(plugin, 'run').mockResolvedValue();
  await plugin.onload();
  plugin.unload();
  layoutReady();
  expect(run).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test.each([
  ['always', false, true],
  ['always', true, true],
  ['manual', false, false],
  ['manual', true, true],
  ['off', false, false],
  ['off', true, false],
] as const)(
  'success notifications: %s, interactive=%s',
  async (preference, interactive, expected) => {
    await plugin.onload();
    plugin.settings.syncNotifications = preference;
    jest
      .spyOn(SyncService.prototype, 'run')
      .mockResolvedValue({ message: 'Sync complete.', synced: true });
    await plugin.run('sync', interactive);
    expect(Notice.messages).toEqual(expected ? ['Sync complete.'] : []);
  },
);
test('disabled success notifications still show failures and requested status', async () => {
  await plugin.onload();
  plugin.settings.syncNotifications = 'off';
  const operation = jest
    .spyOn(SyncService.prototype, 'run')
    .mockRejectedValue(new Error('Offline'));
  await plugin.run('sync', false);
  expect(Notice.messages).toEqual(['GitHub sync: Offline']);
  operation.mockResolvedValue({ message: 'No uncommitted changes.', synced: false });
  await plugin.run('status');
  expect(Notice.messages[1]).toBe('No uncommitted changes.');
});
test('registers the quick sync ribbon and retains the direct sync command', async () => {
  const ribbon = jest.spyOn(plugin, 'addRibbonIcon');
  const commands = jest.spyOn(plugin, 'addCommand');
  await plugin.onload();
  expect(ribbon).toHaveBeenCalledWith('refresh-cw', 'GitHub synchronization', expect.any(Function));
  expect(commands.mock.calls.some(([command]) => command.id === 'github-sync-sync')).toBe(true);
});
