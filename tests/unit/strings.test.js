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
  'ui/selection-bar.js',
  'lib/selection-details.js',
  'lib/everyone-summary.js',
  'lib/dst.js',
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
    assert.equal(strings.addCity.restored('Tokyo'), 'Restored Tokyo.');
    assert.equal(strings.addCity.changeTitle('Tokyo'), 'Change Tokyo');
    assert.equal(strings.addCity.changed('Tokyo', 'London'), 'Changed Tokyo to London.');
    assert.equal(strings.timelines.moved('London', 2, 5), 'London moved to position 2 of 5');
    assert.equal(strings.toasts.undo, 'Undo');
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
      strings.timelines.cell('00:00', 'Unsuitable', false, true, 'Sat 13'),
      '00:00, Sat 13, Unsuitable, weekend',
    );
    assert.equal(strings.timelines.cell('10:00', 'Best', false, true), '10:00, Best, weekend');
    assert.equal(
      strings.timelines.cell('12:00 am', 'Best', false, false, 'Mon 15'),
      '12:00 am, Mon 15, Best',
    );
    assert.equal(
      strings.timelines.cell('01:00', 'Good', true, true),
      '01:00 (repeated), Good, weekend',
    );
    assert.equal(strings.settings.weekends, 'Treat weekends as unavailable');
    assert.equal(
      strings.timelines.segment('14:30', '17:00', 'Best'),
      '14:30 to 17:00 your time, Best for everyone',
    );
    assert.equal(
      strings.timelines.segment('06:00', '14:00', 'Good', true),
      '06:00 to 14:00 your time, Good for everyone, greyed out by the filter',
    );
    assert.equal(
      strings.filter.changed('Good', 'No shared hours'),
      'Filter: Good. Everyone: No shared hours.',
    );
    assert.equal(strings.timelines.summary.range('10:00', '17:00'), '10:00–17:00');
    assert.equal(strings.timelines.summary.best.long('10:00–17:00', 0), 'Best 10:00–17:00');
    assert.equal(
      strings.timelines.summary.best.long('10:00–17:00', 1),
      'Best 10:00–17:00, +1 more',
    );
    assert.equal(strings.timelines.summary.best.short('10:00–17:00', 1), 'Best 10:00–17:00 +1');
    assert.equal(strings.timelines.summary.good.long('6–9 am', 0), 'Good 6–9 am');
    assert.equal(strings.timelines.summary.good.short('6–9 am', 2), 'Good 6–9 am +2');
    assert.deepEqual(strings.timelines.summary.none, {
      long: 'No shared hours',
      short: 'None shared',
    });
    assert.equal(
      strings.timelines.summary.announce('Best 10:00–17:00'),
      'Everyone: Best 10:00–17:00.',
    );
    assert.equal(
      strings.timelines.summary.withMessage('Added Tokyo.', 'Best 10:00–17:00'),
      'Added Tokyo. Everyone: Best 10:00–17:00.',
    );
    assert.deepEqual(strings.filter.noOverlap, {
      long: 'No time works for everyone today',
      short: 'No time works today',
    });
    assert.deepEqual(strings.filter.nextDay, {
      long: 'Show next day that works',
      short: 'Next day',
    });
    assert.equal(
      strings.filter.noneFound(14),
      'No time works for everyone in the next 14 days either.',
    );
    assert.deepEqual(strings.ratings, { best: 'Best', good: 'Good', unsuitable: 'Unsuitable' });
    assert.equal(strings.fatal.noTimeZones.title, 'Time zones aren’t available');
  });
});
