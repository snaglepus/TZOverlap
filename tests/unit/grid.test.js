import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_DAYS,
  anchorStart,
  buildGrid,
  extendExtent,
  formatAnchor,
  gridWindow,
  headerInstant,
  heatStep,
  initialExtent,
  parseAnchor,
  sameAnchor,
  todayAnchor,
} from '../../src/lib/grid.js';
import { zoneLocalParts } from '../../src/lib/zones.js';

/** @typedef {import('../../src/lib/zones.js').Zone} Zone */
/** @typedef {import('../../src/lib/grid.js').GridCell} GridCell */

/** @param {string} tz @returns {Zone} */
const iana = (tz) => ({ kind: 'iana', tz });
const sydney = iana('Australia/Sydney');
const newYork = iana('America/New_York');
const kolkata = iana('Asia/Kolkata');
const kathmandu = iana('Asia/Kathmandu');
const tokyo = iana('Asia/Tokyo');

/** @param {string} iso */
const at = (iso) => new Date(iso);
// Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT, no change that week).
const WEDNESDAY = at('2026-11-18T01:00:00Z');
const london = iana('Europe/London');
const apia = iana('Pacific/Apia');
const kiritimati = iana('Pacific/Kiritimati');

/** @param {string} text "YYYY-MM-DD" */
const ymd = (text) => {
  const [year, month, d] = text.split('-').map(Number);
  return {
    year: /** @type {number} */ (year),
    month: /** @type {number} */ (month),
    day: /** @type {number} */ (d),
  };
};
const NOV_18 = ymd('2026-11-18');

/** @param {number} x */
const frac = (x) => ((x % 1) + 1) % 1;

/**
 * Cells of `cells` on local date `day` ("YYYY-MM-DD") in `zone`.
 * @param {Zone} zone
 * @param {GridCell[]} cells
 * @param {string} day
 */
function cellsOn(zone, cells, day) {
  return cells.filter((cell) => {
    const p = zoneLocalParts(zone, cell.start);
    const key = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    return key === day;
  });
}

/**
 * @param {Zone} zone
 * @param {GridCell[]} cells
 * @param {string} day
 * @param {number} hour
 */
function cellAt(zone, cells, day, hour) {
  const cell = cellsOn(zone, cells, day).find((c) => c.hour === hour);
  assert.ok(cell, `${day} ${hour}:00 cell`);
  return cell;
}

describe('gridWindow', () => {
  it('spans yesterday to tomorrow in the home zone: 72 hours on a non-DST day', () => {
    const { start, end } = gridWindow(sydney, NOV_18);
    assert.equal(start.toISOString(), '2026-11-16T13:00:00.000Z'); // 17 Nov 00:00 AEDT
    assert.equal(end.toISOString(), '2026-11-19T13:00:00.000Z'); // 20 Nov 00:00 AEDT
    const grid = buildGrid({ homeZone: sydney, zones: [], anchor: NOV_18 });
    assert.ok(grid.hours >= 72);
    assert.equal(grid.hours, 72);
    assert.equal(grid.rows[0]?.cells.length, 72);
  });
});

