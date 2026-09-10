import { SyncSettings } from '../config';

/** One timer for interval sync and one debounce for edits; stopped on unload. */
export class AutoSync {
  private interval: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private active = true;
  constructor(
    private settings: () => SyncSettings,
    private sync: () => Promise<void>,
  ) {}
  configure(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.debounce) clearTimeout(this.debounce);
    this.interval = undefined;
    this.debounce = undefined;
    if (this.active && this.settings().autoSyncEnabled) {
      this.interval = setInterval(() => {
        void this.sync();
      }, this.settings().autoSyncInterval * 60000);
    }
  }
  changed(): void {
    if (!this.active || !this.settings().syncOnFileChange) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = undefined;
      void this.sync();
    }, 3000);
  }
  stop(): void {
    this.active = false;
    this.configure();
  }
}
