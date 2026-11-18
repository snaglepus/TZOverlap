// Grid model: a window of whole home-zone days around an anchor date (by
// default yesterday to tomorrow of it, extended lazily up to 14 days either
// side), one row of hour cells per zone placed by absolute time, and the
// Everyone row of merged 15-minute overlap segments. Positions and widths are
// in home columns (1 = one hour). Every instant is passed in.

import { buildSlots, combineRatings, SLOT_MINUTES } from './suitability.js';
import { zoneHourCells } from './time-engine.js';
import { isWeekend, weekendDays } from './weekends.js';
import { zoneLocalParts } from './zones.js';

/** @typedef {import('./zones.js').Zone} Zone */
/** @typedef {import('./suitability.js').Rating} Rating */
/** @typedef {import('./suitability.js').RatingResult} RatingResult */
/** @typedef {Zone & { country?: string }} GridZone */
/** @typedef {0 | 1 | 2} HeatStep */
/** A home-zone local date. @typedef {{ year: number, month: number, day: number }} Anchor */
/** Whole days shown before and after the anchor. @typedef {{ before: number, after: number }} Extent */
/**
 * @typedef {{
 *   start: Date,
 *   end: Date,
 *   left: number,
 *   width: number,
 *   rating: Rating,
 *   step?: HeatStep,
 * }} Segment
 * @typedef {Segment & { hour: number, repeat: boolean, weekend: boolean }} GridCell
 * A local midnight: the start of the first hour cell of a local date.
 * @typedef {{ at: Date, left: number }} Midnight
 * @typedef {{ zone: GridZone, cells: GridCell[], midnights: Midnight[] }} GridRow
 * @typedef {{ start: Date, end: Date, hours: number, rows: GridRow[], everyone: Segment[] }} Grid
 */

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SLOT_MS = SLOT_MINUTES * MINUTE;
const HEAT_STEP_MINUTES = 60;

/** Days shown either side of the anchor when the window is (re)set. */
export const DEFAULT_DAYS = 1;
/** Most days either side of the anchor: the window never exceeds 29 days. */
export const MAX_DAYS = 14;
/** Home columns from either end of the window at which it extends. */
export const EXTEND_COLUMNS = 6;
/** Dates the date control accepts (every zone has quarter-hour offsets from then). */
export const MIN_DATE = '1980-01-01';
export const MAX_DATE = '2099-12-31';

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
 * "YYYY-MM-DD" of `date` moved by `days` calendar days.
 * @param {Anchor} date
 * @param {number} days
 */
