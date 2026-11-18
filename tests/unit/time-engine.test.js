import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isObservingDst,
  nextTransition,
  zoneGapMinutes,
  zoneHourCells,
  zoneTransitions,
} from '../../src/lib/time-engine.js';
import { zoneLocalParts } from '../../src/lib/zones.js';

/** @typedef {import('../../src/lib/zones.js').Zone} Zone */
/** @typedef {import('../../src/lib/time-engine.js').HourCell} HourCell */

/** @param {string} tz @returns {Zone} */
const iana = (tz) => ({ kind: 'iana', tz });
const london = iana('Europe/London');
const sydney = iana('Australia/Sydney');
const newYork = iana('America/New_York');
const lordHowe = iana('Australia/Lord_Howe');
const chatham = iana('Pacific/Chatham');
const kathmandu = iana('Asia/Kathmandu');
const tokyo = iana('Asia/Tokyo');
/** @type {Zone} */
const fixed660 = { kind: 'fixed', minutes: 660 };

/** @param {string} iso */
const at = (iso) => new Date(iso);
const HOUR = 3600000;

/**
 * Cells of `zone` whose local date is `day` ("YYYY-MM-DD"), from a window
 * wide enough to hold that whole local day.
 * @param {Zone} zone
 * @param {string} day
 */
function cellsOn(zone, day) {
  const noon = at(`${day}T12:00:00Z`).getTime();
  const cells = zoneHourCells(zone, new Date(noon - 2 * 24 * HOUR), new Date(noon + 2 * 24 * HOUR));
  const [year, month, date] = day.split('-').map(Number);
  return cells.filter((c) => c.date.year === year && c.date.month === month && c.date.day === date);
}

/** @param {HourCell[]} cells */
function spanHours(cells) {
  const first = cells[0];
  const last = cells[cells.length - 1];
  assert.ok(first && last);
  return (last.end.getTime() - first.start.getTime()) / HOUR;
}

/** @param {HourCell[]} cells */
function assertContiguous(cells) {
  for (let i = 1; i < cells.length; i++) {
    assert.equal(cells[i - 1]?.end.getTime(), cells[i]?.start.getTime());
  }
}

/** @param {HourCell[]} cells @param {number} hour */
function cellAt(cells, hour) {
  const cell = cells.find((c) => c.hour === hour);
  assert.ok(cell, `no ${hour}:00 cell`);
  return cell;
}

describe('zoneTransitions', () => {
  it('finds London and Sydney transitions to the minute (T1)', () => {
    const from = at('2026-03-01T00:00Z');
    const to = at('2026-04-06T00:00Z');
    assert.deepEqual(zoneTransitions(london, from, to), [
      { at: at('2026-03-29T01:00:00.000Z'), offsetBefore: 0, offsetAfter: 60 },
    ]);
    assert.deepEqual(zoneTransitions(sydney, from, to), [
      { at: at('2026-04-04T16:00:00.000Z'), offsetBefore: 660, offsetAfter: 600 },
    ]);
  });

  it('returns [] when the window is empty or backwards', () => {
    assert.deepEqual(zoneTransitions(london, at('2026-04-06T00:00Z'), at('2026-03-01T00:00Z')), []);
    assert.deepEqual(zoneTransitions(london, at('2026-03-01T00:00Z'), at('2026-03-01T00:00Z')), []);
  });

  it('includes a transition at `to` but not at `from`', () => {
    const t = at('2026-03-29T01:00Z');
    assert.equal(zoneTransitions(london, at('2026-03-28T00:00Z'), t).length, 1);
    assert.equal(zoneTransitions(london, t, at('2026-03-30T00:00Z')).length, 0);
  });
});

describe('zoneGapMinutes', () => {
  it('tracks Sydney against London across both transitions (T1)', () => {
    assert.equal(zoneGapMinutes(sydney, london, at('2026-03-01T12:00Z')), 660);
    assert.equal(zoneGapMinutes(sydney, london, at('2026-03-30T12:00Z')), 600);
    assert.equal(zoneGapMinutes(sydney, london, at('2026-04-06T12:00Z')), 540);
  });

  it('is negative when the first zone is behind', () => {
    assert.equal(zoneGapMinutes(london, sydney, at('2026-03-01T12:00Z')), -660);
  });
});

