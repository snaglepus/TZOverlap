import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSelection } from '../../src/lib/selection.js';
import { describeSelection, selectionSummary, slotLabel } from '../../src/lib/selection-details.js';

/** @typedef {import('../../src/lib/grid.js').GridZone} GridZone */

/** @type {GridZone} */
const SYDNEY = { kind: 'iana', tz: 'Australia/Sydney' };
/** @type {GridZone} */
const LONDON = { kind: 'iana', tz: 'Europe/London' };
/** @type {GridZone} */
const KOLKATA = { kind: 'iana', tz: 'Asia/Kolkata' };
const ZONES = [SYDNEY, LONDON, KOLKATA];
const NAMES = ['Sydney', 'London', 'Kolkata'];
const ON = { weekendsUnavailable: true };

/**
 * @param {string} iso
 * @param {readonly GridZone[]} [zones]
 * @param {number} [duration]
 * @param {{ weekendsUnavailable: boolean }} [options]
 */
const details = (iso, zones = ZONES, duration = 60, options = ON) =>
  describeSelection(createSelection(new Date(iso), duration), zones, options);

/** @param {{ hour: number, minute: number }} t */
const hhmm = ({ hour, minute }) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

describe('describeSelection', () => {
  it('gives the start, end and every zone’s local times and ratings', () => {
    // Wed 18 Nov 09:00 Sydney = Tue 17 Nov 22:00 London = Wed 03:30 Kolkata.
    const result = details('2026-11-17T22:00:00Z');
    assert.equal(result.start.toISOString(), '2026-11-17T22:00:00.000Z');
    assert.equal(result.end.toISOString(), '2026-11-17T23:00:00.000Z');
    assert.deepEqual(
      result.zones.map((z) => [hhmm(z.start), hhmm(z.end)]),
      [
        ['09:00', '10:00'],
        ['22:00', '23:00'],
        ['03:30', '04:30'],
      ],
    );
    assert.deepEqual(result.zones[1]?.start, {
      year: 2026,
      month: 11,
      day: 17,
      hour: 22,
      minute: 0,
      weekday: 'Tue',
    });
    assert.deepEqual(
      result.zones.map((z) => z.rating.rating),
      ['best', 'unsuitable', 'unsuitable'],
    );
    assert.deepEqual(result.rating, { rating: 'unsuitable' });
    assert.equal(result.zones[0]?.zone, SYDNEY);
  });

  it('rates the whole duration: Best then Good gives Good', () => {
    // 16:30–17:30 Sydney.
    const result = details('2026-11-18T05:30:00Z', [SYDNEY]);
    assert.deepEqual(result.rating, { rating: 'good', d: 15 });
    assert.deepEqual(result.zones[0]?.rating, { rating: 'good', d: 15 });
  });

  it('is Unsuitable when any slot touches Unsuitable', () => {
    // 19:30–20:30 Sydney.
    const result = details('2026-11-18T08:30:00Z', [SYDNEY]);
    assert.deepEqual(result.rating, { rating: 'unsuitable' });
  });

  it('covers durations longer than an hour', () => {
    const result = details('2026-11-17T23:00:00Z', [SYDNEY], 120);
    assert.equal(result.end.toISOString(), '2026-11-18T01:00:00.000Z');
    assert.equal(
      hhmm(/** @type {{ hour: number, minute: number }} */ (result.zones[0]?.end)),
      '12:00',
    );
    assert.deepEqual(result.rating, { rating: 'best' });
  });

  it('applies the weekend rule only when weekends are unavailable', () => {
    // Sat 21 Nov 10:00 Sydney.
    const saturday = '2026-11-20T23:00:00Z';
    assert.deepEqual(details(saturday, [SYDNEY], 60, ON).rating, { rating: 'unsuitable' });
    assert.deepEqual(details(saturday, [SYDNEY], 60, { weekendsUnavailable: false }).rating, {
      rating: 'best',
    });
  });

  it('uses each zone’s country for its weekend', () => {
    // Fri 20 Nov 11:00 in Riyadh (a weekend day in SA), 19:00 Sydney.
    const riyadh = /** @type {GridZone} */ ({ kind: 'iana', tz: 'Asia/Riyadh', country: 'SA' });
    const result = details('2026-11-20T08:00:00Z', [SYDNEY, riyadh]);
    assert.deepEqual(result.zones[1]?.rating, { rating: 'unsuitable' });
  });

  it('works with a fixed-offset zone', () => {
    /** @type {GridZone} */
    const fixed = { kind: 'fixed', minutes: 330 };
    const result = details('2026-11-17T22:00:00Z', [SYDNEY, fixed]);
    assert.equal(
      hhmm(/** @type {{ hour: number, minute: number }} */ (result.zones[1]?.start)),
      '03:30',
    );
    assert.equal(result.zones[1]?.start.weekday, 'Wed');
    assert.deepEqual(result.zones[1]?.rating, { rating: 'unsuitable' });
  });
});

