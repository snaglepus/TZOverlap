import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { strings } from '../../src/ui/strings.js';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));
const callers = ['ui/app.js', 'ui/grid.js', 'main.js', 'ui/components.js', 'ui/settings.js'];

/** @typedef {Record<string, unknown>} Tree */

/**
 * @param {unknown} value
 * @returns {value is Tree}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * Every leaf entry with its dotted path. A `{ long, short? }` object is a leaf.
 * @param {Tree} tree
 * @param {string} [prefix]
 * @returns {[string, unknown][]}
 */
function leaves(tree, prefix = 'strings') {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = `${prefix}.${key}`;
    return isObject(value) && !('long' in value) ? leaves(value, path) : [[path, value]];
  });
}

/**
 * @param {string} path dotted path starting with `strings`
 * @returns {unknown}
 */
function resolve(path) {
  /** @type {unknown} */
  let node = { strings };
  for (const key of path.split('.')) {
    if (!isObject(node) || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

describe('strings', () => {
  it('resolves every strings.<path> reference in the UI modules', () => {
    for (const file of callers) {
      const source = readFileSync(`${srcDir}${file}`, 'utf8');
      const refs = [...source.matchAll(/(?<![\w$./])strings(?:\.[A-Za-z_$][\w$]*)+/g)].map(
        (m) => m[0],
      );
      assert.ok(refs.length > 0, `${file} uses the strings module`);
      for (const ref of refs) {
        assert.notEqual(resolve(ref), undefined, `${file}: ${ref} is not defined`);
      }
    }
  });

  it('has only strings, functions or { long, short? } entries', () => {
    for (const [path, value] of leaves(strings)) {
      const ok =
        typeof value === 'string' ||
        typeof value === 'function' ||
        (isObject(value) && 'long' in value);
      assert.ok(ok, `${path} is a string, a function or a { long } object`);
    }
  });

  it('returns a non-empty string from every function entry', () => {
    const fns = leaves(strings).filter(([, value]) => typeof value === 'function');
    assert.ok(fns.length > 0);
    for (const [path, fn] of fns) {
      const out = /** @type {(...args: unknown[]) => unknown} */ (fn)('Tokyo', 'ideal');
      assert.equal(typeof out, 'string', path);
      assert.ok(/** @type {string} */ (out).length > 0, `${path} returns text`);
    }
  });

  it('keeps the existing wording', () => {
    assert.equal(
      strings.errors.invalid('Mars/Base'),
      '“Mars/Base” isn’t a time zone this browser recognises. Use a name like America/New_York.',
    );
    assert.equal(
      strings.errors.limit(8),
      'You can compare up to 8 zones. Remove one to add another.',
    );
    assert.equal(strings.addZone.help(7), 'Use an IANA name. You can add 7 more.');
    assert.equal(strings.timelines.everyone, 'Everyone');
    assert.equal(strings.timelines.noDst, 'No DST');
    assert.equal(strings.timelines.repeatTitle, 'Clocks go back — this hour repeats');
    assert.match(strings.timelines.gridLabel, /Hours in each time zone/);
    assert.equal(strings.timelines.cell('09:00', 'Best'), '09:00, Best');
    assert.equal(strings.timelines.cell('9:00 am', 'Best'), '9:00 am, Best');
    assert.equal(
      strings.timelines.cell('01:00', 'Unsuitable', true),
      '01:00 (repeated), Unsuitable',
    );
    assert.deepEqual(strings.time, { am: 'am', pm: 'pm', amShort: 'a', pmShort: 'p' });
    assert.equal(
      strings.timelines.segment('14:30', '17:00', 'Best'),
      '14:30 to 17:00 your time, Best for everyone',
    );
    assert.deepEqual(strings.ratings, { best: 'Best', good: 'Good', unsuitable: 'Unsuitable' });
    assert.equal(strings.fatal.noTimeZones.title, 'Time zones aren’t available');
  });
});