describe('zoneHourCells: New York (T6)', () => {
  it('repeats 01:00 on the fall-back day and flags the second', () => {
    const cells = cellsOn(newYork, '2026-11-01');
    const ones = cells.filter((c) => c.hour === 1);
    assert.equal(ones.length, 2);
    assert.equal(ones[0]?.start.toISOString(), '2026-11-01T05:00:00.000Z');
    assert.equal(ones[0]?.repeat, false);
    assert.equal(ones[1]?.start.toISOString(), '2026-11-01T06:00:00.000Z');
    assert.equal(ones[1]?.repeat, true);
    assert.equal(cells.filter((c) => c.repeat).length, 1);
    assert.equal(cells.length, 25);
    assert.equal(spanHours(cells), 25);
    assertContiguous(cells);
  });

  it('flags no other cell in the surrounding window', () => {
    const cells = zoneHourCells(newYork, at('2026-10-30T00:00Z'), at('2026-11-03T00:00Z'));
    assert.deepEqual(
      cells.filter((c) => c.repeat).map((c) => c.start.toISOString()),
      ['2026-11-01T06:00:00.000Z'],
    );
  });

  it('keeps the repeat flag when the window starts after the transition', () => {
    const cells = zoneHourCells(newYork, at('2026-11-01T06:30Z'), at('2026-11-01T12:00Z'));
    assert.equal(cells[0]?.start.toISOString(), '2026-11-01T06:00:00.000Z');
    assert.equal(cells[0]?.repeat, true);
  });

  it('skips 02:00 on the spring-forward day', () => {
    const cells = cellsOn(newYork, '2026-03-08');
    assert.equal(
      cells.some((c) => c.hour === 2),
      false,
    );
    assert.equal(cells.length, 23);
    assert.equal(spanHours(cells), 23);
    assert.equal(
      cells.some((c) => c.repeat),
      false,
    );
    assertContiguous(cells);
    assert.deepEqual(zoneTransitions(newYork, at('2026-03-07T00:00Z'), at('2026-03-09T00:00Z')), [
      { at: at('2026-03-08T07:00:00.000Z'), offsetBefore: -300, offsetAfter: -240 },
    ]);
  });
});

describe('zoneHourCells: Lord Howe (T4)', () => {
  it('gives a 24.5 h day with a 90-minute 01:00 cell on fall back', () => {
    const cells = cellsOn(lordHowe, '2026-04-05');
    assert.equal(spanHours(cells), 24.5);
    const one = cellAt(cells, 1);
    assert.equal(one.start.toISOString(), '2026-04-04T14:00:00.000Z');
    assert.equal(one.end.toISOString(), '2026-04-04T15:30:00.000Z');
    for (const c of cells) {
      assert.equal(zoneLocalParts(lordHowe, c.start).minute, 0);
      assert.equal(c.repeat, false);
    }
    assertContiguous(cells);
  });

  it('gives a 23.5 h day with no 02:00 cell on spring forward', () => {
    const cells = cellsOn(lordHowe, '2026-10-04');
    assert.equal(spanHours(cells), 23.5);
    assert.equal(
      cells.some((c) => c.hour === 2),
      false,
    );
    const one = cellAt(cells, 1);
    assert.equal(one.start.toISOString(), '2026-10-03T14:30:00.000Z');
    assert.equal(one.end.toISOString(), '2026-10-03T16:00:00.000Z');
    for (const c of cells) {
      assert.equal(zoneLocalParts(lordHowe, c.start).minute, 0);
      assert.equal(c.repeat, false);
    }
    assertContiguous(cells);
  });

  it('finds both 30-minute transitions', () => {
    assert.deepEqual(zoneTransitions(lordHowe, at('2026-01-01T00:00Z'), at('2026-12-31T00:00Z')), [
      { at: at('2026-04-04T15:00:00.000Z'), offsetBefore: 660, offsetAfter: 630 },
      { at: at('2026-10-03T15:30:00.000Z'), offsetBefore: 630, offsetAfter: 660 },
    ]);
  });
});