describe('buildGrid rows', () => {
  it('puts the home row first and user rows in the given order', () => {
    const grid = buildGrid({ homeZone: sydney, zones: [tokyo, kolkata], anchor: NOV_18 });
    assert.deepEqual(
      grid.rows.map((r) => r.zone),
      [sydney, tokyo, kolkata],
    );
  });

  it('places home cells on whole columns and half-hour zones between them', () => {
    const grid = buildGrid({ homeZone: sydney, zones: [kolkata, kathmandu], anchor: NOV_18 });
    const [home, kol, ktm] = grid.rows;
    assert.ok(home && kol && ktm);
    home.cells.forEach((cell, i) => {
      assert.equal(cell.left, i);
      assert.equal(cell.width, 1);
    });
    assert.ok(kol.cells.length > 0 && ktm.cells.length > 0);
    for (const cell of kol.cells) assert.equal(frac(cell.left), 0.5);
    for (const cell of ktm.cells) assert.equal(frac(cell.left), 0.25);
    // Cells overhang the window edges unclipped.
    assert.equal(kol.cells[0]?.left, -0.5);
  });

  it('gives a repeated hour two cells, the second flagged repeat (New York, 1 Nov 2026)', () => {
    const grid = buildGrid({
      homeZone: sydney,
      zones: [newYork],
      anchor: ymd('2026-11-01'),
    });
    const cells = /** @type {GridCell[]} */ (grid.rows[1]?.cells);
    const ones = cellsOn(newYork, cells, '2026-11-01').filter((c) => c.hour === 1);
    assert.deepEqual(
      ones.map((c) => [c.start.toISOString(), c.repeat]),
      [
        ['2026-11-01T05:00:00.000Z', false],
        ['2026-11-01T06:00:00.000Z', true],
      ],
    );
    for (const day of ['2026-10-31', '2026-11-02']) {
      const others = cellsOn(newYork, cells, day).filter((c) => c.hour === 1);
      assert.equal(others.length, 1, day);
      assert.equal(others[0]?.repeat, false, day);
    }
  });

  it('has no cell for a skipped hour (Sydney, 4 Oct 2026)', () => {
    const grid = buildGrid({ homeZone: sydney, zones: [], anchor: ymd('2026-10-04') });
    const cells = /** @type {GridCell[]} */ (grid.rows[0]?.cells);
    const day = cellsOn(sydney, cells, '2026-10-04');
    assert.equal(day.length, 23);
    assert.equal(
      day.some((c) => c.hour === 2),
      false,
    );
    assert.equal(grid.hours, 71);
  });

  it('gives a fixed zone a row', () => {
    /** @type {Zone} */
    const fixed = { kind: 'fixed', minutes: 330 };
    const grid = buildGrid({ homeZone: sydney, zones: [fixed], anchor: NOV_18 });
    const row = grid.rows[1];
    assert.ok(row);
    assert.deepEqual(row.zone, fixed);
    assert.ok(row.cells.length >= 72);
    for (const cell of row.cells) assert.equal(frac(cell.left), 0.5);
  });
});

describe('buildGrid ratings', () => {
  const grid = buildGrid({ homeZone: sydney, zones: [], anchor: NOV_18 });
  const cells = /** @type {GridCell[]} */ (grid.rows[0]?.cells);

  it('rates Best, Good and Unsuitable hours', () => {
    assert.equal(cellAt(sydney, cells, '2026-11-18', 9).rating, 'best');
    assert.equal(cellAt(sydney, cells, '2026-11-18', 16).rating, 'best');
    assert.equal(cellAt(sydney, cells, '2026-11-18', 9).step, undefined);
    assert.equal(cellAt(sydney, cells, '2026-11-18', 20).rating, 'unsuitable');
    assert.equal(cellAt(sydney, cells, '2026-11-18', 5).rating, 'unsuitable');
  });

  it('steps Good hours 0 / 1 / 2 away from Best', () => {
    for (const [hour, step] of [
      [8, 0],
      [17, 0],
      [7, 1],
      [18, 1],
      [6, 2],
      [19, 2],
    ]) {
      const cell = cellAt(sydney, cells, '2026-11-18', /** @type {number} */ (hour));
      assert.equal(cell.rating, 'good', `${hour}:00`);
      assert.equal(cell.step, step, `${hour}:00`);
    }
  });

  it('rates weekend cells Unsuitable only when weekends are unavailable', () => {
    const saturday = ymd('2026-11-21');
    const on = buildGrid({ homeZone: sydney, zones: [], anchor: saturday });
    const off = buildGrid({
      homeZone: sydney,
      zones: [],
      anchor: saturday,
      weekendsUnavailable: false,
    });
    const onCells = /** @type {GridCell[]} */ (on.rows[0]?.cells);
    const offCells = /** @type {GridCell[]} */ (off.rows[0]?.cells);
    assert.ok(cellsOn(sydney, onCells, '2026-11-21').every((c) => c.rating === 'unsuitable'));
    assert.equal(cellAt(sydney, offCells, '2026-11-21', 10).rating, 'best');
    assert.equal(cellAt(sydney, offCells, '2026-11-21', 7).step, 1);
    // Friday stays rated by hour either way.
    assert.equal(cellAt(sydney, onCells, '2026-11-20', 10).rating, 'best');
  });

  it('exposes the heat step of a rating', () => {
    assert.equal(heatStep({ rating: 'good', d: 0 }), 0);
    assert.equal(heatStep({ rating: 'good', d: 59 }), 0);
    assert.equal(heatStep({ rating: 'good', d: 60 }), 1);
    assert.equal(heatStep({ rating: 'good', d: 165 }), 2);
    assert.equal(heatStep({ rating: 'best' }), undefined);
    assert.equal(heatStep({ rating: 'unsuitable' }), undefined);
  });
});

