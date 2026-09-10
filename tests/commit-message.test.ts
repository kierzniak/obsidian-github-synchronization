import { commitMessage } from '../src/services/commit-message';
import { loadSettings } from '../src/config';

test('commit messages use a lowercase summary without a date', () => {
  expect(
    commitMessage([
      { path: 'a', type: 'modified' },
      { path: 'b', type: 'added' },
      { path: 'c', type: 'deleted' },
    ]),
  ).toBe('vault backup: 3 changed file(s)');
});
test('notification preferences migrate with background success enabled by default', () => {
  expect(loadSettings(null).syncNotifications).toBe('always');
  expect(loadSettings({ syncNotifications: 'off' }).syncNotifications).toBe('off');
  expect(loadSettings({ syncNotifications: 'manual' }).syncNotifications).toBe('manual');
  expect(loadSettings({ syncNotifications: 'invalid' as never }).syncNotifications).toBe('always');
});
