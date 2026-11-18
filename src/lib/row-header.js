// Row header text: names, day difference from home, dates and offset lines.
// Pure (no DOM); dates come from zoneLocalParts so fixed zones work too.

import { strings } from '../ui/strings.js';
import { formatOffset, zoneCity } from './timezones.js';
import { zoneAbbreviation, zoneLocalParts, zoneOffsetLabel, zoneOffsetMinutes } from './zones.js';

/**
 * @typedef {import('./zones.js').Zone} Zone
 * @typedef {import('../data/cities.js').City} City
 */

const DAY_MS = 86400000;
/** Tried in order; the first real abbreviation wins (no locale has both AEDT and BST). */
const ABBREVIATION_LOCALES = ['en-AU', 'en-US', 'en-GB', 'en-IN', 'en-NZ'];
const NOT_AN_ABBREVIATION = /^(GMT|UTC)[+\-−]/;

const shortDateFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const dayLabelFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
});
const fullDateFormat = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Midnight UTC on the local calendar date of `zone` at `date`.
 * @param {Zone} zone
 * @param {Date} date
 */
function localDay(zone, date) {
  const { year, month, day } = zoneLocalParts(zone, date);
  return Date.UTC(year, month - 1, day);
}

/**
 * Calendar days between the zone's local date and home's at `date` (-2 to 2).
 * @param {Zone} zone
 * @param {Zone} home
 * @param {Date} date
 */
export function dayDifference(zone, home, date) {
  return Math.round((localDay(zone, date) - localDay(home, date)) / DAY_MS);
}

/**
 * Wording for a day difference, or null for the same day.
 * @param {number} diff
 * @returns {{ long: string, short: string } | null}
 */
export function dayDifferenceLabel(diff) {
  const days = strings.timelines.days;
  if (diff === 0) return null;
  if (diff === 1) return days.tomorrow;
  if (diff === -1) return days.yesterday;
  const n = Math.abs(diff);
  const entry = diff > 0 ? days.ahead : days.behind;
  return { long: entry.long(n), short: entry.short(n) };
}

/**
 * @param {Intl.DateTimeFormat} format
 * @param {number} day midnight UTC
 * @param {Intl.DateTimeFormatPartTypes[]} order
 */
function joinParts(format, day, order) {
  /** @type {Partial<Record<Intl.DateTimeFormatPartTypes, string>>} */
  const p = {};
  for (const part of format.formatToParts(day)) p[part.type] = part.value;
  return order.map((type) => p[type]).join(' ');
}

/**
 * "Tue 17 Nov": the zone's local date at `date`.
 * @param {Zone} zone
 * @param {Date} date
 */
export function shortDate(zone, date) {
  return joinParts(shortDateFormat, localDay(zone, date), ['weekday', 'day', 'month']);
}

/**
 * "17 Nov": the zone's local day and month at `date`.
 * @param {Zone} zone
 * @param {Date} date
 */
export function dayMonth(zone, date) {
  return joinParts(shortDateFormat, localDay(zone, date), ['day', 'month']);
}

/**
 * "Wed 18": the zone's local weekday and day at `date`, for midnight dividers.
 * @param {Zone} zone
 * @param {Date} date
 */
export function dayLabel(zone, date) {
  return joinParts(dayLabelFormat, localDay(zone, date), ['weekday', 'day']);
}

/**
 * "Tuesday 17 November 2026": the zone's local date at `date`.
 * @param {Zone} zone
 * @param {Date} date
 */
export function fullDate(zone, date) {
  return joinParts(fullDateFormat, localDay(zone, date), ['weekday', 'day', 'month', 'year']);
}

/**
 * The first real abbreviation ("AEDT", "BST", "IST") any of a fixed list of
 * English locales gives, else "GMT" when one gave "GMT+0", else null (fixed
 * zones, "GMT+9", "UTC").
 * @param {Zone} zone
 * @param {Date} date
 * @returns {string | null}
 */
export function zoneAbbreviationLabel(zone, date) {
  if (zone.kind === 'fixed') return null;
  let gmt = false;
  for (const locale of ABBREVIATION_LOCALES) {
    const abbr = zoneAbbreviation(zone, date, locale);
    if (abbr && abbr !== 'UTC' && !NOT_AN_ABBREVIATION.test(abbr)) return abbr;
    // Chromium's ICU spells London's winter "GMT" as "GMT+0".
    if (abbr === 'GMT+0') gmt = true;
  }
  return gmt ? 'GMT' : null;
}

/**
 * "UTC+5:30", "UTC-4", and "UTC+0" for a zero offset.
 * @param {Zone} zone
 * @param {Date} date
 */
export function headerOffsetLabel(zone, date) {
  return zoneOffsetMinutes(zone, date) === 0 ? 'UTC+0' : zoneOffsetLabel(zone, date);
}

/**
 * "AEDT · UTC+11", or the offset alone when there is no abbreviation.
 * @param {Zone} zone
 * @param {Date} date
 */
export function offsetLine(zone, date) {
  const abbr = zoneAbbreviationLabel(zone, date);
  const offset = headerOffsetLabel(zone, date);
  return abbr ? `${abbr} · ${offset}` : offset;
}

/** Case- and accent-insensitive form for comparing names. @param {string} text */
function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * A row's full name and the (possibly shorter) name to display. A stored label
 * wins; otherwise a matching city name, otherwise the IANA ID's city.
 * @param {{ zone: Zone, label?: string | null, cities?: readonly City[] | null }} options
 * @returns {{ full: string, display: string }}
 */
export function rowName({ zone, label, cities }) {
  const tz = zone.kind === 'iana' ? zone.tz : null;
  const sameTz = tz && cities ? cities.filter((city) => city.tz === tz) : [];
  let full = label;
  if (!full && tz) {
    const derived = fold(zoneCity(tz));
    const city = sameTz.find((c) =>
      [c.name, c.ascii, c.short].some((name) => name !== undefined && fold(name) === derived),
    );
    full = city?.name ?? zoneCity(tz);
  }
  if (!full) full = formatOffset(zone.kind === 'fixed' ? zone.minutes : 0);
  const key = fold(full);
  const match = sameTz.find((c) => fold(c.name) === key || fold(c.ascii) === key);
  return { full, display: match?.short ?? full };
}
