// Integration: the production build emits a self-contained service worker whose
// pre-cache list and cache name are generated from the build output.

import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/build.js';
import { SERVICE_WORKER_URL } from '../../src/build-env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');
const CACHE_NAME = /tzoverlap-[0-9a-f]{12}/;

/** @param {string} outDir */
function cacheName(outDir) {
  const name = CACHE_NAME.exec(readFileSync(path.join(outDir, 'sw.js'), 'utf8'))?.[0];
  assert.ok(name, 'sw.js has no tzoverlap- cache name');
  return name;
}

describe('service worker build', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'tzo-sw-build-'));
  const first = path.join(temp, 'first');
  const second = path.join(temp, 'second');
  /** @type {string[]} */
  let files = [];
  /** @type {string} */
  let worker;

  before(async () => {
    files = await build({ outDir: first });
    worker = readFileSync(path.join(first, 'sw.js'), 'utf8');
  });

  after(() => rmSync(temp, { recursive: true, force: true }));

  it('emits sw.js as a classic script that does not pre-cache itself', () => {
    assert.ok(files.includes('sw.js'));
    assert.deepEqual(files, [...files].sort());
    assert.doesNotMatch(worker, /(^|[;}\s])(import|export)[\s{*"']/);
    assert.ok(!worker.includes('"./sw.js"'), 'sw.js pre-caches itself');
  });

  it('pre-caches every other written file', () => {
    for (const file of files.filter((f) => f !== 'sw.js')) {
      assert.ok(worker.includes(JSON.stringify(`./${file}`)), `./${file} is not pre-cached`);
    }
    for (const file of ['./data/cities.js', './index.html', './main.js']) {
      assert.ok(worker.includes(JSON.stringify(file)), `${file} is not pre-cached`);
    }
  });

  it('names the cache tzoverlap-<12 hex>', () => {
    assert.match(worker, CACHE_NAME);
  });

  it('gives the same name for the same sources', async () => {
    await build({ outDir: second });
    assert.equal(cacheName(second), cacheName(first));
  });

  it('gives a new name when one source file changes', async () => {
    const srcCopy = path.join(temp, 'src');
    const changed = path.join(temp, 'changed');
    cpSync(SRC, srcCopy, { recursive: true });
    appendFileSync(path.join(srcCopy, 'index.html'), '<!-- changed -->\n');
    await build({ srcDir: srcCopy, outDir: changed });
    assert.notEqual(cacheName(changed), cacheName(first));
  });

  it('gives a new name when only the worker source changes', async () => {
    const srcCopy = path.join(temp, 'src-worker');
    const changed = path.join(temp, 'changed-worker');
    cpSync(SRC, srcCopy, { recursive: true });
    appendFileSync(path.join(srcCopy, 'sw.js'), '// changed\n');
    await build({ srcDir: srcCopy, outDir: changed });
    assert.notEqual(cacheName(changed), cacheName(first));
  });

  it('registers ./sw.js from the built main.js only', () => {
    assert.ok(readFileSync(path.join(first, 'main.js'), 'utf8').includes('"./sw.js"'));
    assert.equal(SERVICE_WORKER_URL, null);
  });
});
