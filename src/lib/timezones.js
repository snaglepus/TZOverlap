// Time zone primitives built on the platform Intl API (no tz database shipped).

/** @type {Map<string, Intl.DateTimeFormat>} */
const partsFormatters = new Map();

/** @param {string} timeZone */
function partsFormatter(timeZone) {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    partsFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * True if the runtime recognises `timeZone` as an IANA zone name.
 * @param {unknown} timeZone
 * @returns {timeZone is string}
 */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** @type {Map<string, string> | null} */
let knownZones = null;

/** Lower-case name -> proper name, from the runtime's zone list. */
function zoneLookup() {
  if (!knownZones) {
    knownZones = new Map();
    try {
      for (const zone of Intl.supportedValuesOf('timeZone'))
        knownZones.set(zone.toLowerCase(), zone);
    } catch {
      // Older runtime without supportedValuesOf: fall back to casing heuristics.
    }
  }
  return knownZones;
}

/**
 * Proper casing for a zone the runtime accepts, preserving the name the user
 * chose: "europe/paris" -> "Europe/Paris", "Asia/Kolkata" stays "Asia/Kolkata"
 * (Chromium's resolvedOptions() would turn it into the legacy "Asia/Calcutta").
 * @param {string} timeZone
 * @returns {string}
 */
export function canonicalTimeZone(timeZone) {
  const input = timeZone.trim();
  const lower = input.toLowerCase();
  const listed = zoneLookup().get(lower);
  if (listed) return listed;
  const resolved = new Intl.DateTimeFormat('en-US', { timeZone: input }).resolvedOptions().timeZone;
  if (resolved.toLowerCase() === lower) return resolved;
  if (input !== lower) return input; // user supplied casing; trust it
  return lower.replace(/(^|[/_-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/**
 * True if the runtime ships real time zone data. Some minimal ICU builds only
 * know UTC; TZ Overlap cannot work there.
 */
export function hasTimeZoneSupport() {
  try {
    return (
      isValidTimeZone('Asia/Tokyo') &&
      offsetMinutes('Asia/Tokyo', new Date(Date.UTC(2026, 0, 1))) === 540
    );
  } catch {
    return false;
  }
}

/** @returns {string} the browser's (or Node's) current IANA time zone */
export function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Wall-clock parts of `date` in `timeZone`.
 * @param {string} timeZone
 * @param {Date} date
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, weekday: string }}
 */
export function localParts(timeZone, date) {
  /** @type {Record<string, string>} */
  const p = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: p.weekday ?? '',
  };
}

/**
 * Offset of `timeZone` from UTC at `date`, in minutes (e.g. +60 for CET, -300 for EST).
 * @param {string} timeZone
 * @param {Date} date
 */
export function offsetMinutes(timeZone, date) {
  const p = localParts(timeZone, date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60000) * 60000;
  return Math.round((asUtc - truncated) / 60000);
}

/**
 * Format an offset in minutes as "UTC+5:30" / "UTC-4" / "UTC".
 * @param {number} minutes
 */
export function formatOffset(minutes) {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/**
 * "09:30" style 24-hour label for `date` in `timeZone`.
 * @param {string} timeZone
 * @param {Date} date
 */
export function formatClock(timeZone, date) {
  const p = localParts(timeZone, date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/**
 * Human label for a zone: "Europe/London" -> "London".
 * @param {string} timeZone
 */
export function zoneCity(timeZone) {
  const last = timeZone.split('/').pop() ?? timeZone;
  return last.replace(/_/g, ' ');
}
