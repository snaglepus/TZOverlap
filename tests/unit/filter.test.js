import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayQualifies, greyedSpans, nextQualifyingDay, qualifies } from '../../src/lib/filter.js';
import { MAX_DATE, MAX_DAYS, buildGrid, formatAnchor } from '../../src/lib/grid.js';

/** @typedef {import('../../src/lib/zones.js').Zone} Zone */
/** @typedef {import('../../src/lib/grid.js').Segment} Segment */
/** @typedef {import('../../src/lib/filter.js').Filter} Filter */
/** @typedef {import('../../src/lib/suitability.js').Rating} Rating */

/** @param {string} tz @returns {Zone} */
const iana = (tz) => ({ kind: 'iana', tz });
const london = iana('Europe/London');
const newYork = iana('America/New_York');
const kolkata = iana('Asia/Kolkata');
const apia = iana('Pacific/Apia');
/** Offsets from UTC−10 to UTC+12: more than 16 hours apart. */
const SPREAD = [
  'Pacific/Honolulu',
  'America/Los_Angeles',
  'America/New_York',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
].map(iana);

/** @param {string} text "YYYY-MM-DD" */
const ymd = (text) => {
  const [year, month, day] = text.split('-').map(Number);
  return {
    year: /** @type {number} */ (year),
    month: /** @type {number} */ (month),
    day: /** @type {number} */ (day),
  };
};

/** @param {string} iso */
const at = (iso) => new Date(iso);

/**
 * A segment of `hours` hours starting `left` hours after 00:00Z on 1 Jun 2026.
 * @param {number} left @param {number} width @param {Rating} rating
 * @returns {Segment}
 */
function segment(left, width, rating) {
  const base = Date.UTC(2026, 5, 1);
  return {
    start: new Date(base + left * 3600000),
    end: new Date(base + (left + width) * 3600000),
    left,
    width,
    rating,
  };
}

describe('qualifies', () => {
  /** @type {[Rating, Filter, boolean][]} */
  const cases = [
    ['best', 'all', true],
    ['good', 'all', true],
    ['unsuitable', 'all', true],
    ['best', 'good', true],
    ['good', 'good', true],
    ['unsuitable', 'good', false],
    ['best', 'best', true],
    ['good', 'best', false],
    ['unsuitable', 'best', false],
  ];
  for (const [rating, filter, expected] of cases) {
    it(`${rating} under ${filter} is ${expected}`, () => {
      assert.equal(qualifies(rating, filter), expected);
    });
  }
});

describe('greyedSpans', () => {
  const segments = [
    segment(0, 2, 'unsuitable'),
    segment(2, 1, 'good'),
    segment(3, 3, 'best'),
    segment(6, 1.5, 'good'),
    segment(7.5, 2, 'unsuitable'),
  ];
  /** @param {ReturnType<typeof greyedSpans>} spans */
  const plain = (spans) =>
    spans.map(({ start, end, left, width }) => [
      start.toISOString(),
      end.toISOString(),
      left,
      width,
    ]);

  it('greys nothing under All', () => {
    assert.deepEqual(greyedSpans(segments, 'all'), []);
  });

  it('merges adjacent Good and Unsuitable segments under Best', () => {
    assert.deepEqual(plain(greyedSpans(segments, 'best')), [
      ['2026-06-01T00:00:00.000Z', '2026-06-01T03:00:00.000Z', 0, 3],
      ['2026-06-01T06:00:00.000Z', '2026-06-01T09:30:00.000Z', 6, 3.5],
    ]);
  });

  it('greys only Unsuitable segments under Good', () => {
    assert.deepEqual(plain(greyedSpans(segments, 'good')), [
      ['2026-06-01T00:00:00.000Z', '2026-06-01T02:00:00.000Z', 0, 2],
      ['2026-06-01T07:30:00.000Z', '2026-06-01T09:30:00.000Z', 7.5, 2],
    ]);
  });

  it('tiles a real window with the qualifying segments, on :30 edges (London + Kolkata)', () => {
    const grid = buildGrid({ homeZone: london, zones: [kolkata], anchor: ymd('2026-06-15') });
    for (const filter of /** @type {Filter[]} */ (['good', 'best'])) {
      const pieces = [
        ...greyedSpans(grid.everyone, filter),
        ...grid.everyone.filter((s) => qualifies(s.rating, filter)),
      ].sort((a, b) => a.start.getTime() - b.start.getTime());
      assert.equal(pieces[0]?.start.getTime(), grid.start.getTime());
      assert.equal(pieces[pieces.length - 1]?.end.getTime(), grid.end.getTime());
      for (let i = 1; i < pieces.length; i += 1) {
        const prev = /** @type {(typeof pieces)[number]} */ (pieces[i - 1]);
        const next = /** @type {(typeof pieces)[number]} */ (pieces[i]);
        assert.equal(prev.end.getTime(), next.start.getTime(), `gap or overlap at ${i}`);
        assert.ok(Math.abs(prev.left + prev.width - next.left) < 1e-9);
      }
    }
    const best = greyedSpans(grid.everyone, 'best').map((s) => [
      s.start.toISOString(),
      s.end.toISOString(),
    ]);
    // Monday's Best window: 08:00Z (09:00 London) to 11:30Z (17:00 Kolkata).
    assert.ok(best.some(([, end]) => end === '2026-06-15T08:00:00.000Z'));
    assert.ok(best.some(([start]) => start === '2026-06-15T11:30:00.000Z'));
    for (const [start, end] of best) {
      assert.equal(at(/** @type {string} */ (start)).getUTCMinutes() % 30, 0);
      assert.equal(at(/** @type {string} */ (end)).getUTCMinutes() % 30, 0);
    }
  });
});