function dayKey({ year, month, day }, days = 0) {
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Home hour cells whose local date is from `from` to `to` days after `anchor`.
 * @param {Zone} homeZone
 * @param {Anchor} anchor
 * @param {number} from
 * @param {number} to
 */
function homeCells(homeZone, anchor, from, to) {
  const midnight = Date.UTC(anchor.year, anchor.month - 1, anchor.day);
  const first = dayKey(anchor, from);
  const last = dayKey(anchor, to);
  return zoneHourCells(
    homeZone,
    new Date(midnight + (from - 1) * DAY),
    new Date(midnight + (to + 2) * DAY),
  ).filter((cell) => {
    const key = dayKey(cell.date);
    return key >= first && key <= last;
  });
}

/**
 * Today's date in the home zone at `now`.
 * @param {Zone} homeZone
 * @param {Date} now
 * @returns {Anchor}
 */
export function todayAnchor(homeZone, now) {
  const { year, month, day } = zoneLocalParts(homeZone, now);
  return { year, month, day };
}

/**
 * @param {Anchor} a
 * @param {Anchor} b
 */
export function sameAnchor(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * "YYYY-MM-DD", the value of an <input type="date">.
 * @param {Anchor} anchor
 */
export function formatAnchor(anchor) {
  return dayKey(anchor);
}

/**
 * An <input type="date"> value as an anchor, or null when it is empty or
 * malformed, not a calendar date, outside MIN_DATE to MAX_DATE, or a date the
 * home zone skipped (no hour cells).
 * @param {string} text
 * @param {Zone} homeZone
 * @returns {Anchor | null}
 */
export function parseAnchor(text, homeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match || text < MIN_DATE || text > MAX_DATE) return null;
  const anchor = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (dayKey(anchor) !== text) return null;
  return homeCells(homeZone, anchor, 0, 0).length > 0 ? anchor : null;
}

/**
 * `extent` with one more day on `side`, or null when that side is at MAX_DAYS.
 * @param {Extent} extent
 * @param {keyof Extent} side
 * @returns {Extent | null}
 */
export function extendExtent(extent, side) {
  if (extent[side] >= MAX_DAYS) return null;
  return { ...extent, [side]: extent[side] + 1 };
}

/**
 * Start of the anchor date in the home zone: its first hour cell's start.
 * @param {Zone} homeZone
 * @param {Anchor} anchor
 */
export function anchorStart(homeZone, anchor) {
  const first = homeCells(homeZone, anchor, 0, 0)[0];
  if (!first) throw new RangeError(`no home hour cells on ${dayKey(anchor)}`);
  return first.start;
}

/**
 * The extent a window opens with: a day either side, plus one more on a side
 * for each skipped date just beyond it, up to MAX_DAYS.
 * @param {Zone} homeZone
 * @param {Anchor} anchor
 * @returns {Extent}
 */
export function initialExtent(homeZone, anchor) {
  const extent = { before: DEFAULT_DAYS, after: DEFAULT_DAYS };
  const skipped = (/** @type {number} */ days) =>
    homeCells(homeZone, anchor, days, days).length === 0;
  while (extent.before < MAX_DAYS && skipped(-extent.before)) extent.before += 1;
  while (extent.after < MAX_DAYS && skipped(extent.after)) extent.after += 1;
  return extent;
}

/**
 * The instant whose offsets the row headers show: `now` while the anchor is
 * today in the home zone, else 12 hours after the start of the anchor date.
 * @param {Zone} homeZone
 * @param {Anchor} anchor
 * @param {Date} now
 */
export function headerInstant(homeZone, anchor, now) {
  if (sameAnchor(todayAnchor(homeZone, now), anchor)) return now;
  return new Date(anchorStart(homeZone, anchor).getTime() + 12 * HOUR);
}

/**
 * From the start of the home zone's first hour cell on anchor − `before` days
 * to the end of its last hour cell on anchor + `after` days. Skipped dates
 * contribute nothing.
 * @param {Zone} homeZone
 * @param {Anchor} anchor
 * @param {number} [before]
 * @param {number} [after]
 */
export function gridWindow(homeZone, anchor, before = DEFAULT_DAYS, after = DEFAULT_DAYS) {
  const cells = homeCells(homeZone, anchor, -before, after);
  const first = cells[0];
  const last = cells[cells.length - 1];
  if (!first || !last) throw new RangeError(`no home hour cells around ${dayKey(anchor)}`);
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
 *   anchor: Anchor,
 *   before?: number,
 *   after?: number,
 *   weekendsUnavailable?: boolean,
 * }} options
 * @returns {Grid}
 */
export function buildGrid({
  homeZone,
  zones,
  anchor,
  before = DEFAULT_DAYS,
  after = DEFAULT_DAYS,
  weekendsUnavailable = true,
}) {
  const { start, end } = gridWindow(homeZone, anchor, before, after);
  const all = [homeZone, ...zones];
  const slots = buildSlots({
    start,
    end,
    zones: all.map((zone) => ({ zone, country: zone.country })),
    weekendsUnavailable,
  });

  const rows = all.map((zone, z) => {
    const hourCells = zoneHourCells(zone, start, end);
    const days = weekendDays(zone, zone.country);
    const cells = hourCells.map((cell) => {
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
        weekend: isWeekend(
          new Date(Date.UTC(cell.date.year, cell.date.month - 1, cell.date.day)).getUTCDay(),
          days,
        ),
        rating: rated.rating,
      };
      const step = heatStep(rated);
      if (step !== undefined) out.step = step;
      return out;
    });
    // A cell starts a local date when the instant just before it is on another date.
    const midnights = hourCells
      .filter((cell) => {
        const t = cell.start.getTime();
        return (
          t >= start.getTime() &&
          t < end.getTime() &&
          dayKey(zoneLocalParts(zone, new Date(t - 1))) !== dayKey(cell.date)
        );
      })
      .map((cell) => ({ at: cell.start, left: place(cell, start).left }));
    return { zone, cells, midnights };
  });

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
