export class TFile {
  constructor(public path: string) {}
}
export class TFolder {
  constructor(public path: string) {}
}
export const requestUrl = jest.fn();
export class Notice {
  constructor(public message: string) {}
}
export class TestElement {
  children: TestElement[] = [];
  settings: Setting[] = [];
  text = '';
  empty() {
    this.children = [];
    this.settings = [];
  }
  createEl(_tag: string, options?: { text?: string }) {
    const child = new TestElement();
    child.text = options?.text || '';
    this.children.push(child);
    return child;
  }
  createDiv() {
    return this.createEl('div');
  }
}
export class PluginSettingTab {
  containerEl = new TestElement();
  constructor(_app: unknown, _plugin: unknown) {}
}
export class Plugin {
  app: any;
  private cleanups: Array<() => void> = [];
  constructor(app: any) {
    this.app = app;
  }
  async loadData() {
    return {};
  }
  async saveData(_data: unknown) {}
  addCommand(_command: unknown) {}
  addSettingTab(_tab: unknown) {}
  registerEvent(ref: unknown) {
    this.cleanups.push(() => this.app.vault.offref(ref));
  }
  registerDomEvent(element: any, name: string, callback: () => void) {
    element.addEventListener(name, callback);
    this.cleanups.push(() => element.removeEventListener(name, callback));
  }
  onunload() {}
  unload() {
    this.onunload();
    for (const cleanup of this.cleanups) cleanup();
  }
}
export class Modal {}
export class TestButton {
  label = '';
  disabled = false;
  primary = false;
  click: () => Promise<void> | void = () => {};
  setButtonText(value: string) {
    this.label = value;
    return this;
  }
  setDisabled(value: boolean) {
    this.disabled = value;
    return this;
  }
  setCta() {
    this.primary = true;
    return this;
  }
  onClick(callback: () => Promise<void> | void) {
    this.click = callback;
    return this;
  }
}
class TestInput {
  inputEl = { type: 'text' };
  setValue(_value: unknown) {
    return this;
  }
  onChange(_callback: unknown) {
    return this;
  }
  addOption(_value: string, _label: string) {
    return this;
  }
}
export class Setting {
  name = '';
  description = '';
  buttons: TestButton[] = [];
  constructor(container: TestElement) {
    container.settings.push(this);
  }
  setName(value: string) {
    this.name = value;
    return this;
  }
  setDesc(value: string) {
    this.description = value;
    return this;
  }
  addButton(callback: (button: TestButton) => unknown) {
    const button = new TestButton();
    this.buttons.push(button);
    callback(button);
    return this;
  }
  addText(callback: (input: TestInput) => unknown) {
    callback(new TestInput());
    return this;
  }
  addTextArea(callback: (input: TestInput) => unknown) {
    return this.addText(callback);
  }
  addToggle(callback: (input: TestInput) => unknown) {
    return this.addText(callback);
  }
  addDropdown(callback: (input: TestInput) => unknown) {
    return this.addText(callback);
  }
}