describe('buildGrid Everyone segments', () => {
  const grid = buildGrid({ homeZone: sydney, zones: [tokyo], anchor: NOV_18 });

  it('cover the window on 15-minute boundaries with no two equal neighbours', () => {
    const { everyone } = grid;
    assert.equal(everyone[0]?.start.getTime(), grid.start.getTime());
    assert.equal(everyone[everyone.length - 1]?.end.getTime(), grid.end.getTime());
    everyone.forEach((seg, i) => {
      assert.equal(seg.start.getTime() % (15 * 60000), 0);
      assert.equal(seg.end.getTime() % (15 * 60000), 0);
      assert.equal(seg.left, (seg.start.getTime() - grid.start.getTime()) / 3600000);
      assert.equal(seg.width, (seg.end.getTime() - seg.start.getTime()) / 3600000);
      const next = everyone[i + 1];
      if (!next) return;
      assert.equal(next.start.getTime(), seg.end.getTime());
      assert.ok(next.rating !== seg.rating || next.step !== seg.step, `segment ${i}`);
    });
  });

  it('use the reddest step among the zones (Sydney 19:00, Tokyo 17:00 -> step 2)', () => {
    const instant = at('2026-11-18T08:00:00Z'); // Sydney 19:00, Tokyo 17:00
    const seg = grid.everyone.find((s) => s.start <= instant && instant < s.end);
    assert.ok(seg);
    assert.equal(seg.rating, 'good');
    assert.equal(seg.step, 2);
  });

  it('mirror the home row when no zones are added', () => {
    const alone = buildGrid({ homeZone: sydney, zones: [], anchor: NOV_18 });
    const best = alone.everyone.filter((s) => s.rating === 'best');
    assert.deepEqual(
      best.map((s) => zoneLocalParts(sydney, s.start).hour),
      [9, 9, 9],
    );
    assert.ok(best.every((s) => s.width === 8));
  });

  it('start Best at a half-hour column with Kolkata (Sydney 14:30)', () => {
    const k = buildGrid({ homeZone: sydney, zones: [kolkata], anchor: NOV_18 });
    const best = k.everyone.filter((s) => s.rating === 'best');
    assert.ok(best.length > 0);
    for (const seg of best) {
      const p = zoneLocalParts(sydney, seg.start);
      assert.deepEqual([p.hour, p.minute], [14, 30]);
      assert.equal(frac(seg.left), 0.5);
    }
  });
});

