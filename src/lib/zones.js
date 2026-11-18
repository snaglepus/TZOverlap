// Zone model: IANA zones and fixed UTC offsets. Fixed offsets are plain
// arithmetic and never become Etc/ IDs, so they have no daylight saving.

import { formatOffset, localParts, offsetMinutes } from './timezones.js';

/**
 * @typedef {{ kind: 'iana', tz: string } | { kind: 'fixed', minutes: number }} Zone
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_OFFSET_MINUTES = 14 * 60;
const OFFSET_PATTERN = /^(?:(?:gmt|utc)\s*)?([+\-−])(?:(\d{1,2})(?::(\d{2}))?|(\d{2})(\d{2}))$/i;

/** @type {Map<string, Intl.DateTimeFormat>} */
const abbreviationFormatters = new Map();

/**
 * @param {string} locale
 * @param {string} timeZone
 */
function abbreviationFormatter(locale, timeZone) {
  const key = `${locale}|${timeZone}`;
  let fmt = abbreviationFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' });
    abbreviationFormatters.set(key, fmt);
  }
  return fmt;
}

/**
 * Offset of `zone` from UTC at `date`, in minutes.
 * @param {Zone} zone
 * @param {Date} date
 */
export function zoneOffsetMinutes(zone, date) {
  return zone.kind === 'fixed' ? zone.minutes : offsetMinutes(zone.tz, date);
}

/**
 * Wall-clock parts of `date` in `zone`, same shape as `localParts`.
 * @param {Zone} zone
 * @param {Date} date
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, weekday: string }}
 */
export function zoneLocalParts(zone, date) {
  if (zone.kind === 'iana') return localParts(zone.tz, date);
  const shifted = new Date(date.getTime() + zone.minutes * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: WEEKDAYS[shifted.getUTCDay()] ?? '',
  };
}

/**
 * "UTC+5:30" style label for `zone` at `date`.
 * @param {Zone} zone
 * @param {Date} date
 */
export function zoneOffsetLabel(zone, date) {
  return formatOffset(zoneOffsetMinutes(zone, date));
}

/**
 * Short zone name from Intl ("AEDT", "EST", or "GMT+11" in some locales).
 * A fixed zone has no abbreviation, so it gets its offset label.
 * @param {Zone} zone
 * @param {Date} date
 * @param {string} [locale]
 */
export function zoneAbbreviation(zone, date, locale = 'en-US') {
  if (zone.kind === 'fixed') return zoneOffsetLabel(zone, date);
  const parts = abbreviationFormatter(locale, zone.tz).formatToParts(date);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/**
 * Same IANA ID or same fixed offset. An IANA zone never equals a fixed one.
 * @param {Zone} a
 * @param {Zone} b
 */
export function zonesEqual(a, b) {
  if (a.kind === 'iana' && b.kind === 'iana') return a.tz === b.tz;
  if (a.kind === 'fixed' && b.kind === 'fixed') return a.minutes === b.minutes;
  return false;
}

/**
 * Parse "GMT+11", "UTC-7", "+5:30", "-0330", "gmt +11", "GMT+05:45" or a bare
 * "UTC"/"GMT" into minutes east of UTC. Returns null for anything else.
 * @param {unknown} text
 * @returns {number | null}
 */
export function parseFixedOffset(text) {
  if (typeof text !== 'string') return null;
  const input = text.trim();
  if (/^(?:gmt|utc)$/i.test(input)) return 0;
  const match = OFFSET_PATTERN.exec(input);
  if (!match) return null;
  const [, sign, shortHours, shortMinutes, longHours, longMinutes] = match;
  const hours = Number(shortHours ?? longHours);
  const minutes = Number(shortMinutes ?? longMinutes ?? 0);
  if (minutes > 59) return null;
  const total = hours * 60 + minutes;
  if (total > MAX_OFFSET_MINUTES) return null;
  if (total === 0) return 0;
  return sign === '+' ? total : -total;
}
