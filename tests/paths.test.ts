import { repositoryUrl, excluded, vaultPath } from '../src/paths';
import { loadSettings } from '../src/config';
test.each([
  'owner/repo.name',
  'https://github.com/owner/repo.name',
  'git@github.com:owner/repo.name.git',
])('normalizes supported repository syntax: %s', (input) => {
  expect(repositoryUrl(input)).toBe('https://github.com/owner/repo.name.git');
});
test.each([
  'http://github.com/a/b',
  'https://github.com.evil.invalid/a/b',
  'a/../b',
  'https://github.com/a/b/tree/main',
])('rejects ambiguous URLs: %s', (input) => {
  expect(() => repositoryUrl(input)).toThrow();
});
test('glob matching includes hidden files and always protects the local credentials', () => {
  expect(excluded('.obsidian/workspace.json', ['.obsidian/**'])).toBe(true);
  expect(excluded('.custom/plugins/obsidian-github-synchronization/data.json', [], '.custom')).toBe(
    true,
  );
  expect(vaultPath('./folder/note.md')).toBe('folder/note.md');
});
test('normalizes invalid timer settings and clones mutable defaults', () => {
  const a = loadSettings({ autoSyncInterval: -3 });
  const b = loadSettings(null);
  a.excludePatterns.push('private/**');
  expect(b.excludePatterns).not.toContain('private/**');
  expect(a.autoSyncInterval).toBe(5);
});
