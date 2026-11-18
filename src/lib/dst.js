// DST: badge status for row headers, the clock changes between now and a
// shown date, and the sentences that explain them. Pure (no DOM).

import { strings } from '../ui/strings.js';
import { dayMonth, headerOffsetLabel, shortDate, zoneAbbreviationLabel } from './row-header.js';
import { isObservingDst, nextTransition, zoneTransitions } from './time-engine.js';
import { zoneOffsetMinutes } from './zones.js';

/**
 * @typedef {import('./zones.js').Zone} Zone
 * @typedef {import('./time-engine.js').Transition} Transition
 * A listed zone with its row names: `name` is the full name, `display` the shown one.
 * @typedef {{ zone: Zone, name: string, display: string }} NamedZone
 * One clock change. `gap` is the single gap that changes (minutes, absolute);
 * `gaps` counts changed gaps when home changes and two or more do, else 0.
 * @typedef {{
 *   zone: NamedZone,
 *   transition: Transition,
 *   gap: { to: string, before: number, after: number } | null,
 *   gaps: number,
 * }} DstChange
 * @typedef {{ changes: DstChange[], capped: boolean }} ChangeList
 * @typedef {{ long: string, short: string, compact?: string }} BannerMessage
 */

const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;
/** The longest stretch before the shown date that changesBetween scans. */
export const SCAN_DAYS = 366;
/** How far ahead the warning badge looks. */
export const WARNING_DAYS = 14;

/**
 * "10 h", "10.5 h", "5.75 h": the absolute gap in hours, at most two decimals.
 * @param {number} minutes
 */
export function formatGap(minutes) {
  return strings.dst.hours(String(Number((Math.abs(minutes) / 60).toFixed(2))));
}

/**
 * "1 h", "30 min" or "1 h 30 min": the absolute size of a change.
 * @param {number} minutes
 */
export function formatShift(minutes) {
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const h = strings.dst.hours(String(hours));
  const m = strings.dst.minutes(String(rest));
  if (rest === 0) return h;
  if (hours === 0) return m;
  return `${h} ${m}`;
}

/**
 * Whether the zone observes DST at `at`, and its next change within 14 days.
 * Fixed zones never do.
 * @param {Zone} zone
 * @param {Date} at
 * @returns {{ observing: boolean, change: Transition | null }}
 */
export function dstStatus(zone, at) {
  if (zone.kind === 'fixed') return { observing: false, change: null };
  return { observing: isObservingDst(zone, at), change: nextTransition(zone, at, WARNING_DAYS) };
}

/**
 * Absolute minutes between two zones at `at`.
 * @param {Zone} a
 * @param {Zone} b
 * @param {Date} at
 */
function gapAt(a, b, at) {
  return Math.abs(zoneOffsetMinutes(a, at) - zoneOffsetMinutes(b, at));
}

/**
 * The change and the gaps it moves, compared one minute before and at the change.
 * `home` is the home row (the same object when `zone` is home); `others` are the
 * other listed zones.
 * @param {{ zone: NamedZone, transition: Transition, home: NamedZone, others: readonly NamedZone[] }} options
 * @returns {DstChange}
 */
export function describeChange({ zone, transition, home, others }) {
  const after = transition.at;
  const before = new Date(after.getTime() - MINUTE);
  /** @param {NamedZone} a @param {NamedZone} b */
  const gap = (a, b) => ({
    to: b.name,
    before: gapAt(a.zone, b.zone, before),
    after: gapAt(a.zone, b.zone, after),
  });
  if (zone !== home) {
    const g = gap(zone, home);
    return { zone, transition, gap: g.before === g.after ? null : g, gaps: 0 };
  }
  const changed = others.map((other) => gap(home, other)).filter((g) => g.before !== g.after);
  return {
    zone,
    transition,
    gap: changed.length === 1 ? (changed[0] ?? null) : null,
    gaps: changed.length >= 2 ? changed.length : 0,
  };
}

/**
 * Every change of home and the others with `start < at <= to`, sorted by time
 * (home first on ties), where `start` is at most 366 days before `to`.
 * `capped` says the scan skipped part of the interval.
 * @param {{ home: NamedZone, others: readonly NamedZone[], from: Date, to: Date }} options
 * @returns {ChangeList}
 */
export function changesBetween({ home, others, from, to }) {
  if (to.getTime() <= from.getTime()) return { changes: [], capped: false };
  const scanStart = to.getTime() - SCAN_DAYS * DAY;
  const start = new Date(Math.max(from.getTime(), scanStart));
  /** @type {DstChange[]} */
  const changes = [];
  for (const zone of [home, ...others]) {
    const rest = others.filter((other) => other !== zone);
    for (const transition of zoneTransitions(zone.zone, start, to)) {
      changes.push(describeChange({ zone, transition, home, others: rest }));
    }
  }
  changes.sort((a, b) => a.transition.at.getTime() - b.transition.at.getTime());
  return { changes, capped: from.getTime() < scanStart };
}

/**
 * The long (sheet, wide banner) and short (phone banner) sentence for a change.
 * @param {DstChange} change
 * @returns {{ long: string, short: string }}
 */
export function changeSentence({ zone, transition, gap, gaps }) {
  const { at, offsetBefore, offsetAfter } = transition;
  const words = strings.dst;
  const direction = offsetAfter > offsetBefore ? words.forward : words.back;
  const shiftMinutes = offsetAfter - offsetBefore;
  const shift = formatShift(shiftMinutes);
  const label = zoneAbbreviationLabel(zone.zone, at) ?? headerOffsetLabel(zone.zone, at);
  let long = words.change.long(zone.name, label, shortDate(zone.zone, at), direction, shift);
  let short = words.change.short(
    zone.display,
    direction,
    dayMonth(zone.zone, at),
    Math.abs(shiftMinutes) === 60 ? '' : shift,
  );
  if (gap) {
    long += words.gap.long(gap.to, formatGap(gap.before), formatGap(gap.after));
    short += words.gap.short(formatGap(gap.after));
  } else if (gaps) {
    long += words.gaps.long(gaps);
    short += words.gaps.short(gaps);
  }
  return { long, short };
}

/**
 * What the banner shows for a non-empty list. `dateLabel` is the shown date
 * ("Fri 10 Apr"). One change gets its sentences plus a compact fallback for a
 * short form that doesn't fit; several, or a capped scan, get one summary.
 * @param {ChangeList} list
 * @param {string} dateLabel
 * @returns {BannerMessage}
 */
export function bannerMessage({ changes, capped }, dateLabel) {
  const n = changes.length;
  const only = changes[0];
  if (capped) {
    const text = strings.dst.capped(n, dateLabel);
    return { long: text, short: text };
  }
  if (n === 1 && only) {
    return {
      ...changeSentence(only),
      compact: strings.dst.compact(shortDate(only.zone.zone, only.transition.at)),
    };
  }
  const text = strings.dst.summary(n, dateLabel);
  return { long: text, short: text };
}
