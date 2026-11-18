// Time engine: offset transitions, gaps between zones and per-zone hour cells
// placed by absolute time. Every instant is passed in; nothing reads the clock.

import { zoneLocalParts, zoneOffsetMinutes } from './zones.js';

/** @typedef {import('./zones.js').Zone} Zone */

/**
 * An offset change. Offsets are minutes east of UTC; `at` is the first whole
 * minute on `offsetAfter`.
 * @typedef {{ at: Date, offsetBefore: number, offsetAfter: number }} Transition
 */

/**
 * One local hour of a zone, from a local HH:00 to the zone's next HH:00.
 * @typedef {{
 *   start: Date,
 *   end: Date,
 *   hour: number,
 *   date: { year: number, month: number, day: number },
 *   repeat: boolean,
 * }} HourCell
 */

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Margin around a cell window: longer than any cell or repeated range.
const CELL_PAD = 3 * HOUR;
const DST_WINDOW = 183 * DAY;

/**
 * First whole minute in (lo, hi] whose offset differs from the offset at `lo`.
 * @param {Zone} zone
 * @param {number} lo ms, offset before the change
 * @param {number} hi ms, offset after the change
 */
function findChange(zone, lo, hi) {
  const before = zoneOffsetMinutes(zone, new Date(lo));
  let loM = Math.floor(lo / MINUTE);
  let hiM = Math.ceil(hi / MINUTE);
  while (hiM - loM > 1) {
    const mid = Math.floor((loM + hiM) / 2);
    if (zoneOffsetMinutes(zone, new Date(mid * MINUTE)) === before) loM = mid;
    else hiM = mid;
  }
  return hiM * MINUTE;
}

/**
 * Offset changes with `from < at <= to`, in ascending order. Samples hourly,
 * then binary-searches each change to the minute.
 * @param {Zone} zone
 * @param {Date} from
 * @param {Date} to
 * @returns {Transition[]}
 */
export function zoneTransitions(zone, from, to) {
  /** @type {Transition[]} */
  const transitions = [];
  if (zone.kind === 'fixed') return transitions;
  const end = to.getTime();
  let prev = from.getTime();
  let prevOffset = zoneOffsetMinutes(zone, from);
  while (prev < end) {
    const next = Math.min(prev + HOUR, end);
    const nextOffset = zoneOffsetMinutes(zone, new Date(next));
    if (nextOffset !== prevOffset) {
      transitions.push({
        at: new Date(findChange(zone, prev, next)),
        offsetBefore: prevOffset,
        offsetAfter: nextOffset,
      });
    }
    prev = next;
    prevOffset = nextOffset;
  }
  return transitions;
}

/**
 * Minutes `a` is ahead of `b` at `at` (negative when behind).
 * @param {Zone} a
 * @param {Zone} b
 * @param {Date} at
 */
export function zoneGapMinutes(a, b, at) {
  return zoneOffsetMinutes(a, at) - zoneOffsetMinutes(b, at);
}

/**
 * Hour cells of `zone` that overlap [from, to). A cell starts wherever the
 * local clock reads HH:00, so skipped hours have no cell and repeated hours
 * get two; the second is flagged `repeat`.
 * @param {Zone} zone
 * @param {Date} from
 * @param {Date} to
 * @returns {HourCell[]}
 */
export function zoneHourCells(zone, from, to) {
  const padFrom = from.getTime() - CELL_PAD;
  const padTo = to.getTime() + CELL_PAD;
  const transitions = zoneTransitions(zone, new Date(padFrom), new Date(padTo));
  const backward = transitions.filter((t) => t.offsetAfter < t.offsetBefore);

  // Each stretch of constant offset, with the local HH:00 instants inside it.
  /** @type {{ start: number, offset: number }[]} */
  const starts = [];
  let spanStart = padFrom;
  let offset = zoneOffsetMinutes(zone, new Date(padFrom));
  for (let i = 0; i <= transitions.length; i++) {
    const spanEnd = transitions[i]?.at.getTime() ?? padTo;
    const phase = (((-offset * MINUTE) % HOUR) + HOUR) % HOUR;
    for (let t = Math.ceil((spanStart - phase) / HOUR) * HOUR + phase; t < spanEnd; t += HOUR) {
      starts.push({ start: t, offset });
    }
    spanStart = spanEnd;
    offset = transitions[i]?.offsetAfter ?? offset;
  }

  /** @type {HourCell[]} */
  const cells = [];
  for (const [i, { start, offset: cellOffset }] of starts.entries()) {
    const end = starts[i + 1]?.start;
    if (end === undefined) break;
    if (start >= to.getTime() || end <= from.getTime()) continue;
    const wall = start + cellOffset * MINUTE;
    const repeat = backward.some((t) => {
      const at = t.at.getTime();
      return (
        start >= at && wall >= at + t.offsetAfter * MINUTE && wall < at + t.offsetBefore * MINUTE
      );
    });
    const parts = zoneLocalParts(zone, new Date(start));
    cells.push({
      start: new Date(start),
      end: new Date(end),
      hour: parts.hour,
      date: { year: parts.year, month: parts.month, day: parts.day },
      repeat,
    });
  }
  return cells;
}

/**
 * True when the offset at `at` is above the zone's smallest offset within
 * 183 days either side.
 * @param {Zone} zone
 * @param {Date} at
 */
export function isObservingDst(zone, at) {
  if (zone.kind === 'fixed') return false;
  const windowStart = new Date(at.getTime() - DST_WINDOW);
  const windowEnd = new Date(at.getTime() + DST_WINDOW);
  const offsets = zoneTransitions(zone, windowStart, windowEnd).map((t) => t.offsetAfter);
  const lowest = Math.min(zoneOffsetMinutes(zone, windowStart), ...offsets);
  return zoneOffsetMinutes(zone, at) > lowest;
}

/**
 * First transition after `at` and within `days` days, or null.
 * @param {Zone} zone
 * @param {Date} at
 * @param {number} days
 * @returns {Transition | null}
 */
export function nextTransition(zone, at, days) {
  const until = new Date(at.getTime() + days * DAY);
  return zoneTransitions(zone, at, until)[0] ?? null;
}
