import git from 'isomorphic-git';
import { fixture, Fixture } from './helpers/vault';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
  await f.repo().initialize();
});
afterEach(async () => {
  await f.cleanup();
});
async function diverge(
  base: Record<string, string | Uint8Array>,
  remote: Record<string, string | Uint8Array>,
  local: Record<string, string | Uint8Array>,
) {
  await f.commit(base);
  await git.branch({ ...f.options, ref: 'remote-fixture' });
  await git.checkout({ ...f.options, ref: 'remote-fixture' });
  const remoteOid = await f.commit(remote);
  await git.checkout({ ...f.options, ref: 'main' });
  const localOid = await f.commit(local);
  return { remoteOid, localOid };
}
test('merges independent edits with a real Git history and updates the branch after checkout', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'note.md': 'one\ntwo\nthree\n' },
    { 'note.md': 'ONE\ntwo\nthree\n' },
    { 'note.md': 'one\ntwo\nTHREE\n' },
  );
  expect(await f.repo().mergeRemote(localOid, remoteOid)).toBe(1);
  expect((await f.read('note.md')).toString()).toBe('ONE\ntwo\nTHREE\n');
  expect(await git.currentBranch(f.options)).toBe('main');
  expect(await f.repo().changes()).toEqual([]);
});
test('an unresolved text conflict preserves local notes and both committed versions', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'note.md': 'base\n' },
    { 'note.md': 'remote\n' },
    { 'note.md': 'local\n' },
  );
  await expect(f.repo().mergeRemote(localOid, remoteOid)).rejects.toThrow('Resolve conflicting');
  expect(await f.repo().head()).toBe(localOid);
  expect((await f.read('note.md')).toString()).toBe('local\n');
  expect((await git.readCommit({ ...f.options, oid: remoteOid })).oid).toBe(remoteOid);
});
test.each(['local', 'remote'] as const)(
  'automatic %s resolution retains independent edits',
  async (mode) => {
    f.settings.conflictResolutionMode = mode;
    const { localOid, remoteOid } = await diverge(
      { 'note.md': 'base\nseparator\nend\n' },
      { 'note.md': 'remote\nseparator\nEND\n' },
      { 'note.md': 'local\nseparator\nend\n' },
    );
    await f.repo().mergeRemote(localOid, remoteOid);
    expect((await f.read('note.md')).toString()).toBe(`${mode}\nseparator\nEND\n`);
  },
);
test('manual resolution writes the actual selected content and commits both parents', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'note.md': 'base' },
    { 'note.md': 'remote' },
    { 'note.md': 'local' },
  );
  await f.repo().mergeRemote(localOid, remoteOid, async () => 'resolved');
  expect((await f.read('note.md')).toString()).toBe('resolved');
  expect((await git.log(f.options))[0].commit.parent).toEqual([localOid, remoteOid]);
});
test('edits made while resolving are preserved and abort checkout', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'note.md': 'base' },
    { 'note.md': 'remote' },
    { 'note.md': 'local' },
  );
  await expect(
    f.repo().mergeRemote(localOid, remoteOid, async () => {
      await f.write('note.md', 'new unsaved-to-git edit');
      return 'resolved';
    }),
  ).rejects.toThrow('Notes changed');
  expect((await f.read('note.md')).toString()).toBe('new unsaved-to-git edit');
  expect(await f.repo().head()).toBe(localOid);
});
test('binary conflicts never pass through a text decoder for merging', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'image.png': Uint8Array.of(137, 0, 1) },
    { 'image.png': Uint8Array.of(137, 0, 2) },
    { 'image.png': Uint8Array.of(137, 0, 3) },
  );
  await expect(f.repo().mergeRemote(localOid, remoteOid)).rejects.toThrow('Binary conflict');
  expect(Array.from(await f.read('image.png'))).toEqual([137, 0, 3]);
  expect(await f.repo().head()).toBe(localOid);
});
test('remote modifications to excluded files stop without changing local files or HEAD', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'private.md': 'keep', 'note.md': 'base' },
    { 'private.md': 'remote private' },
    { 'note.md': 'local' },
  );
  f.settings.excludePatterns = ['private.md'];
  await expect(f.repo().mergeRemote(localOid, remoteOid)).rejects.toThrow('excluded files');
  expect((await f.read('private.md')).toString()).toBe('keep');
  expect(await f.repo().head()).toBe(localOid);
});
test('fast-forward pulls preserve binary attachments exactly', async () => {
  const local = await f.commit({ 'note.md': 'base' });
  await git.branch({ ...f.options, ref: 'remote-fixture' });
  await git.checkout({ ...f.options, ref: 'remote-fixture' });
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const remote = await f.commit({ 'image.png': bytes });
  await git.checkout({ ...f.options, ref: 'main' });
  await f.repo().mergeRemote(local, remote);
  expect(Array.from(await f.read('image.png'))).toEqual(Array.from(bytes));
});

test('recovers a checkout interrupted after writing notes but before updating the branch', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'note.md': 'base', 'remote.md': 'base' },
    { 'remote.md': 'new remote text' },
    { 'note.md': 'local' },
  );
  jest.spyOn(git, 'writeRef').mockRejectedValueOnce(new Error('Device suspended'));
  await expect(f.repo().mergeRemote(localOid, remoteOid)).rejects.toThrow('Device suspended');
  expect(await f.repo().head()).toBe(localOid);
  jest.restoreAllMocks();
  await f.repo().prepare();
  expect((await f.read('remote.md')).toString()).toBe('new remote text');
  expect(await f.repo().changes()).toEqual([]);
  await expect(f.fs.promises.stat('.git/obsidian-sync-checkout.json')).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
test('recovery preserves edits made after a failed checkout instead of overwriting them', async () => {
  const { localOid, remoteOid } = await diverge(
    { 'note.md': 'base', 'remote.md': 'base' },
    { 'remote.md': 'new remote text' },
    { 'note.md': 'local' },
  );
  jest.spyOn(git, 'writeRef').mockRejectedValueOnce(new Error('Device suspended'));
  await expect(f.repo().mergeRemote(localOid, remoteOid)).rejects.toThrow('Device suspended');
  jest.restoreAllMocks();
  await f.write('remote.md', 'new user edit after failure');
  await expect(f.repo().prepare()).rejects.toThrow('New edits');
  expect((await f.read('remote.md')).toString()).toBe('new user edit after failure');
});
