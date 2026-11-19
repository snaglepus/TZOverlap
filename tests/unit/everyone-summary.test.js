import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  everyoneSummary,
  sameSummary,
  summariseSlots,
  summaryText,
} from '../../src/lib/everyone-summary.js';

/** @typedef {import('../../src/lib/zones.js').Zone} Zone */
/** @typedef {import('../../src/lib/suitability.js').Rating} Rating */
/** @typedef {import('../../src/lib/suitability.js').Slot} Slot */
/** @typedef {import('../../src/lib/time-format.js').HourCycle} HourCycle */

/** @param {string} tz @returns {Zone} */
const iana = (tz) => ({ kind: 'iana', tz });
const london = iana('Europe/London');
const utc = iana('UTC');

/** @param {string} text "YYYY-MM-DD" */
const ymd = (text) => {
  const [year, month, day] = text.split('-').map(Number);
  return {
    year: /** @type {number} */ (year),
    month: /** @type {number} */ (month),
    day: /** @type {number} */ (day),
  };
};

/**
 * The long summary for `home` plus `zones` on `date`.
 * @param {Zone} home
 * @param {string[]} zones
 * @param {string} date
 * @param {{ weekendsUnavailable?: boolean, cycle?: HourCycle }} [options]
 */
function long(home, zones, date, { weekendsUnavailable = true, cycle = 'h23' } = {}) {
  const summary = everyoneSummary({
    homeZone: home,
    zones: zones.map(iana),
    anchor: ymd(date),
    weekendsUnavailable,
  });
  return summaryText(summary, home, cycle).long;
}

/**
 * Hand-built slots from 00:00Z on 1 Jun 2026, one rating letter per 15
 * minutes: b (Best), g (Good) or . (Unsuitable).
 * @param {string} pattern
 * @returns {Slot[]}
 */
function slots(pattern) {
  /** @type {Record<string, Rating>} */
  const ratings = { b: 'best', g: 'good', '.': 'unsuitable' };
  const start = Date.UTC(2026, 5, 1);
  return [...pattern].map((letter, i) => ({
    start: new Date(start + i * 15 * 60000),
    zones: [],
    overlap: { rating: /** @type {Rating} */ (ratings[letter]) },
  }));
}

/** @param {number} minutes after 00:00Z on 1 Jun 2026 */
const at = (minutes) => new Date(Date.UTC(2026, 5, 1) + minutes * 60000);

describe('everyoneSummary and summaryText', () => {
  it('London and Tokyo on Monday 15 Jun 2026: Good 06:00–12:00', () => {
    // Tokyo is 8 hours ahead: Good there (06–20) is 22:00–12:00 London, and
    // Best (09–17) is 01:00–09:00, which misses London's 09:00–17:00.
    assert.equal(long(london, ['Asia/Tokyo'], '2026-06-15'), 'Good 06:00–12:00');
  });

  it('London and Kathmandu (UTC+5:45): Best to the quarter hour', () => {
    // Kathmandu's 09:00–17:00 is 04:15–12:15 London (BST).
    assert.equal(long(london, ['Asia/Kathmandu'], '2026-06-15'), 'Best 09:00–12:15');
    assert.equal(
      long(london, ['Asia/Kathmandu'], '2026-06-15', { cycle: 'h12' }),
      'Best 9 am–12:15 pm',
    );
  });

  it('London and New York on the London clock change (Sun 29 Mar 2026)', () => {
    assert.equal(
      long(london, ['America/New_York'], '2026-03-29', { weekendsUnavailable: false }),
      'Best 14:00–17:00',
    );
    assert.equal(long(london, ['America/New_York'], '2026-03-29'), 'No shared hours');
  });

  it('London and New York with New York already on EDT', () => {
    assert.equal(long(london, ['America/New_York'], '2026-03-09'), 'Best 13:00–17:00');
    assert.equal(long(london, ['America/New_York'], '2026-03-02'), 'Best 14:00–17:00');
  });

  it('Sydney and four zones far apart: No shared hours', () => {
    const zones = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'America/Los_Angeles'];
    assert.equal(long(iana('Australia/Sydney'), zones, '2026-06-15'), 'No shared hours');
    const summary = everyoneSummary({
      homeZone: iana('Australia/Sydney'),
      zones: zones.map(iana),
      anchor: ymd('2026-06-15'),
      weekendsUnavailable: true,
    });
    assert.deepEqual(summaryText(summary, utc, 'h23'), {
      long: 'No shared hours',
      short: 'None shared',
    });
  });
});

