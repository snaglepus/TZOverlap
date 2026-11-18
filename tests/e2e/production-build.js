// E2E helper: a production build served in-process on a free port, for one
// test. Each call gets its own origin, so service worker state never leaks
// between tests and no fixed port is needed.

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/build.js';
import { startServer } from '../../scripts/serve.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/**
 * Build src/ into a temp directory and serve it.
 * @returns {Promise<{
 *   url: string,
 *   outDir: string,
 *   rebuild: (srcDir: string) => Promise<string[]>,
 *   close: () => Promise<void>,
 * }>}
 */
export async function productionBuild() {
  const outDir = await mkdtemp(path.join(tmpdir(), 'tzo-e2e-build-'));
  await build({ srcDir: SRC, outDir });
  const { server, url } = await startServer({ port: 0, host: '127.0.0.1', root: outDir });
  return {
    url,
    outDir,
    // Rebuilds into the same directory while the server keeps running.
    rebuild: (srcDir) => build({ srcDir, outDir }),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
      await rm(outDir, { recursive: true, force: true });
    },
  };
}

/**
 * A temp copy of src/ to change before a rebuild. Remove it when done.
 * @returns {Promise<string>}
 */
export async function copyOfSrc() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tzo-e2e-src-'));
  await cp(SRC, dir, { recursive: true });
  return dir;
}

/**
 * Record every request in the browser context that leaves `origin`
 * (`data:` excepted), including the service worker's own.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} origin
 */
export function recordForeignRequests(context, origin) {
  /** @type {string[]} */
  const foreign = [];
  context.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:')) return;
    if (new URL(url).origin !== new URL(origin).origin) foreign.push(url);
  });
  return foreign;
}
