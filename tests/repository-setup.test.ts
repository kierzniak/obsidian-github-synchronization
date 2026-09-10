import type { App } from 'obsidian';
import type GitHubSyncPlugin from '../src/main';
import { GitHubSyncSettingTab } from '../src/settings';
import { loadSettings } from '../src/config';
import { RepositorySetupActions, showRepositorySetup } from '../src/ui/repository-setup';
import { TestElement } from './helpers/obsidian';

const buttons = (element: TestElement) => element.settings.flatMap((setting) => setting.buttons);

test('empty vault settings expose import and initialization, without a premature sync button', async () => {
  const plugin = {
    settings: loadSettings(null),
    hasRepository: jest.fn(async () => false),
    run: jest.fn(async () => {}),
    testConnection: jest.fn(),
  };
  const tab = new GitHubSyncSettingTab({} as App, plugin as unknown as GitHubSyncPlugin);
  tab.display();
  await Promise.resolve();
  const root = tab.containerEl as unknown as TestElement;
  const setup = root.children.find((child) =>
    child.settings.some((setting) => setting.name === 'Import an existing GitHub repository'),
  )!;
  expect(setup).toBeDefined();
  expect(buttons(setup).map((button) => button.label)).toEqual([
    'Import repository',
    'Initialize repository',
  ]);
  await buttons(setup)[0].click();
  expect(plugin.run).toHaveBeenCalledWith('clone');
});

test('import disables both setup actions while running, then reveals Sync now after success', async () => {
  let ready = false;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const actions: RepositorySetupActions = {
    hasRepository: async () => ready,
    run: jest.fn(async () => {
      await pending;
      ready = true;
    }),
  };
  const element = new TestElement();
  await showRepositorySetup(element as unknown as HTMLElement, actions);
  const originalButtons = buttons(element);
  const importing = originalButtons[0].click();
  expect(originalButtons.map((button) => button.disabled)).toEqual([true, true]);
  expect(originalButtons[0].label).toBe('Importing…');
  finish();
  await importing;
  expect(buttons(element).map((button) => button.label)).toEqual(['Sync now']);
  await buttons(element)[0].click();
  expect(actions.run).toHaveBeenLastCalledWith('sync');
});

test('failed or cancelled setup restores the available import actions', async () => {
  const element = new TestElement();
  await showRepositorySetup(element as unknown as HTMLElement, {
    hasRepository: async () => false,
    run: async () => {}, // The plugin reports the error and leaves the vault uninitialized.
  });
  await buttons(element)[1].click();
  expect(buttons(element).map((button) => button.label)).toEqual([
    'Import repository',
    'Initialize repository',
  ]);
  expect(buttons(element).every((button) => !button.disabled)).toBe(true);
});

test('filesystem errors are shown instead of incorrectly offering an import', async () => {
  const element = new TestElement();
  await showRepositorySetup(element as unknown as HTMLElement, {
    hasRepository: async () => {
      throw new Error('Storage unavailable');
    },
    run: async () => {},
  });
  expect(buttons(element)).toEqual([]);
  expect(element.children.some((child) => child.text.includes('Storage unavailable'))).toBe(true);
});