describe('summariseSlots', () => {
  it('is null without a Best or Good slot', () => {
    assert.equal(summariseSlots(slots('....')), null);
    assert.equal(summariseSlots([]), null);
  });

  it('names the longest run and counts the others', () => {
    // Good 00:15–00:30, then Good 01:00–02:00 (four slots), then Good 02:15–02:45.
    const summary = summariseSlots(slots('.g..gggg.gg'));
    assert.deepEqual(summary, { rating: 'good', start: at(60), end: at(120), more: 2 });
  });

  it('takes the earliest of the longest runs on a tie', () => {
    const summary = summariseSlots(slots('gg..gg'));
    assert.deepEqual(summary, { rating: 'good', start: at(0), end: at(30), more: 1 });
  });

  it('prefers Best over a longer Good run', () => {
    // Good runs ignore heat steps, so "gggg" is one run either side of Best.
    const summary = summariseSlots(slots('ggggggb.gggg'));
    assert.deepEqual(summary, { rating: 'best', start: at(90), end: at(105), more: 0 });
  });

  it('formats "+1 more" long and "+1" short', () => {
    // Best 10:00–11:00Z and 12:00–12:15Z.
    const pattern = `${'.'.repeat(40)}bbbb....b`;
    const summary = summariseSlots(slots(pattern));
    assert.deepEqual(summaryText(summary, utc, 'h23'), {
      long: 'Best 10:00–11:00, +1 more',
      short: 'Best 10:00–11:00 +1',
    });
  });
});

describe('summaryText ranges', () => {
  /**
   * @param {number} from minutes after midnight UTC
   * @param {number} to
   * @param {HourCycle} cycle
   */
  const text = (from, to, cycle) =>
    summaryText({ rating: 'good', start: at(from), end: at(to), more: 0 }, utc, cycle).long;

  it('always shows HH:MM in 24-hour', () => {
    assert.equal(text(600, 1020, 'h23'), 'Good 10:00–17:00');
    assert.equal(text(540, 735, 'h23'), 'Good 09:00–12:15');
  });

  it('drops :00 in 12-hour and puts a shared am/pm once at the end', () => {
    assert.equal(text(540, 660, 'h12'), 'Good 9–11 am');
    assert.equal(text(570, 675, 'h12'), 'Good 9:30–11:15 am');
    assert.equal(text(360, 540, 'h12'), 'Good 6–9 am');
  });

  it('puts am/pm on both ends when they differ; noon is 12 pm', () => {
    assert.equal(text(660, 1020, 'h12'), 'Good 11 am–5 pm');
    assert.equal(text(540, 735, 'h12'), 'Good 9 am–12:15 pm');
    assert.equal(text(540, 720, 'h12'), 'Good 9 am–12 pm');
  });
});

describe('sameSummary', () => {
  const a = { rating: /** @type {const} */ ('best'), start: at(0), end: at(60), more: 0 };

  it('compares rating, times and run count by value', () => {
    assert.equal(sameSummary(a, { ...a, start: at(0) }), true);
    assert.equal(sameSummary(a, { ...a, rating: 'good' }), false);
    assert.equal(sameSummary(a, { ...a, end: at(75) }), false);
    assert.equal(sameSummary(a, { ...a, more: 1 }), false);
  });

  it('treats two nones as the same, and none as different from a run', () => {
    assert.equal(sameSummary(null, null), true);
    assert.equal(sameSummary(a, null), false);
    assert.equal(sameSummary(null, a), false);
  });
});
