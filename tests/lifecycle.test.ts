import type { App, PluginManifest } from 'obsidian';
import GitHubSyncPlugin from '../src/main';
import { fixture, Fixture } from './helpers/vault';
let f: Fixture;
let layoutReady: () => void;
let doc: { hidden: boolean; addEventListener: jest.Mock; removeEventListener: jest.Mock };
let plugin: GitHubSyncPlugin;
let offref: jest.Mock;
beforeEach(async () => {
  jest.useFakeTimers();
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
