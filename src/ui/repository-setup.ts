import { Setting } from 'obsidian';
import { errorMessage } from '../paths';

export interface RepositorySetupActions {
  hasRepository(): Promise<boolean>;
  run(operation: 'clone' | 'init' | 'sync'): Promise<void>;
}

/** Show import and setup actions in desktop and mobile settings. */
export async function showRepositorySetup(
  container: HTMLElement,
  actions: RepositorySetupActions,
): Promise<void> {
  container.empty();
  container.createEl('h3', { text: 'Repository setup' });
  let ready: boolean;
  try {
    ready = await actions.hasRepository();
  } catch (error) {
    container.createEl('p', { text: `Could not check this vault: ${errorMessage(error)}` });
    return;
  }

  const buttons: Array<{ setDisabled(disabled: boolean): unknown }> = [];
  const action = (
    name: string,
    description: string,
    label: string,
    progress: string,
    operation: 'clone' | 'init' | 'sync',
    primary = false,
  ) => {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addButton((button) => {
        buttons.push(button);
        button.setButtonText(label);
        if (primary) button.setCta();
        button.onClick(async () => {
          buttons.forEach((item) => item.setDisabled(true));
          button.setButtonText(progress);
          try {
            await actions.run(operation);
          } finally {
            await showRepositorySetup(container, actions);
          }
        });
      });
  };

  if (ready) {
    action(
      'Repository ready',
      'Save local edits, receive changes from GitHub, then upload your changes.',
      'Sync now',
      'Syncing…',
      'sync',
      true,
    );
    return;
  }

  container.createEl('p', {
    text: 'Entering a repository address does not download its notes. Choose how to set up this vault below.',
  });
  action(
    'Import an existing GitHub repository',
    'Download the repository entered above into an empty vault. Obsidian settings are kept. If this vault contains notes, create a new vault first.',
    'Import repository',
    'Importing…',
    'clone',
    true,
  );
  action(
    'Connect local notes to a new repository',
    'Use this when your notes are already in this vault and the GitHub repository is empty. Initialize first, then select Sync now to upload.',
    'Initialize repository',
    'Initializing…',
    'init',
  );
}
