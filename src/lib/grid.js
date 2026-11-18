// Grid model: a window from the start of yesterday to the end of tomorrow in
// the home zone, one row of hour cells per zone placed by absolute time, and
// the Everyone row of merged 15-minute overlap segments. Positions and widths
// are in home columns (1 = one hour). Every instant is passed in.

import { buildSlots, combineRatings, SLOT_MINUTES } from './suitability.js';
import { zoneHourCells } from './time-engine.js';
import { zoneLocalParts } from './zones.js';

/** @typedef {import('./zones.js').Zone} Zone */
/** @typedef {import('./suitability.js').Rating} Rating */
/** @typedef {import('./suitability.js').RatingResult} RatingResult */
/** @typedef {Zone & { country?: string }} GridZone */
/** @typedef {0 | 1 | 2} HeatStep */
/**
 * @typedef {{
 *   start: Date,
 *   end: Date,
 *   left: number,
 *   width: number,
 *   rating: Rating,
 *   step?: HeatStep,
 * }} Segment
 * @typedef {Segment & { hour: number, repeat: boolean }} GridCell
 * @typedef {{ zone: GridZone, cells: GridCell[] }} GridRow
 * @typedef {{ start: Date, end: Date, hours: number, rows: GridRow[], everyone: Segment[] }} Grid
 */

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SLOT_MS = SLOT_MINUTES * MINUTE;
const HEAT_STEP_MINUTES = 60;

/**
 * Heat step of a rating: 0 next to Best, 2 next to Unsuitable; none unless Good.
 * @param {RatingResult} result
 * @returns {HeatStep | undefined}
 */
export function heatStep(result) {
  if (result.rating !== 'good') return undefined;
  return /** @type {HeatStep} */ (Math.floor((result.d ?? 0) / HEAT_STEP_MINUTES));
}

/**
 * @param {{ year: number, month: number, day: number }} date
 * @param {number} days
 */
function dayKey({ year, month, day }, days = 0) {
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Home-zone yesterday to tomorrow: from the start of its first hour cell on
 * yesterday's local date to the end of its last hour cell on tomorrow's.
 * @param {Zone} homeZone
 * @param {Date} now
 */
export function gridWindow(homeZone, now) {
  const today = zoneLocalParts(homeZone, now);
  const days = new Set([dayKey(today, -1), dayKey(today), dayKey(today, 1)]);
  const cells = zoneHourCells(
    homeZone,
    new Date(now.getTime() - 3 * DAY),
    new Date(now.getTime() + 3 * DAY),
  ).filter((cell) => days.has(dayKey(cell.date)));
  const first = cells[0];
  const last = cells[cells.length - 1];
  if (!first || !last) throw new RangeError('no home hour cells around now');
  return { start: first.start, end: last.end };
}

/**
 * @param {{ start: Date, end: Date }} span
 * @param {Date} windowStart
 */
function place({ start, end }, windowStart) {
  return {
    left: (start.getTime() - windowStart.getTime()) / HOUR,
    width: (end.getTime() - start.getTime()) / HOUR,
  };
}

/**
 * @param {{
 *   homeZone: GridZone,
 *   zones: readonly GridZone[],
 *   now: Date,
 *   weekendsUnavailable?: boolean,
 * }} options
 * @returns {Grid}
 */
export function buildGrid({ homeZone, zones, now, weekendsUnavailable = true }) {
  const { start, end } = gridWindow(homeZone, now);
  const all = [homeZone, ...zones];
  const slots = buildSlots({
    start,
    end,
    zones: all.map((zone) => ({ zone, country: zone.country })),
    weekendsUnavailable,
  });

  const rows = all.map((zone, z) => ({
    zone,
    cells: zoneHourCells(zone, start, end).map((cell) => {
      // Slots overlapping the cell (inside the window).
      const first = Math.max(0, Math.floor((cell.start.getTime() - start.getTime()) / SLOT_MS));
      const last = Math.min(
        slots.length,
        Math.ceil((cell.end.getTime() - start.getTime()) / SLOT_MS),
      );
      const rated = combineRatings(
        slots.slice(first, last).map((slot) => /** @type {RatingResult} */ (slot.zones[z])),
      );
      /** @type {GridCell} */
      const out = {
        start: cell.start,
        end: cell.end,
        ...place(cell, start),
        hour: cell.hour,
        repeat: cell.repeat,
        rating: rated.rating,
      };
      const step = heatStep(rated);
      if (step !== undefined) out.step = step;
      return out;
    }),
  }));

  /** @type {Segment[]} */
  const everyone = [];
  for (const slot of slots) {
    const step = heatStep(slot.overlap);
    const prev = everyone[everyone.length - 1];
    const slotEnd = new Date(slot.start.getTime() + SLOT_MS);
    if (prev && prev.rating === slot.overlap.rating && prev.step === step) {
      prev.end = slotEnd;
      prev.width = place(prev, start).width;
      continue;
    }
    /** @type {Segment} */
    const segment = {
      start: slot.start,
      end: slotEnd,
      ...place({ start: slot.start, end: slotEnd }, start),
      rating: slot.overlap.rating,
    };
    if (step !== undefined) segment.step = step;
    everyone.push(segment);
  }

  return { start, end, hours: (end.getTime() - start.getTime()) / HOUR, rows, everyone };
}
