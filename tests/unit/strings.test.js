import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { strings } from '../../src/ui/strings.js';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));
const callers = [
  'ui/app.js',
  'ui/grid.js',
  'main.js',
  'ui/components.js',
  'ui/settings.js',
  'ui/add-city.js',
  'ui/install.js',
];

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
    assert.equal(strings.addCity.added('New York'), 'Added New York.');
    assert.equal(strings.addCity.removed('Tokyo'), 'Removed Tokyo.');
    assert.equal(strings.timelines.everyone, 'Everyone');
    assert.equal(strings.timelines.noDst, 'No DST');
    assert.equal(strings.timelines.repeatTitle, 'Clocks go back — this hour repeats');
    assert.match(strings.timelines.gridLabel, /Hours in each time zone/);
    assert.equal(strings.timelines.cell('09', 'Best'), '09:00, Best');
    assert.equal(strings.timelines.cell('01', 'Unsuitable', true), '01:00 (repeated), Unsuitable');
    assert.equal(
      strings.timelines.cell('00', 'Unsuitable', false, true, 'Sat 13'),
      '00:00, Sat 13, Unsuitable, weekend',
    );
    assert.equal(strings.timelines.cell('10', 'Best', false, true), '10:00, Best, weekend');
    assert.equal(
      strings.timelines.cell('00', 'Best', false, false, 'Mon 15'),
      '00:00, Mon 15, Best',
    );
    assert.equal(
      strings.timelines.cell('01', 'Good', true, true),
      '01:00 (repeated), Good, weekend',
    );
    assert.equal(strings.settings.weekends, 'Treat weekends as unavailable');
    assert.equal(
      strings.timelines.segment('14:30', '17:00', 'Best'),
      '14:30 to 17:00 your time, Best for everyone',
    );
    assert.deepEqual(strings.ratings, { best: 'Best', good: 'Good', unsuitable: 'Unsuitable' });
    assert.equal(strings.fatal.noTimeZones.title, 'Time zones aren’t available');
  });
});