describe('gridWindow extents', () => {
  /** @param {Zone} zone @param {string} anchor @param {number} before @param {number} after */
  const hours = (zone, anchor, before, after) => {
    const { start, end } = gridWindow(zone, ymd(anchor), before, after);
    return (end.getTime() - start.getTime()) / 3600000;
  };

  it('defaults to a day either side and takes asymmetric extents', () => {
    assert.deepEqual(gridWindow(sydney, NOV_18), gridWindow(sydney, NOV_18, 1, 1));
    const { start, end } = gridWindow(sydney, NOV_18, 3, 0);
    assert.equal(start.toISOString(), '2026-11-14T13:00:00.000Z'); // 15 Nov 00:00 AEDT
    assert.equal(end.toISOString(), '2026-11-18T13:00:00.000Z'); // 19 Nov 00:00 AEDT
    assert.equal(hours(sydney, '2026-11-18', 0, 5), 6 * 24);
  });

  it('spans 29 days at the cap', () => {
    const { start, end } = gridWindow(sydney, NOV_18, MAX_DAYS, MAX_DAYS);
    assert.equal(start.toISOString(), '2026-11-03T13:00:00.000Z'); // 4 Nov 00:00 AEDT
    assert.equal(end.toISOString(), '2026-12-02T13:00:00.000Z'); // 3 Dec 00:00 AEDT
    assert.equal(hours(sydney, '2026-11-18', 14, 14), 29 * 24);
  });

  it('counts a DST change: 24 × days ± 1 hours', () => {
    // Sydney 5 Apr 2026: clocks go back (25-hour day).
    assert.equal(hours(sydney, '2026-04-05', 14, 14), 29 * 24 + 1);
    assert.equal(
      gridWindow(sydney, ymd('2026-04-05'), 14, 14).start.toISOString(),
      '2026-03-21T13:00:00.000Z',
    );
    assert.equal(hours(sydney, '2026-04-06', 1, 0), 49);
    // London 29 Mar 2026: forward (23 hours); 25 Oct 2026: back (25 hours).
    assert.equal(hours(london, '2026-03-29', 1, 1), 71);
    assert.equal(hours(london, '2026-03-20', 0, 14), 15 * 24 - 1);
    assert.equal(hours(london, '2026-10-25', 2, 3), 6 * 24 + 1);
  });

  it('leaves out a skipped date (Apia, 30 Dec 2011)', () => {
    const { start, end } = gridWindow(apia, ymd('2011-12-31'));
    assert.equal(start.toISOString(), '2011-12-30T10:00:00.000Z'); // 31 Dec 00:00, UTC+14
    assert.equal(end.toISOString(), '2012-01-01T10:00:00.000Z'); // 2 Jan 00:00
    assert.equal(hours(apia, '2011-12-31', 1, 1), 48);
    assert.equal(hours(apia, '2011-12-31', 2, 1), 72);
  });
});

describe('buildGrid on another date', () => {
  it('uses the rules of that date: 15 Jul 2026, London UTC+1, Sydney UTC+10', () => {
    const grid = buildGrid({ homeZone: sydney, zones: [london], anchor: ymd('2026-07-15') });
    assert.equal(grid.start.toISOString(), '2026-07-13T14:00:00.000Z'); // 14 Jul 00:00 AEST
    assert.equal(grid.hours, 72);
    const londonCells = /** @type {GridCell[]} */ (grid.rows[1]?.cells);
    const nine = londonCells.find((c) => c.start.toISOString() === '2026-07-15T08:00:00.000Z');
    assert.equal(nine?.hour, 9);
    const home = /** @type {GridCell[]} */ (grid.rows[0]?.cells);
    const midnight = home.find((c) => c.start.toISOString() === '2026-07-14T14:00:00.000Z');
    assert.equal(midnight?.hour, 0);
  });

  it('builds 1980 with Kiritimati as home and 14 days before', () => {
    const grid = buildGrid({
      homeZone: kiritimati,
      zones: [sydney],
      anchor: ymd('1980-01-01'),
      before: 14,
    });
    assert.equal(grid.rows[0]?.cells.length, 16 * 24);
  });
});

