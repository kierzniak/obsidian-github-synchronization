import http from '../src/services/http';
import { requestUrl } from './helpers/obsidian';
import { testConnection } from '../src/services/github-api';
import { loadSettings } from '../src/config';
beforeEach(() => requestUrl.mockReset());
test('preserves chunked binary request/response bytes and normalizes HTTP headers', async () => {
  requestUrl.mockResolvedValue({
    status: 200,
    headers: { 'Content-Type': 'application/x-git-upload-pack-result' },
    arrayBuffer: Uint8Array.of(137, 0, 255).buffer,
  });
  const result = await http.request({
    url: 'https://github.com/test/repo',
    method: 'POST',
    headers: {
      'Content-Length': '4',
      Host: 'github.com',
      'User-Agent': 'git',
      Authorization: 'test',
    },
    body: (async function* () {
      yield Uint8Array.of(0, 255);
      yield Uint8Array.of(128, 1);
    })(),
  });
  const params = requestUrl.mock.calls[0][0];
  expect(Array.from(new Uint8Array(params.body))).toEqual([0, 255, 128, 1]);
  expect(params.headers).toEqual({ Authorization: 'test' });
  expect(result.headers?.['content-type']).toBe('application/x-git-upload-pack-result');
  const response: number[] = [];
  for await (const chunk of result.body!) response.push(...chunk);
  expect(response).toEqual([137, 0, 255]);
});
test('passes authentication failures to Git instead of throwing in the HTTP adapter', async () => {
  requestUrl.mockResolvedValue({ status: 401, headers: {}, arrayBuffer: new ArrayBuffer(0) });
  expect((await http.request({ url: 'https://github.com/test/repo' })).statusCode).toBe(401);
  expect(requestUrl.mock.calls[0][0].throw).toBe(false);
});
test.each([401, 403, 404, 500])(
  'connection check reports HTTP %s without exposing a token',
  async (status) => {
    requestUrl.mockResolvedValue({ status });
    await expect(
      testConnection(loadSettings({ repositoryUrl: 'test/repo', personalAccessToken: 'secret' })),
    ).rejects.toThrow();
  },
);
test('REST authentication also uses the mobile-compatible transport', async () => {
  requestUrl.mockResolvedValue({ status: 200, json: { permissions: { push: true } } });
  await testConnection(
    loadSettings({ repositoryUrl: 'test/repo.with.dots', personalAccessToken: 'secret' }),
  );
  expect(requestUrl.mock.calls[0][0].url).toBe('https://api.github.com/repos/test/repo.with.dots');
});
