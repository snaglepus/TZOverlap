// The All / Good / Best filter: which overlap ratings qualify, the spans of the
// window to grey out, and whether a home-zone date has any qualifying slot.

import { MAX_DAYS, formatAnchor, gridWindow, parseAnchor } from './grid.js';
import { buildSlots } from './suitability.js';

/** @typedef {import('./suitability.js').Rating} Rating */
/** @typedef {import('./grid.js').Segment} Segment */
/** @typedef {import('./grid.js').Anchor} Anchor */
/** @typedef {import('./grid.js').GridZone} GridZone */
/** @typedef {import('./store.js').Settings['filter']} Filter */
/** A greyed-out stretch of the window, in home columns. @typedef {{ start: Date, end: Date, left: number, width: number }} Span */
/**
 * @typedef {{
 *   homeZone: GridZone,
 *   zones: readonly GridZone[],
 *   anchor: Anchor,
 *   weekendsUnavailable: boolean,
 *   filter: Filter,
 * }} DayOptions
 */

/**
 * Whether an overlap rating is shown (not greyed) under `filter`.
 * @param {Rating} rating
 * @param {Filter} filter
 */
export function qualifies(rating, filter) {
  if (filter === 'best') return rating === 'best';
  if (filter === 'good') return rating !== 'unsuitable';
  return true;
}

/**
 * The Everyone segments that don't qualify, with consecutive ones merged.
 * @param {readonly Segment[]} everyone
 * @param {Filter} filter
 * @returns {Span[]}
 */
export function greyedSpans(everyone, filter) {
  /** @type {Span[]} */
  const spans = [];
  /** @type {Span | null} */
  let open = null;
  for (const segment of everyone) {
    if (qualifies(segment.rating, filter)) {
      open = null;
      continue;
    }
    if (open) {
      open.end = segment.end;
      open.width = segment.left + segment.width - open.left;
      continue;
    }
    open = { start: segment.start, end: segment.end, left: segment.left, width: segment.width };
    spans.push(open);
  }
  return spans;
}

/**
 * Whether any 15-minute slot of the home-zone date `anchor` qualifies.
 * @param {DayOptions} options
 */
export function dayQualifies({ homeZone, zones, anchor, weekendsUnavailable, filter }) {
  if (filter === 'all') return true;
  const { start, end } = gridWindow(homeZone, anchor, 0, 0);
  const slots = buildSlots({
    start,
    end,
    zones: [homeZone, ...zones].map((zone) => ({ zone, country: zone.country })),
    weekendsUnavailable,
  });
  return slots.some((slot) => qualifies(slot.overlap.rating, filter));
}

/**
 * The first date after `anchor`, up to MAX_DAYS later and not past MAX_DATE,
 * with a qualifying slot; null when there is none. Skipped dates are passed over.
 * @param {DayOptions} options
 * @returns {Anchor | null}
 */
export function nextQualifyingDay({ anchor, ...rest }) {
  for (let days = 1; days <= MAX_DAYS; days += 1) {
    const key = formatAnchor({ ...anchor, day: anchor.day + days });
    // Null past MAX_DATE and on dates the home zone skipped.
    const next = parseAnchor(key, rest.homeZone);
    if (next && dayQualifies({ ...rest, anchor: next })) return next;
  }
  return null;
}
