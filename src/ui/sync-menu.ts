import { Menu } from 'obsidian';

export function lastSyncText(time: number): string {
  return time ? `Last sync: ${new Date(time).toLocaleString()}` : 'Last sync: never';
}

export function createSyncMenu(time: number, busy: boolean, sync: () => Promise<void>): Menu {
  return new Menu()
    .addItem((item) => item.setTitle(lastSyncText(time)).setDisabled(true))
    .addSeparator()
    .addItem((item) =>
      item
        .setTitle(busy ? 'Syncing…' : 'Sync now')
        .setIcon('refresh-cw')
        .setDisabled(busy)
        .onClick(sync),
    );
}