describe('anchor helpers', () => {
  it("finds today's anchor in the home zone and compares anchors", () => {
    assert.deepEqual(todayAnchor(sydney, WEDNESDAY), NOV_18);
    assert.deepEqual(todayAnchor(newYork, WEDNESDAY), ymd('2026-11-17'));
    assert.equal(sameAnchor(NOV_18, ymd('2026-11-18')), true);
    assert.equal(sameAnchor(NOV_18, ymd('2026-11-19')), false);
    assert.equal(sameAnchor(NOV_18, ymd('2025-11-18')), false);
  });

  it('formats and parses YYYY-MM-DD', () => {
    assert.equal(formatAnchor(ymd('2026-07-05')), '2026-07-05');
    assert.deepEqual(parseAnchor('2026-07-15', sydney), ymd('2026-07-15'));
    assert.deepEqual(parseAnchor('1980-01-01', sydney), ymd('1980-01-01'));
    assert.deepEqual(parseAnchor('2099-12-31', sydney), ymd('2099-12-31'));
    assert.deepEqual(parseAnchor('2011-12-31', apia), ymd('2011-12-31'));
  });

  it('rejects empty, malformed, impossible, out-of-range and skipped dates', () => {
    for (const text of [
      '',
      '2026-02-30',
      '2026-7-15',
      '1979-12-31',
      '2100-01-01',
      'x',
      ' 2026-07-15',
    ]) {
      assert.equal(parseAnchor(text, sydney), null, text);
    }
    assert.equal(parseAnchor('2011-12-30', apia), null);
    assert.deepEqual(parseAnchor('2011-12-30', sydney), ymd('2011-12-30'));
  });

  it('extends an extent by a day on one side, up to the cap', () => {
    assert.deepEqual(extendExtent({ before: 1, after: 1 }, 'before'), { before: 2, after: 1 });
    assert.deepEqual(extendExtent({ before: 1, after: 13 }, 'after'), { before: 1, after: 14 });
    assert.equal(extendExtent({ before: 14, after: 1 }, 'before'), null);
    assert.equal(extendExtent({ before: 1, after: MAX_DAYS }, 'after'), null);
  });

  it('finds the start of the anchor date', () => {
    assert.equal(anchorStart(sydney, NOV_18).toISOString(), '2026-11-17T13:00:00.000Z');
    assert.equal(anchorStart(apia, ymd('2011-12-31')).toISOString(), '2011-12-30T10:00:00.000Z');
    assert.throws(() => anchorStart(apia, ymd('2011-12-30')), RangeError);
  });

  it('opens with an extra day beside a skipped date', () => {
    assert.deepEqual(initialExtent(apia, ymd('2011-12-31')), { before: 2, after: 1 });
    assert.deepEqual(initialExtent(apia, ymd('2011-12-29')), { before: 1, after: 2 });
    assert.deepEqual(initialExtent(apia, ymd('2026-11-18')), { before: 1, after: 1 });
    assert.deepEqual(initialExtent(sydney, NOV_18), { before: 1, after: 1 });
    assert.deepEqual(initialExtent(kiritimati, ymd('1995-01-01')), { before: 2, after: 1 });
  });

  it('shows header offsets at now on today, else 12 hours into the anchor date', () => {
    assert.equal(headerInstant(sydney, NOV_18, WEDNESDAY), WEDNESDAY);
    const later = at('2026-11-01T13:00:00.000Z'); // 2 Nov 00:00 in Sydney
    assert.equal(
      headerInstant(sydney, ymd('2026-11-01'), later).toISOString(),
      '2026-11-01T01:00:00.000Z',
    );
    assert.equal(
      headerInstant(sydney, ymd('2026-07-15'), WEDNESDAY).toISOString(),
      '2026-07-15T02:00:00.000Z',
    );
  });
});

