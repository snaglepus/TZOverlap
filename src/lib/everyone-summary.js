// The Everyone row's one-line answer for the anchor date: its longest Best run,
// else its longest Good run, else none ("Best 10:00–17:00", "Good 6–9 am",
// "No shared hours"). Pure (no DOM); ignores the filter.

import { strings } from '../ui/strings.js';
import { daySlots } from './filter.js';
import { SLOT_MINUTES } from './suitability.js';
import { formatTime } from './time-format.js';
import { zoneLocalParts } from './zones.js';

/**
 * @typedef {import('./suitability.js').Slot} Slot
 * @typedef {import('./zones.js').Zone} Zone
 * @typedef {import('./grid.js').GridZone} GridZone
 * @typedef {import('./grid.js').Anchor} Anchor
 * @typedef {import('./time-format.js').HourCycle} HourCycle
 * @typedef {{ rating: 'best' | 'good', start: Date, end: Date, more: number }} Summary
 */

const SLOT_MS = SLOT_MINUTES * 60000;

/**
 * The runs of consecutive `rating` slots, as [first, last] slot pairs.
 * @param {readonly Slot[]} slots
 * @param {'best' | 'good'} rating
 */
function runs(slots, rating) {
  /** @type {[Slot, Slot][]} */
  const found = [];
  /** @type {[Slot, Slot] | null} */
  let open = null;
  for (const slot of slots) {
    if (slot.overlap.rating !== rating) {
      open = null;
      continue;
    }
    if (open) open[1] = slot;
    else {
      open = [slot, slot];
      found.push(open);
    }
  }
  return found;
}

/**
 * The longest Best run of `slots` (in time order), else the longest Good run;
 * the earliest on a tie. `more` counts the other runs of that rating. Null
 * when no slot is Best or Good.
 * @param {readonly Slot[]} slots
 * @returns {Summary | null}
 */
export function summariseSlots(slots) {
  for (const rating of /** @type {const} */ (['best', 'good'])) {
    const list = runs(slots, rating);
    /** @type {[Slot, Slot] | null} */
    let longest = null;
    let length = 0;
    for (const run of list) {
      const span = run[1].start.getTime() - run[0].start.getTime();
      if (longest === null || span > length) {
        longest = run;
        length = span;
      }
    }
    if (longest) {
      return {
        rating,
        start: longest[0].start,
        end: new Date(longest[1].start.getTime() + SLOT_MS),
        more: list.length - 1,
      };
    }
  }
  return null;
}

/**
 * The summary of the home-zone date `anchor`: the slots dayQualifies() rates.
 * @param {{
 *   homeZone: GridZone,
 *   zones: readonly GridZone[],
 *   anchor: Anchor,
 *   weekendsUnavailable: boolean,
 * }} options
 */
export function everyoneSummary(options) {
  return summariseSlots(daySlots(options));
}

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * "10:00–17:00" (24-hour), or "9–11 am", "9:30–11:15 am", "11 am–5 pm" (12-hour).
 * @param {{ hour: number, minute: number }} from
 * @param {{ hour: number, minute: number }} to
 * @param {HourCycle} cycle
 */
function range(from, to, cycle) {
  if (cycle === 'h23') {
    return strings.timelines.summary.range(
      formatTime(from, cycle, 'full'),
      formatTime(to, cycle, 'full'),
    );
  }
  /** @param {{ hour: number, minute: number }} time */
  const bare = ({ hour, minute }) => `${hour % 12 || 12}${minute === 0 ? '' : `:${pad(minute)}`}`;
  /** @param {{ hour: number }} time */
  const half = ({ hour }) => (hour >= 12 ? strings.time.pm : strings.time.am);
  if (half(from) === half(to)) {
    return `${strings.timelines.summary.range(bare(from), bare(to))} ${half(to)}`;
  }
  return strings.timelines.summary.range(`${bare(from)} ${half(from)}`, `${bare(to)} ${half(to)}`);
}

/**
 * The summary's long and short text, with times in `homeZone`.
 * @param {Summary | null} summary
 * @param {Zone} homeZone
 * @param {HourCycle} cycle
 * @returns {{ long: string, short: string }}
 */
export function summaryText(summary, homeZone, cycle) {
  if (!summary) return { ...strings.timelines.summary.none };
  const text = range(
    zoneLocalParts(homeZone, summary.start),
    zoneLocalParts(homeZone, summary.end),
    cycle,
  );
  const entry = strings.timelines.summary[summary.rating];
  return { long: entry.long(text, summary.more), short: entry.short(text, summary.more) };
}

/**
 * Whether two summaries are the same answer: rating, times and run count.
 * @param {Summary | null} a
 * @param {Summary | null} b
 */
export function sameSummary(a, b) {
  if (!a || !b) return a === b;
  return (
    a.rating === b.rating &&
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime() &&
    a.more === b.more
  );
}
