import { fixture, Fixture } from './helpers/vault';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f.cleanup();
});

test('preserves every possible byte for new and existing attachments and Git objects', async () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  for (const p of ['image.png', 'nested/attachment.pdf', '.git/objects/ab/object']) {
    await f.fs.promises.writeFile(p, bytes);
    expect(Array.from(await f.read(p))).toEqual(Array.from(bytes));
    await f.fs.promises.writeFile(p, bytes.subarray(32, 96));
    expect(Array.from(await f.read(p))).toEqual(Array.from(bytes.subarray(32, 96)));
    expect(await f.fs.promises.readFile(p)).toEqual(bytes.subarray(32, 96));
  }
});
test('normalizes root paths without chopping filenames and lists hidden metadata', async () => {
  await f.write('note.md', 'hello');
  await f.write('.git/HEAD', 'ref: refs/heads/main');
  for (const root of ['.', '/', ''])
    expect((await f.fs.promises.readdir(root)).sort()).toEqual(['.git', 'note.md']);
  expect(await f.fs.promises.readFile('./note.md', 'utf8')).toBe('hello');
});
test('rejects traversal and reports missing files with ENOENT', async () => {
  await expect(f.fs.promises.writeFile('../escape', 'bad')).rejects.toThrow('Invalid vault path');
  await expect(f.fs.promises.readFile('missing')).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(f.fs.promises.stat('missing')).rejects.toMatchObject({ code: 'ENOENT' });
});
test('recursive mkdir is idempotent, nonempty directories cannot be removed', async () => {
  await f.fs.promises.mkdir('notes/nested', { recursive: true });
  await f.fs.promises.mkdir('notes/nested', { recursive: true });
  await expect(f.fs.promises.rmdir('notes')).rejects.toMatchObject({ code: 'ENOTEMPTY' });
});
test('read failures retain their original cause rather than pretending a file is missing', async () => {
  await f.write('note.md', 'hi');
  jest
    .spyOn(f.adapter, 'readBinary')
    .mockRejectedValueOnce(new Error('Device storage unavailable'));
  await expect(f.fs.promises.readFile('note.md')).rejects.toThrow('Device storage unavailable');
});
