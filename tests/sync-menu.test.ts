import { createSyncMenu, lastSyncText } from '../src/ui/sync-menu';
import { Menu } from './helpers/obsidian';

test('quick sync menu shows the latest timestamp and runs manual sync', async () => {
  const sync = jest.fn(async () => {});
  const menu = createSyncMenu(1700000000000, false, sync) as unknown as Menu;
  expect(menu.items[0].title).toBe(lastSyncText(1700000000000));
  expect(menu.items[0].disabled).toBe(true);
  expect(menu.items[1].title).toBe('Sync now');
  expect(menu.items[1].disabled).toBe(false);
  await menu.items[1].click();
  expect(sync).toHaveBeenCalledTimes(1);
  const busy = createSyncMenu(0, true, sync) as unknown as Menu;
  expect(busy.items[0].title).toBe('Last sync: never');
  expect(busy.items[1].disabled).toBe(true);
  expect(busy.items[1].title).toBe('Syncing…');
});