describe('buildGrid weekends', () => {
  const london = iana('Europe/London');
  // Saturday 13 June 2026, 12:00 in London: the window is Fri 12 to Sun 14.
  const SATURDAY = at('2026-06-13T11:00:00Z');
  /** @type {Zone & { country: string }} */
  const riyadh = { kind: 'iana', tz: 'Asia/Riyadh', country: 'SA' };
  /** @type {Zone & { country: string }} */
  const fixedSa = { kind: 'fixed', minutes: 180, country: 'SA' };

  /**
   * Local days ("YYYY-MM-DD") of a row's weekend and weekday cells.
   * @param {Zone} zone
   * @param {GridCell[]} cells
   */
  function days(zone, cells) {
    /** @param {GridCell} cell */
    const day = (cell) => {
      const p = zoneLocalParts(zone, cell.start);
      return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    };
    return {
      weekend: [...new Set(cells.filter((c) => c.weekend).map(day))],
      weekday: [...new Set(cells.filter((c) => !c.weekend).map(day))],
    };
  }

  it('flags Sat-Sun for London, Fri-Sat for Riyadh and Sat-Sun for a fixed zone', () => {
    const grid = buildGrid({
      homeZone: london,
      zones: [riyadh, fixedSa],
      anchor: todayAnchor(london, SATURDAY),
    });
    const [home, ksa, fix] = grid.rows;
    assert.ok(home && ksa && fix);
    assert.deepEqual(days(london, home.cells), {
      weekend: ['2026-06-13', '2026-06-14'],
      weekday: ['2026-06-12'],
    });
    assert.deepEqual(days(riyadh, ksa.cells), {
      weekend: ['2026-06-12', '2026-06-13'],
      weekday: ['2026-06-14', '2026-06-15'],
    });
    assert.deepEqual(days(fixedSa, fix.cells), {
      weekend: ['2026-06-13', '2026-06-14'],
      weekday: ['2026-06-12', '2026-06-15'],
    });
  });

  it('flags the same cells with the setting on or off', () => {
    const on = buildGrid({
      homeZone: london,
      zones: [riyadh],
      anchor: todayAnchor(london, SATURDAY),
    });
    const off = buildGrid({
      homeZone: london,
      zones: [riyadh],
      anchor: todayAnchor(london, SATURDAY),
      weekendsUnavailable: false,
    });
    /** @param {typeof on} grid */
    const flags = (grid) => grid.rows.map((r) => r.cells.map((c) => c.weekend));
    assert.deepEqual(flags(on), flags(off));
    // Only the rating changes: Saturday 10:00 in London.
    /** @param {typeof on} grid */
    const ten = (grid) => cellAt(london, grid.rows[0]?.cells ?? [], '2026-06-13', 10);
    assert.equal(ten(on).rating, 'unsuitable');
    assert.equal(ten(off).rating, 'best');
    assert.equal(ten(off).weekend, true);
  });
});

describe('buildGrid midnights', () => {
  it('places each local midnight inside the window, :30 and :45 zones off the columns', () => {
    const grid = buildGrid({ homeZone: sydney, zones: [kolkata, kathmandu], anchor: NOV_18 });
    const [home, kol, ktm] = grid.rows;
    assert.ok(home && kol && ktm);
    /** @param {import('../../src/lib/grid.js').Midnight[]} list */
    const lefts = (list) => list.map((m) => m.left);
    assert.deepEqual(lefts(home.midnights), [0, 24, 48]);
    assert.equal(home.midnights[0]?.at.toISOString(), '2026-11-16T13:00:00.000Z');
    // Kolkata (UTC+5:30) midnight is 18:30Z, 5.5 hours after Sydney's 13:00Z.
    assert.deepEqual(lefts(kol.midnights), [5.5, 29.5, 53.5]);
    assert.equal(kol.midnights[0]?.at.toISOString(), '2026-11-16T18:30:00.000Z');
    // Kathmandu (UTC+5:45): a quarter of a column off.
    assert.deepEqual(lefts(ktm.midnights), [5.25, 29.25, 53.25]);
    for (const row of grid.rows) {
      for (const m of row.midnights) {
        assert.ok(m.at >= grid.start && m.at < grid.end);
        const p = zoneLocalParts(row.zone, m.at);
        assert.deepEqual([p.hour, p.minute], [0, 0]);
      }
    }
    assert.equal('midnights' in grid, false);
    assert.ok(grid.everyone.every((seg) => !('midnights' in seg)));
  });

  it('starts a day at its first hour when DST skips midnight', () => {
    // Santiago springs forward at 00:00 on Sun 6 Sep 2026: the day starts at 01:00.
    const santiago = iana('America/Santiago');
    const grid = buildGrid({
      homeZone: santiago,
      zones: [],
      anchor: todayAnchor(santiago, at('2026-09-06T15:00:00Z')),
    });
    const day = grid.rows[0]?.midnights.find((m) => zoneLocalParts(santiago, m.at).day === 6);
    assert.ok(day);
    assert.equal(zoneLocalParts(santiago, day.at).hour, 1);
  });
});
