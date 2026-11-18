// Integration: the web app manifest, icons and home-screen head tags over HTTP,
// from both the dev root (src/) and a production build. No external network.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/build.js';
import { startServer } from '../../scripts/serve.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const EXPECTED_ICONS = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

const HEAD_TAGS = [
  /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/,
  /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png" \/>/,
  /<meta name="apple-mobile-web-app-capable" content="yes" \/>/,
  /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" \/>/,
  /<meta name="apple-mobile-web-app-title" content="TZ Overlap" \/>/,
  /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#[0-9a-f]{6}" \/>/,
  /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#[0-9a-f]{6}" \/>/,
];

/**
 * Fetches a PNG and checks type, signature, first chunk and IHDR size.
 * @param {URL} url
 * @param {number} size
 */
async function assertPng(url, size) {
  const res = await fetch(url);
  assert.equal(res.status, 200, `${url}`);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  const body = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(body.subarray(0, 8), PNG_SIGNATURE);
  assert.equal(body.toString('latin1', 12, 16), 'IHDR');
  assert.equal(body.readUInt32BE(16), size);
  assert.equal(body.readUInt32BE(20), size);
}

/**
 * @param {string} name
 * @param {() => Promise<string>} prepareRoot returns the directory to serve
 * @param {() => void} cleanup
 */
function suite(name, prepareRoot, cleanup = () => {}) {
  describe(`manifest and icons (${name})`, () => {
    /** @type {import('node:http').Server} */
    let server;
    /** @type {string} */
    let baseUrl;

    before(async () => {
      const root = await prepareRoot();
      ({ server, url: baseUrl } = await startServer({ port: 0, host: '127.0.0.1', root }));
    });

    after(async () => {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
      cleanup();
    });

    it('serves the manifest as application/manifest+json with the PWA fields', async () => {
      const res = await fetch(new URL('manifest.webmanifest', baseUrl));
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /^application\/manifest\+json/);
      assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
      assert.deepEqual(JSON.parse(await res.text()), {
        name: 'TZ Overlap',
        short_name: 'TZ Overlap',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: '#f6f4ef',
        background_color: '#f6f4ef',
        icons: EXPECTED_ICONS,
      });
    });

    it('serves every manifest icon as a PNG of its declared size', async () => {
      const manifestUrl = new URL('manifest.webmanifest', baseUrl);
      /** @type {{ icons: { src: string, sizes: string }[] }} */
      const manifest = await (await fetch(manifestUrl)).json();
      for (const icon of manifest.icons) {
        const size = Number(icon.sizes.split('x')[0]);
        await assertPng(new URL(icon.src, manifestUrl), size);
      }
    });

    it('serves index.html with the manifest link and home-screen tags', async () => {
      const res = await fetch(baseUrl);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
      const html = await res.text();
      for (const tag of HEAD_TAGS) assert.match(html, tag);
      assert.equal(html.match(/<meta name="theme-color"/g)?.length, 2);
    });

    it('serves the apple-touch icon as a 180px PNG', async () => {
      const html = await (await fetch(baseUrl)).text();
      const href = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1];
      assert.ok(href);
      await assertPng(new URL(href, baseUrl), 180);
    });
  });
}

suite('dev, src/', async () => path.join(ROOT, 'src'));

const outDir = mkdtempSync(path.join(tmpdir(), 'tzo-manifest-'));
suite(
  'preview, built output',
  async () => {
    await build({ outDir });
    return outDir;
  },
  () => rmSync(outDir, { recursive: true, force: true }),
);
