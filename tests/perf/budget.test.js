// Bundle-size budget: runs a real production build into a temp dir and fails if
// any gzipped asset class exceeds perf-budget.json.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from '../../scripts/build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** @type {{ gzipBytes: Record<'html' | 'js' | 'css' | 'total', number> }} */
const budget = JSON.parse(readFileSync(path.join(ROOT, 'perf-budget.json'), 'utf8'));

describe('production bundle size budget', () => {
  const outDir = mkdtempSync(path.join(tmpdir(), 'tzo-budget-'));
  /** @type {Record<'html' | 'js' | 'css' | 'total', number>} */
  const sizes = { html: 0, js: 0, css: 0, total: 0 };
  /** @type {string[]} */
  let files = [];

  before(async () => {
    files = await build({ outDir });
    for (const file of files) {
      const gz = gzipSync(readFileSync(path.join(outDir, file)), { level: 9 }).length;
      const kind = /** @type {'html' | 'js' | 'css'} */ (path.extname(file).slice(1));
      if (kind in sizes) sizes[kind] += gz;
      sizes.total += gz;
    }
    console.log(
      `gzip bytes: ${Object.entries(sizes)
        .map(([k, v]) => `${k}=${v}/${budget.gzipBytes[/** @type {keyof typeof sizes} */ (k)]}`)
        .join(' ')}`,
    );
  });

  after(() => rmSync(outDir, { recursive: true, force: true }));

  it('produces a non-empty build', () => {
    assert.ok(files.includes('index.html'));
    assert.ok(files.includes('main.js'));
    assert.ok(sizes.js > 0);
  });

  for (const kind of /** @type {const} */ (['html', 'js', 'css', 'total'])) {
    it(`${kind} stays within ${budget.gzipBytes[kind]} gzipped bytes`, () => {
      assert.ok(
        sizes[kind] <= budget.gzipBytes[kind],
        `${kind} is ${sizes[kind]} B gzipped, budget is ${budget.gzipBytes[kind]} B`,
      );
    });
  }

  it('references no third-party origins', () => {
    for (const file of files) {
      const text = readFileSync(path.join(outDir, file), 'utf8');
      const external = text.match(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\/[^"'\s>]+/gi);
      assert.equal(external, null, `${file} loads external resources: ${external}`);
    }
  });
});
