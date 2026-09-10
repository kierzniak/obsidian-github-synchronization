import { AutoSync } from '../src/services/auto-sync';
import { loadSettings } from '../src/config';
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('debounces edits, honors live settings, and cleans up every timer', () => {
  const settings = loadSettings({
    syncOnFileChange: true,
    autoSyncEnabled: true,
    autoSyncInterval: 1,
  });
  const sync = jest.fn(async () => {});
  const scheduler = new AutoSync(() => settings, sync);
  scheduler.configure();
  scheduler.changed();
  jest.advanceTimersByTime(2000);
  scheduler.changed();
  jest.advanceTimersByTime(2999);
  expect(sync).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(sync).toHaveBeenCalledTimes(1);
  settings.syncOnFileChange = false;
  scheduler.configure();
  scheduler.changed();
  jest.advanceTimersByTime(60000);
  expect(sync).toHaveBeenCalledTimes(2);
  scheduler.stop();
  jest.advanceTimersByTime(120000);
  expect(sync).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
test('disabled synchronization installs no timer', () => {
  const scheduler = new AutoSync(
    () => loadSettings(null),
    jest.fn(async () => {}),
  );
  scheduler.configure();
  scheduler.changed();
  expect(jest.getTimerCount()).toBe(0);
  scheduler.stop();
});