describe('selectionSummary', () => {
  it('gives the home date and range, and the rating in words, in both cycles', () => {
    const result = details('2026-11-17T22:00:00Z');
    assert.deepEqual(selectionSummary(result, 'Sydney', 'h23'), {
      when: 'Wed 18 Nov, 09:00–10:00 Sydney',
      rating: 'Unsuitable for some',
    });
    assert.deepEqual(selectionSummary(result, 'Sydney', 'h12'), {
      when: 'Wed 18 Nov, 9:00 am–10:00 am Sydney',
      rating: 'Unsuitable for some',
    });
  });

  it('words Best and Good for all', () => {
    assert.equal(
      selectionSummary(details('2026-11-17T23:00:00Z', [SYDNEY]), 'Sydney', 'h23').rating,
      'Best for all',
    );
    assert.equal(
      selectionSummary(details('2026-11-18T05:30:00Z', [SYDNEY]), 'Sydney', 'h23').rating,
      'Good for all',
    );
  });

  it('uses the home date at the start', () => {
    // 23:30 Sydney Wed to 00:30 Thu.
    const result = details('2026-11-18T12:30:00Z', [SYDNEY]);
    assert.equal(selectionSummary(result, 'Home', 'h23').when, 'Wed 18 Nov, 23:30–00:30 Home');
  });
});

describe('slotLabel', () => {
  it('describes the slot in 24-hour time, with a weekday only where the date differs', () => {
    assert.equal(
      slotLabel(details('2026-11-17T22:00:00Z'), NAMES, 'h23'),
      'Wednesday 18 November, 09:00 Sydney. Unsuitable for someone. London 22:00 Tuesday, Unsuitable. Kolkata 03:30, Unsuitable.',
    );
  });

  it('describes the slot in 12-hour time', () => {
    assert.equal(
      slotLabel(details('2026-11-17T22:00:00Z'), NAMES, 'h12'),
      'Wednesday 18 November, 9:00 am Sydney. Unsuitable for someone. London 10:00 pm Tuesday, Unsuitable. Kolkata 3:30 am, Unsuitable.',
    );
  });

  it('says Best and Good for everyone', () => {
    assert.equal(
      slotLabel(details('2026-11-17T23:00:00Z', [SYDNEY]), ['Sydney'], 'h23'),
      'Wednesday 18 November, 10:00 Sydney. Best for everyone.',
    );
    assert.equal(
      slotLabel(details('2026-11-18T05:30:00Z', [SYDNEY]), ['Sydney'], 'h12'),
      'Wednesday 18 November, 4:30 pm Sydney. Good for everyone.',
    );
  });

  it('names a later local date too', () => {
    // Home London: Tue 17 Nov 17:00 is Wed 04:00 in Sydney.
    const result = details('2026-11-17T17:00:00Z', [LONDON, SYDNEY]);
    assert.equal(
      slotLabel(result, ['London', 'Sydney'], 'h23'),
      'Tuesday 17 November, 17:00 London. Unsuitable for someone. Sydney 04:00 Wednesday, Unsuitable.',
    );
  });
});