describe('zoneHourCells: :45 zones (T3)', () => {
  it('starts Kathmandu cells at UTC minute 15', () => {
    const cells = zoneHourCells(kathmandu, at('2026-06-15T00:00Z'), at('2026-06-16T00:00Z'));
    assert.ok(cells.length >= 24);
    for (const c of cells) assert.equal(c.start.getUTCMinutes(), 15);
    const nine = cells.find((c) => c.start.toISOString() === '2026-06-15T03:15:00.000Z');
    assert.equal(nine?.hour, 9);
  });

  it('starts Chatham cells at UTC minute 15 in both seasons', () => {
    const june = zoneHourCells(chatham, at('2026-06-15T00:00Z'), at('2026-06-16T00:00Z'));
    for (const c of june) assert.equal(c.start.getUTCMinutes(), 15);
    assert.equal(june.find((c) => c.start.toISOString() === '2026-06-15T00:15:00.000Z')?.hour, 13);
    const january = zoneHourCells(chatham, at('2026-01-15T00:00Z'), at('2026-01-16T00:00Z'));
    for (const c of january) assert.equal(c.start.getUTCMinutes(), 15);
    assert.equal(
      january.find((c) => c.start.toISOString() === '2026-01-15T00:15:00.000Z')?.hour,
      14,
    );
  });

  it('skips Chatham 03:00 on 27 Sep 2026', () => {
    const cells = cellsOn(chatham, '2026-09-27');
    assert.equal(
      cells.some((c) => c.hour === 3),
      false,
    );
    assertContiguous(cells);
    assert.deepEqual(zoneTransitions(chatham, at('2026-09-26T00:00Z'), at('2026-09-28T00:00Z')), [
      { at: at('2026-09-26T14:00:00.000Z'), offsetBefore: 765, offsetAfter: 825 },
    ]);
  });
});

describe('fixed zones', () => {
  it('have no transitions, no DST and no next transition', () => {
    assert.deepEqual(
      zoneTransitions(fixed660, at('2026-01-01T00:00Z'), at('2027-01-01T00:00Z')),
      [],
    );
    assert.equal(isObservingDst(fixed660, at('2026-07-01T00:00Z')), false);
    assert.equal(nextTransition(fixed660, at('2026-01-01T00:00Z'), 365), null);
  });

  it('gap against an IANA zone (T8)', () => {
    assert.equal(
      zoneGapMinutes(sydney, { kind: 'fixed', minutes: 600 }, at('2026-01-15T00:00Z')),
      60,
    );
  });

  it('start cells at UTC minute 15 for +5:45', () => {
    /** @type {Zone} */
    const zone = { kind: 'fixed', minutes: 345 };
    const cells = zoneHourCells(zone, at('2026-06-15T00:00Z'), at('2026-06-16T00:00Z'));
    assert.equal(cells.length, 25);
    for (const c of cells) {
      assert.equal(c.start.getUTCMinutes(), 15);
      assert.equal(c.end.getTime() - c.start.getTime(), HOUR);
      assert.equal(c.repeat, false);
    }
  });
});

describe('isObservingDst and nextTransition', () => {
  it('reports DST in both hemispheres', () => {
    assert.equal(isObservingDst(london, at('2026-07-01T00:00Z')), true);
    assert.equal(isObservingDst(london, at('2026-01-15T00:00Z')), false);
    assert.equal(isObservingDst(sydney, at('2026-01-15T00:00Z')), true);
    assert.equal(isObservingDst(sydney, at('2026-07-01T00:00Z')), false);
    assert.equal(isObservingDst(tokyo, at('2026-01-15T00:00Z')), false);
    assert.equal(isObservingDst(tokyo, at('2026-07-01T00:00Z')), false);
  });

  it('finds the next transition within the given days', () => {
    assert.deepEqual(nextTransition(london, at('2026-03-20T00:00Z'), 14), {
      at: at('2026-03-29T01:00:00.000Z'),
      offsetBefore: 0,
      offsetAfter: 60,
    });
    assert.equal(nextTransition(london, at('2026-03-20T00:00Z'), 7), null);
    assert.equal(nextTransition(tokyo, at('2026-01-01T00:00Z'), 365), null);
  });
});

describe('without Temporal', () => {
  it('runs every function on Intl alone', () => {
    const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
    const saved = g.Temporal;
    g.Temporal = undefined;
    try {
      assert.deepEqual(zoneTransitions(london, at('2026-03-01T00:00Z'), at('2026-04-06T00:00Z')), [
        { at: at('2026-03-29T01:00:00.000Z'), offsetBefore: 0, offsetAfter: 60 },
      ]);
      const cells = cellsOn(london, '2026-03-29');
      assert.equal(cells.length, 23);
      assert.equal(
        cells.some((c) => c.hour === 1),
        false,
      );
      assert.equal(zoneGapMinutes(sydney, london, at('2026-03-30T12:00Z')), 600);
      assert.equal(isObservingDst(london, at('2026-07-01T00:00Z')), true);
      assert.equal(isObservingDst(london, at('2026-01-15T00:00Z')), false);
      assert.equal(
        nextTransition(london, at('2026-03-20T00:00Z'), 14)?.at.toISOString(),
        '2026-03-29T01:00:00.000Z',
      );
    } finally {
      g.Temporal = saved;
    }
  });
});
