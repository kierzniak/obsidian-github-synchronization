import { App, Modal, Notice, Setting } from 'obsidian';

export class ConflictModal extends Modal {
  private answer: string | null = null;
  constructor(
    app: App,
    private path: string,
    private local: string,
    private remote: string,
    private merged: string,
    private finish: (answer: string | null) => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(`Resolve conflict: ${this.path}`);
    this.contentEl.createEl('p', {
      text: 'Both versions are saved in Git history. Edit the merged note or choose a version. Cancel leaves the sync unfinished.',
    });
    const editor = this.contentEl.createEl('textarea', { cls: 'github-sync-conflict-editor' });
    editor.value = this.merged;
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText('Use local').onClick(() => {
          editor.value = this.local;
        }),
      )
      .addButton((button) =>
        button.setButtonText('Use remote').onClick(() => {
          editor.value = this.remote;
        }),
      );
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText('Save resolution')
          .setCta()
          .onClick(() => {
            if (/^(<<<<<<<|=======|>>>>>>>)/m.test(editor.value)) {
              new Notice('Remove conflict markers before saving.');
              return;
            }
            this.answer = editor.value;
            this.close();
          }),
      );
  }
  onClose(): void {
    this.contentEl.empty();
    this.finish(this.answer);
  }
}
