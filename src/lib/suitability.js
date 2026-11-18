// Rates local times for meeting suitability in 15-minute slots.
//
// Rating      Local time (half-open)          Heat distance d
//   best      09:00-17:00                     none
//   good      06:00-09:00, 17:00-20:00        0 next to Best, up to 165 at the far edge
//   unsuitable 20:00-06:00, and weekends when they count as unavailable
//
// Morning Good: d = 08:45 - slot (08:45 → 0, 06:00 → 165).
// Evening Good: d = slot - 17:00 (17:00 → 0, 19:45 → 165).
// Overlap and meeting ratings take the worst rating and, for Good, the largest d.

import { weekendDays, isWeekend } from './weekends.js';
import { zoneLocalParts } from './zones.js';

/** @typedef {import('./zones.js').Zone} Zone */
/** @typedef {'best' | 'good' | 'unsuitable'} Rating */
/** @typedef {{ rating: Rating, d?: number }} RatingResult */
/** @typedef {{ zone: Zone, country?: string }} SlotZone */
/**
 * @typedef {RatingResult & {
 *   year: number, month: number, day: number, hour: number, minute: number,
 *   weekday: number, weekend: boolean
 * }} ZoneSlot
 */
/** @typedef {{ start: Date, zones: ZoneSlot[], overlap: RatingResult }} Slot */

export const SLOT_MINUTES = 15;
export const MAX_HEAT_DISTANCE = 165;

const SLOT_MS = SLOT_MINUTES * 60000;

/** Minutes from local midnight, each range half-open [start, end). */
export const BANDS = Object.freeze({
  best: Object.freeze({ start: 540, end: 1020 }),
  morningGood: Object.freeze({ start: 360, end: 540 }),
  eveningGood: Object.freeze({ start: 1020, end: 1200 }),
});

/** @type {Readonly<Record<Rating, number>>} lower is worse */
const RANK = Object.freeze({ unsuitable: 0, good: 1, best: 2 });

/**
 * @param {{ start: number, end: number }} band
 * @param {number} minuteOfDay
 */
function inBand(band, minuteOfDay) {
  return minuteOfDay >= band.start && minuteOfDay < band.end;
}

/**
 * Rating of a local wall-clock time, floored to its 15-minute slot.
 * @param {number} hour 0-23
 * @param {number} minute 0-59
 * @returns {RatingResult}
 */
export function rateLocalTime(hour, minute) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be an integer 0-23, got ${hour}`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new RangeError(`minute must be an integer 0-59, got ${minute}`);
  }
  const slot = hour * 60 + Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES;
  if (inBand(BANDS.best, slot)) return { rating: 'best' };
  if (inBand(BANDS.morningGood, slot)) {
    return { rating: 'good', d: BANDS.morningGood.end - SLOT_MINUTES - slot };
  }
  if (inBand(BANDS.eveningGood, slot)) {
    return { rating: 'good', d: slot - BANDS.eveningGood.start };
  }
  return { rating: 'unsuitable' };
}

/**
 * Worst rating in `list`; for Good, the largest d among the Good entries.
 * @param {readonly RatingResult[]} list
 * @returns {RatingResult}
 */
export function combineRatings(list) {
  if (list.length === 0) throw new RangeError('combineRatings needs at least one rating');
  /** @type {Rating} */
  let worst = 'best';
  let d = 0;
  for (const entry of list) {
    if (RANK[entry.rating] < RANK[worst]) worst = entry.rating;
    if (entry.rating === 'good') d = Math.max(d, entry.d ?? 0);
  }
  return worst === 'good' ? { rating: 'good', d } : { rating: worst };
}

/**
 * @param {unknown} date
 * @returns {date is Date}
 */
function isSlotBoundary(date) {
  return date instanceof Date && Number.isInteger(date.getTime() / SLOT_MS);
}

/**
 * One slot per 15 minutes in [start, end), rated in every zone.
 * @param {{ start: Date, end: Date, zones: readonly SlotZone[], weekendsUnavailable?: boolean }} options
 * @returns {Slot[]}
 */
export function buildSlots({ start, end, zones, weekendsUnavailable = true }) {
  if (!isSlotBoundary(start) || !isSlotBoundary(end)) {
    throw new RangeError('start and end must be on 15-minute UTC boundaries');
  }
  if (end.getTime() <= start.getTime()) throw new RangeError('end must be after start');
  if (!Array.isArray(zones) || zones.length === 0) {
    throw new RangeError('zones must be a non-empty array');
  }
  const weekends = zones.map(({ zone, country }) => weekendDays(zone, country));
  /** @type {Slot[]} */
  const slots = [];
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MS) {
    const slotStart = new Date(t);
    const zoneSlots = zones.map(({ zone }, i) => {
      const { year, month, day, hour, minute } = zoneLocalParts(zone, slotStart);
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const weekend = isWeekend(weekday, weekends[i] ?? []);
      /** @type {RatingResult} */
      const rated =
        weekendsUnavailable && weekend ? { rating: 'unsuitable' } : rateLocalTime(hour, minute);
      return { ...rated, year, month, day, hour, minute, weekday, weekend };
    });
    slots.push({ start: slotStart, zones: zoneSlots, overlap: combineRatings(zoneSlots) });
  }
  return slots;
}

/**
 * Rating of a meeting: its worst overlap slot.
 * @param {readonly Slot[]} slots from `buildSlots`
 * @param {Date} start
 * @param {number} durationMinutes positive multiple of 15
 * @returns {RatingResult}
 */
export function rateMeeting(slots, start, durationMinutes) {
  if (!isSlotBoundary(start)) throw new RangeError('start must be on a 15-minute UTC boundary');
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes % SLOT_MINUTES !== 0
  ) {
    throw new RangeError(`duration must be a positive multiple of 15, got ${durationMinutes}`);
  }
  const from = start.getTime();
  const to = from + durationMinutes * 60000;
  const covered = slots.filter((slot) => {
    const t = slot.start.getTime();
    return t >= from && t < to;
  });
  if (covered.length !== durationMinutes / SLOT_MINUTES) {
    throw new RangeError('slots do not cover the whole meeting');
  }
  return combineRatings(covered.map((slot) => slot.overlap));
}
