import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BANDS,
  buildSlots,
  combineRatings,
  MAX_HEAT_DISTANCE,
  rateLocalTime,
  rateMeeting,
  SLOT_MINUTES,
} from '../../src/lib/suitability.js';

/** @typedef {import('../../src/lib/zones.js').Zone} Zone */
/** @typedef {import('../../src/lib/suitability.js').Slot} Slot */
/** @typedef {import('../../src/lib/suitability.js').ZoneSlot} ZoneSlot */
/** @typedef {import('../../src/lib/suitability.js').Rating} Rating */

/**
 * @param {string} tz
 * @returns {{ zone: Zone }}
 */
const iana = (tz) => ({ zone: { kind: 'iana', tz } });

/** @param {number} minuteOfDay */
function clock(minuteOfDay) {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** @param {ZoneSlot} z */
const minuteOfDay = (z) => z.hour * 60 + z.minute;

/**
 * @param {Slot} slot
 * @param {number} index
 */
function zoneAt(slot, index) {
  const z = slot.zones[index];
  assert.ok(z);
  return z;
}

/**
 * Runs of consecutive slots whose overlap has `rating`, as local "HH:MM-HH:MM"
 * in zone `index`.
 * @param {Slot[]} slots
 * @param {Rating} rating
 * @param {number} index
 */
function overlapWindows(slots, rating, index) {
  /** @type {string[]} */
  const windows = [];
  let open = -1;
  slots.forEach((slot, i) => {
    const match = slot.overlap.rating === rating;
    if (match && open < 0) open = i;
    const next = slots[i + 1];
    if (match && (!next || next.overlap.rating !== rating)) {
      const first = zoneAt(/** @type {Slot} */ (slots[open]), index);
      const last = zoneAt(slot, index);
      windows.push(`${clock(minuteOfDay(first))}-${clock(minuteOfDay(last) + SLOT_MINUTES)}`);
      open = -1;
    }
  });
  return windows;
}

/**
 * The slot where zone `index` reads the given local date and time.
 * @param {Slot[]} slots
 * @param {number} index
 * @param {{ day: number, hour: number, minute?: number }} local
 */
function slotAtLocal(slots, index, { day, hour, minute = 0 }) {
  const i = slots.findIndex((slot) => {
    const z = zoneAt(slot, index);
    return z.day === day && z.hour === hour && z.minute === minute;
  });
  assert.ok(i >= 0, `no slot at day ${day} ${hour}:${minute}`);
  return { slot: /** @type {Slot} */ (slots[i]), index: i };
}

describe('constants', () => {
  it('holds the bands and heat range in one place', () => {
    assert.equal(SLOT_MINUTES, 15);
    assert.equal(MAX_HEAT_DISTANCE, 165);
    assert.ok(Object.isFrozen(BANDS));
    assert.deepEqual(BANDS.best, { start: 540, end: 1020 });
  });
});

describe('rateLocalTime', () => {
  it('rates the band edges and heat distance (criterion 1)', () => {
    assert.deepEqual(rateLocalTime(9, 0), { rating: 'best' });
    assert.deepEqual(rateLocalTime(16, 45), { rating: 'best' });
    assert.deepEqual(rateLocalTime(6, 0), { rating: 'good', d: 165 });
    assert.deepEqual(rateLocalTime(8, 45), { rating: 'good', d: 0 });
    assert.deepEqual(rateLocalTime(17, 0), { rating: 'good', d: 0 });
    assert.deepEqual(rateLocalTime(19, 45), { rating: 'good', d: 165 });
    assert.deepEqual(rateLocalTime(5, 45), { rating: 'unsuitable' });
    assert.deepEqual(rateLocalTime(20, 0), { rating: 'unsuitable' });
    assert.deepEqual(rateLocalTime(7, 30), { rating: 'good', d: 75 });
    assert.deepEqual(rateLocalTime(18, 15), { rating: 'good', d: 75 });
  });

  it('has no d for Best and Unsuitable', () => {
    assert.equal('d' in rateLocalTime(12, 0), false);
    assert.equal('d' in rateLocalTime(3, 0), false);
  });

  it('floors the minute to its 15-minute slot', () => {
    assert.deepEqual(rateLocalTime(7, 44), { rating: 'good', d: 75 });
    assert.deepEqual(rateLocalTime(8, 59), { rating: 'good', d: 0 });
    assert.deepEqual(rateLocalTime(5, 59), { rating: 'unsuitable' });
  });

  it('rejects bad hours and minutes (criterion 2)', () => {
    assert.throws(() => rateLocalTime(24, 0), RangeError);
    assert.throws(() => rateLocalTime(9, 60), RangeError);
    assert.throws(() => rateLocalTime(9.5, 0), RangeError);
    assert.throws(() => rateLocalTime(-1, 0), RangeError);
  });
});

describe('combineRatings (criterion 3)', () => {
  it('takes the worst rating and the largest Good d', () => {
    assert.deepEqual(
      combineRatings([{ rating: 'best' }, { rating: 'good', d: 30 }, { rating: 'good', d: 120 }]),
      { rating: 'good', d: 120 },
    );
    assert.deepEqual(combineRatings([{ rating: 'best' }, { rating: 'best' }]), { rating: 'best' });
    assert.deepEqual(
      combineRatings([{ rating: 'best' }, { rating: 'good', d: 10 }, { rating: 'unsuitable' }]),
      { rating: 'unsuitable' },
    );
  });

  it('rejects an empty list', () => {
    assert.throws(() => combineRatings([]), RangeError);
  });
});

describe('buildSlots', () => {
  const start = new Date('2026-01-14T00:00:00Z');
  const end = new Date('2026-01-14T01:00:00Z');

  it('rejects bad input (criterion 2)', () => {
    assert.throws(() => buildSlots({ start, end, zones: [] }), RangeError);
    assert.throws(
      () => buildSlots({ start: new Date('2026-01-14T00:05:00Z'), end, zones: [iana('UTC')] }),
      RangeError,
    );
    assert.throws(() => buildSlots({ start, end: start, zones: [iana('UTC')] }), RangeError);
    assert.throws(() => buildSlots({ start: end, end: start, zones: [iana('UTC')] }), RangeError);
  });

  it('returns one slot per 15 minutes, zones in input order', () => {
    const slots = buildSlots({ start, end, zones: [iana('UTC'), iana('Asia/Tokyo')] });
    assert.deepEqual(
      slots.map((slot) => slot.start.toISOString()),
      ['00:00', '00:15', '00:30', '00:45'].map((t) => `2026-01-14T${t}:00.000Z`),
    );
    const first = /** @type {Slot} */ (slots[0]);
    assert.deepEqual(zoneAt(first, 0), {
      rating: 'unsuitable',
      year: 2026,
      month: 1,
      day: 14,
      hour: 0,
      minute: 0,
      weekday: 3,
      weekend: false,
    });
    assert.deepEqual(zoneAt(first, 1), {
      rating: 'best',
      year: 2026,
      month: 1,
      day: 14,
      hour: 9,
      minute: 0,
      weekday: 3,
      weekend: false,
    });
    assert.deepEqual(first.overlap, { rating: 'unsuitable' });
  });

  it('PRD T2: Sydney and Kolkata overlap windows (criterion 4)', () => {
    // Wednesday 14 January 2026 in Sydney (AEDT, UTC+11); Kolkata is UTC+5:30.
    const slots = buildSlots({
      start: new Date('2026-01-13T13:00:00Z'),
      end: new Date('2026-01-14T13:00:00Z'),
      zones: [iana('Australia/Sydney'), iana('Asia/Kolkata')],
    });
    assert.equal(slots.length, 96);
    assert.deepEqual(overlapWindows(slots, 'best', 0), ['14:30-17:00']);
    assert.deepEqual(overlapWindows(slots, 'good', 0), ['11:30-14:30', '17:00-20:00']);
  });

  it('PRD T5: Kiritimati and Pago Pago across the date line (criterion 5)', () => {
    const slots = buildSlots({
      start: new Date('2026-01-14T00:00:00Z'),
      end: new Date('2026-01-16T00:00:00Z'),
      zones: [iana('Pacific/Kiritimati'), iana('Pacific/Pago_Pago')],
    });
    const kiritimati = slotAtLocal(slots, 0, { day: 15, hour: 9 });
    const pagoPago = slotAtLocal(slots, 1, { day: 15, hour: 9 });
    assert.equal(pagoPago.index - kiritimati.index, 100);
    assert.equal(pagoPago.slot.start.getTime() - kiritimati.slot.start.getTime(), 25 * 3600000);

    for (const slot of slots) {
      const k = zoneAt(slot, 0);
      const p = zoneAt(slot, 1);
      assert.equal((minuteOfDay(p) + 60) % 1440, minuteOfDay(k));
      const dayGap =
        (Date.UTC(k.year, k.month - 1, k.day) - Date.UTC(p.year, p.month - 1, p.day)) / 86400000;
      assert.equal(dayGap, k.hour === 0 ? 2 : 1, slot.start.toISOString());
    }

    const wide = slots.find((slot) => slot.start.toISOString() === '2026-01-14T17:00:00.000Z');
    assert.ok(wide);
    assert.deepEqual(zoneAt(wide, 0), {
      rating: 'good',
      d: 105,
      year: 2026,
      month: 1,
      day: 15,
      hour: 7,
      minute: 0,
      weekday: 4,
      weekend: false,
    });
    assert.deepEqual(zoneAt(wide, 1), {
      rating: 'good',
      d: 165,
      year: 2026,
      month: 1,
      day: 14,
      hour: 6,
      minute: 0,
      weekday: 3,
      weekend: false,
    });
    assert.deepEqual(wide.overlap, { rating: 'good', d: 165 });
  });

  describe('PRD T9: Riyadh weekend (criterion 6)', () => {
    // Thursday 15 to Sunday 18 January 2026 in Riyadh (UTC+3).
    /** @param {boolean} weekendsUnavailable */
    const riyadh = (weekendsUnavailable) =>
      buildSlots({
        start: new Date('2026-01-14T21:00:00Z'),
        end: new Date('2026-01-18T21:00:00Z'),
        zones: [{ zone: { kind: 'iana', tz: 'Asia/Riyadh' }, country: 'SA' }],
        weekendsUnavailable,
      });
    /** @param {Slot[]} slots */
    const weekendTags = (slots) =>
      slots.map((slot) => {
        const z = zoneAt(slot, 0);
        return [z.day, z.weekday, z.weekend];
      });

    it('tags Friday and Saturday as weekend, Thursday and Sunday not', () => {
      const slots = riyadh(true);
      assert.equal(slots.length, 4 * 96);
      for (const slot of slots) {
        const z = zoneAt(slot, 0);
        const expected = { 15: [4, false], 16: [5, true], 17: [6, true], 18: [0, false] }[z.day];
        assert.deepEqual([z.weekday, z.weekend], expected, `day ${z.day}`);
      }
    });

    it('rates weekend slots Unsuitable when weekends are unavailable', () => {
      const slots = riyadh(true);
      const at = (/** @type {number} */ day, /** @type {number} */ hour) =>
        zoneAt(slotAtLocal(slots, 0, { day, hour }).slot, 0);
      const friday = at(16, 10);
      assert.equal(friday.rating, 'unsuitable');
      assert.equal('d' in friday, false);
      const saturday = at(17, 10);
      assert.equal(saturday.rating, 'unsuitable');
      assert.equal('d' in saturday, false);
      assert.equal(at(18, 10).rating, 'best');
      assert.equal(at(15, 10).rating, 'best');
    });

    it('rates weekend slots by hour when weekends are available', () => {
      const off = riyadh(false);
      const at = (/** @type {number} */ day, /** @type {number} */ hour) =>
        zoneAt(slotAtLocal(off, 0, { day, hour }).slot, 0);
      assert.equal(at(16, 10).rating, 'best');
      assert.equal(at(16, 7).rating, 'good');
      assert.equal(at(16, 7).d, 105);
      assert.deepEqual(weekendTags(off), weekendTags(riyadh(true)));
    });
  });

  it('PRD T10: eight zones spanning 21 h have no overlap (criterion 8)', () => {
    // Each zone's Good-or-better window [06:00, 20:00) local, in UTC hours mod 24:
    // London [6, 20), Berlin [5, 19), New York [11, 24) ∪ [0, 1),
    // Los Angeles [14, 24) ∪ [0, 4), Honolulu [16, 24) ∪ [0, 6) → together [16, 19).
    // Kolkata [0.5, 14.5) misses [16, 19), so the intersection is empty
    // (Tokyo [21, 24) ∪ [0, 11) and Sydney [19, 24) ∪ [0, 9) miss it too).
    const tzs = [
      'Pacific/Honolulu',
      'America/Los_Angeles',
      'America/New_York',
      'Europe/London',
      'Europe/Berlin',
      'Asia/Kolkata',
      'Asia/Tokyo',
      'Australia/Sydney',
    ];
    const slots = buildSlots({
      start: new Date('2026-01-14T00:00:00Z'),
      end: new Date('2026-01-15T00:00:00Z'),
      zones: tzs.map(iana),
    });
    for (const slot of slots) {
      for (const z of slot.zones) assert.equal(z.weekend, false);
    }
    assert.equal(
      slots.some((slot) => slot.overlap.rating === 'best'),
      false,
    );
    assert.ok(slots.every((slot) => slot.overlap.rating === 'unsuitable'));
    tzs.forEach((tz, i) => {
      assert.ok(
        slots.some((slot) => zoneAt(slot, i).rating === 'best'),
        `${tz} has a Best slot of its own`,
      );
    });
  });

  it('rates fixed zones by their own local time (criterion 10)', () => {
    const window = {
      start: new Date('2026-01-14T00:00:00Z'),
      end: new Date('2026-01-15T00:00:00Z'),
    };
    const india = buildSlots({ ...window, zones: [{ zone: { kind: 'fixed', minutes: 330 } }] });
    const onTheHour = (/** @type {Slot} */ slot) => slot.start.getUTCMinutes() === 0;
    assert.ok(india.filter(onTheHour).every((slot) => zoneAt(slot, 0).minute === 30));
    const nine = india.find((slot) => slot.start.toISOString() === '2026-01-14T03:30:00.000Z');
    assert.ok(nine);
    assert.equal(zoneAt(nine, 0).hour, 9);
    assert.equal(zoneAt(nine, 0).minute, 0);
    assert.equal(zoneAt(nine, 0).rating, 'best');

    const nepal = buildSlots({ ...window, zones: [{ zone: { kind: 'fixed', minutes: 345 } }] });
    assert.ok(nepal.filter(onTheHour).every((slot) => zoneAt(slot, 0).minute === 45));
    for (const slot of nepal) {
      const z = zoneAt(slot, 0);
      const expected = rateLocalTime(z.hour, z.minute);
      assert.equal(z.rating, expected.rating);
      assert.equal(z.d, expected.d);
    }
    const at = (/** @type {string} */ iso) =>
      zoneAt(/** @type {Slot} */ (nepal.find((s) => s.start.toISOString() === iso)), 0);
    assert.deepEqual(at('2026-01-14T03:00:00.000Z'), {
      rating: 'good',
      d: 0,
      year: 2026,
      month: 1,
      day: 14,
      hour: 8,
      minute: 45,
      weekday: 3,
      weekend: false,
    });
    assert.equal(at('2026-01-14T14:00:00.000Z').d, 165);
  });
});

describe('rateMeeting (criterion 9)', () => {
  // Wednesday 14 January 2026 in London (GMT, so local = UTC).
  const slots = buildSlots({
    start: new Date('2026-01-14T00:00:00Z'),
    end: new Date('2026-01-15T00:00:00Z'),
    zones: [iana('Europe/London')],
  });
  const at = (/** @type {string} */ hhmm) => new Date(`2026-01-14T${hhmm}:00Z`);

  it('rates a meeting as its worst slot, with the largest Good d', () => {
    const lateAfternoon = rateMeeting(slots, at('16:15'), 60);
    assert.deepEqual(lateAfternoon, { rating: 'good', d: 0 });
    assert.ok('d' in lateAfternoon);
    assert.deepEqual(rateMeeting(slots, at('07:30'), 60), { rating: 'good', d: 75 });
    assert.deepEqual(rateMeeting(slots, at('10:00'), 60), { rating: 'best' });
    assert.deepEqual(rateMeeting(slots, at('19:30'), 60), { rating: 'unsuitable' });
  });

  it('rejects meetings it cannot rate', () => {
    assert.throws(() => rateMeeting(slots, at('23:30'), 60), RangeError);
    assert.throws(() => rateMeeting(slots, new Date('2026-01-13T23:45:00Z'), 30), RangeError);
    assert.throws(() => rateMeeting(slots, at('10:05'), 60), RangeError);
    assert.throws(() => rateMeeting(slots, at('10:00'), 0), RangeError);
    assert.throws(() => rateMeeting(slots, at('10:00'), 20), RangeError);
  });
});
