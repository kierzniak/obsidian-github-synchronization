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
export class PluginSettingTab {}
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
export class Setting {}
