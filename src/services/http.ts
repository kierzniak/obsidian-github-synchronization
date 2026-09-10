import { requestUrl } from 'obsidian';
import type { HttpClient } from 'isomorphic-git';

/** Use requestUrl on desktop and mobile without a CORS proxy. */
const http: HttpClient = {
  async request({ url, method = 'GET', headers = {}, body }) {
    const chunks: Uint8Array[] = [];
    if (body) for await (const chunk of body) chunks.push(chunk);
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // Let the native mobile transport set these headers.
    const outgoing = Object.fromEntries(
      Object.entries(headers).filter(
        ([key]) => !['host', 'content-length', 'user-agent'].includes(key.toLowerCase()),
      ),
    );
    const response = await requestUrl({
      url,
      method,
      headers: outgoing,
      body: body ? bytes.buffer : undefined,
      throw: false,
    });
    return {
      url,
      statusCode: response.status,
      statusMessage: String(response.status),
      headers: Object.fromEntries(
        Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]),
      ),
      body: (async function* () {
        yield new Uint8Array(response.arrayBuffer);
      })(),
    };
  },
};
export default http;