describe('dayQualifies', () => {
  const base = { homeZone: london, zones: [newYork], weekendsUnavailable: true };

  it('London and New York: Best on Monday 15 Jun 2026', () => {
    assert.equal(dayQualifies({ ...base, anchor: ymd('2026-06-15'), filter: 'best' }), true);
  });

  it('Saturday 13 Jun: no Best with weekends unavailable, Best without', () => {
    const anchor = ymd('2026-06-13');
    assert.equal(dayQualifies({ ...base, anchor, filter: 'best' }), false);
    assert.equal(dayQualifies({ ...base, anchor, filter: 'good' }), false);
    assert.equal(dayQualifies({ ...base, anchor, filter: 'all' }), true);
    assert.equal(
      dayQualifies({ ...base, anchor, filter: 'best', weekendsUnavailable: false }),
      true,
    );
  });

  it('eight zones over more than 16 hours: never Best (PRD T10)', () => {
    const options = { ...base, zones: SPREAD, anchor: ymd('2026-06-15') };
    assert.equal(dayQualifies({ ...options, filter: 'best' }), false);
    assert.equal(dayQualifies({ ...options, filter: 'all' }), true);
  });
});

describe('nextQualifyingDay', () => {
  const base = { homeZone: london, zones: [newYork], weekendsUnavailable: true };

  it('from Saturday 13 Jun 2026 (Best) finds Monday 15 Jun', () => {
    const next = nextQualifyingDay({ ...base, anchor: ymd('2026-06-13'), filter: 'best' });
    assert.deepEqual(next, ymd('2026-06-15'));
  });

  it('eight zones over more than 16 hours: none in the next 14 days (PRD T10)', () => {
    const options = { ...base, zones: SPREAD, anchor: ymd('2026-06-15') };
    assert.equal(nextQualifyingDay({ ...options, filter: 'best' }), null);
  });

  it('passes over a date the home zone skipped (Apia, 30 Dec 2011)', () => {
    const options = { homeZone: apia, zones: [], weekendsUnavailable: false };
    const next = nextQualifyingDay({ ...options, anchor: ymd('2011-12-29'), filter: 'best' });
    assert.deepEqual(next, ymd('2011-12-31'));
  });

  it('never goes past MAX_DATE', () => {
    const options = { homeZone: london, zones: [], weekendsUnavailable: false };
    assert.equal(nextQualifyingDay({ ...options, anchor: ymd(MAX_DATE), filter: 'best' }), null);
    const next = nextQualifyingDay({ ...options, anchor: ymd('2099-12-30'), filter: 'best' });
    assert.deepEqual(next, ymd(MAX_DATE));
  });

  it('never goes more than 14 days after the anchor', () => {
    const DAY = 86400000;
    for (const text of ['2026-06-13', '2026-06-19', '2026-12-24']) {
      const anchor = ymd(text);
      for (const filter of /** @type {Filter[]} */ (['good', 'best'])) {
        const next = nextQualifyingDay({ ...base, anchor, filter });
        assert.ok(next, `${text} ${filter}`);
        const days = (at(formatAnchor(next)).getTime() - at(text).getTime()) / DAY;
        assert.ok(days >= 1 && days <= MAX_DAYS, `${text} ${filter}: ${days}`);
      }
    }
  });
});
