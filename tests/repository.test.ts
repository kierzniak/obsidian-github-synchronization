import git from 'isomorphic-git';
import { fixture, Fixture } from './helpers/vault';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
  await f.repo().initialize();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await f.cleanup();
});

test('commits adds, edits and deletions with the configured author', async () => {
  await f.write('note.md', 'one');
  expect(await f.repo().commit()).toBe(1);
  await f.write('note.md', 'two');
  expect(await f.repo().commit()).toBe(1);
  await f.fs.promises.unlink('note.md');
  expect(await f.repo().commit()).toBe(1);
  expect(await f.repo().changes()).toEqual([]);
  expect((await git.log(f.options))[0].commit.author.email).toBe('test@example.invalid');
});
test('excluded tracked files are not mistaken for deletions or committed', async () => {
  await f.commit({ 'private/note.md': 'private', 'normal.md': 'normal' });
  f.settings.excludePatterns = ['private/**'];
  await f.write('private/note.md', 'changed privately');
  await f.write('normal.md', 'changed');
  expect(await f.repo().changes()).toEqual([{ path: 'normal.md', type: 'modified' }]);
  await f.repo().commit();
  const head = (await f.repo().head())!;
  expect(
    new TextDecoder().decode(
      (await git.readBlob({ ...f.options, oid: head, filepath: 'private/note.md' })).blob,
    ),
  ).toBe('private');
  expect((await f.read('private/note.md')).toString()).toBe('changed privately');
});
test('rejects already-staged excluded content to prevent leaking it in another commit', async () => {
  await f.commit({ 'private.md': 'original' });
  await f.write('private.md', 'private edit');
  await git.add({ ...f.options, filepath: 'private.md' });
  f.settings.excludePatterns = ['private.md'];
  await expect(f.repo().commit()).rejects.toThrow('Excluded file is already staged');
});
test('always excludes local credentials even when exclusions are empty', async () => {
  f.settings.excludePatterns = [];
  await f.write(
    '.obsidian/plugins/obsidian-github-synchronization/data.json',
    '{"personalAccessToken":"secret"}',
  );
  expect(await f.repo().changes()).toEqual([]);
});
test('new settings take effect immediately, and mismatched repository/branch fail safely', async () => {
  await f.commit({ 'note.md': 'initial' });
  f.settings.repositoryUrl = 'other/repository';
  await expect(f.repo().prepare()).rejects.toThrow('differs');
  f.settings.repositoryUrl = 'test/notes';
  f.settings.branch = 'wrong';
  await expect(f.repo().prepare()).rejects.toThrow('vault is on branch');
});
test('clone guards detect hidden Git metadata and existing notes', async () => {
  await expect(f.repo().clone()).rejects.toThrow('already exists');
  const other = await fixture();
  try {
    await other.write('precious.md', 'keep');
    await expect(other.repo().clone()).rejects.toThrow('empty vault');
  } finally {
    await other.cleanup();
  }
});
test('oversized changes fail visibly instead of silently claiming a backup', async () => {
  f.settings.maxFileSize = 2;
  await f.write('large.md', 'too large');
  await expect(f.repo().commit()).rejects.toThrow('size limit');
});
test('a server-side rejected push is not reported as successful', async () => {
  jest.spyOn(git, 'push').mockResolvedValueOnce({ ok: false, error: 'protected branch', refs: {} });
  await expect(f.repo().push()).rejects.toThrow('protected branch');
});
test('uses the current token only for github.com', async () => {
  f.settings.personalAccessToken = 'replacement-token';
  const push = jest.spyOn(git, 'push').mockResolvedValueOnce({ ok: true, error: null, refs: {} });
  await f.repo().push();
  const auth = push.mock.calls[0][0].onAuth!;
  expect(await auth('https://github.com/test/notes.git', {})).toMatchObject({
    username: 'replacement-token',
  });
  expect(() => auth('https://elsewhere.invalid/repo', {})).toThrow('outside GitHub');
});
