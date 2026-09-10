import { commitMessage } from '../src/services/commit-message';
import { loadSettings } from '../src/config';

test('commit messages match the detailed desktop history format with UTC timestamps', () => {
  expect(
    commitMessage(
      [
        { path: 'a', type: 'modified' },
        { path: 'b', type: 'added' },
        { path: 'c', type: 'deleted' },
        { path: 'd', type: 'modified' },
      ],
      new Date('2026-09-10T12:00:00Z'),
    ),
  ).toBe(
    'vault backup: Added 1 file(s), Modified 2 file(s), Deleted 1 file(s) - 2026-09-10T12:00:00.000Z',
  );
});
test('notification preferences migrate with background success enabled by default', () => {
  expect(loadSettings(null).syncNotifications).toBe('always');
  expect(loadSettings({ syncNotifications: 'off' }).syncNotifications).toBe('off');
  expect(loadSettings({ syncNotifications: 'manual' }).syncNotifications).toBe('manual');
  expect(loadSettings({ syncNotifications: 'invalid' as never }).syncNotifications).toBe('always');
});
