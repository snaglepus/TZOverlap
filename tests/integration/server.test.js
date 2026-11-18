// Integration: config loader + static server serving the real src/ tree over HTTP
// on an ephemeral local port. No external network.

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../config/env.js';
import { startServer } from '../../scripts/serve.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('dev server', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let baseUrl;

  before(async () => {
    const config = loadConfig({ rootDir: ROOT, env: { PORT: '0', HOST: '127.0.0.1' } });
    ({ server, url: baseUrl } = await startServer({
      port: config.port,
      host: config.host,
      root: config.serveDir,
    }));
  });

  after(() => new Promise((resolve) => server.close(() => resolve(undefined))));

  it('serves index.html at / with a same-origin-only CSP', async () => {
    const res = await fetch(baseUrl);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.match(await res.text(), /<title>TZ Overlap<\/title>/);
  });

  it('serves ES modules with a JavaScript MIME type', async () => {
    const res = await fetch(new URL('lib/timezones.js', baseUrl));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/javascript/);
    assert.match(await res.text(), /export function isValidTimeZone/);
  });

  it('returns 404 for missing files and refuses to escape the root', async () => {
    assert.equal((await fetch(new URL('nope.js', baseUrl))).status, 404);
    const escaped = await fetch(new URL('%2e%2e/package.json', baseUrl));
    assert.notEqual(escaped.status, 200);
  });

  it('rejects non-GET methods', async () => {
    assert.equal((await fetch(baseUrl, { method: 'POST' })).status, 405);
  });
});
