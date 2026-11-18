// Builds aligned timelines: every row shares the same UTC instants, so column N
// is the same moment in every zone.

import { bandForScore, combineScores, scoreHour } from './hours.js';
import { formatClock, localParts, offsetMinutes } from './timezones.js';

const HOUR_MS = 3_600_000;

/**
 * @typedef {import('./hours.js').Score} Score
 * @typedef {import('./hours.js').Band} Band
 * @typedef {{ instant: Date, hour: number, label: string, dayShift: number, score: Score, band: Band }} Slot
 * @typedef {{ timeZone: string, offsetMinutes: number, slots: Slot[] }} Row
 * @typedef {{ start: Date, rows: Row[], overlap: { score: Score, band: Band }[] }} Timeline
 */

/**
 * Start of the wall-clock hour containing `date` in `timeZone`. Equals the UTC
 * hour for whole-hour zones; differs for e.g. Asia/Kolkata (UTC+5:30).
 * @param {string} timeZone
 * @param {Date} date
 */
export function floorToZoneHour(timeZone, date) {
  const minuteStart = Math.floor(date.getTime() / 60_000) * 60_000;
  return new Date(minuteStart - localParts(timeZone, date).minute * 60_000);
}

/**
 * Local midnight (00:00) of the calendar day containing `date` in `timeZone`.
 * Correct on DST-change days, where the day is 23 or 25 hours long.
 * @param {string} timeZone
 * @param {Date} date
 */
export function startOfLocalDay(timeZone, date) {
  const p = localParts(timeZone, date);
  const minuteStart = Math.floor(date.getTime() / 60_000) * 60_000;
  const naive = new Date(minuteStart - (p.hour * 60 + p.minute) * 60_000);
  // If a DST shift happened since midnight, the naive guess is off by the shift.
  const shift = offsetMinutes(timeZone, date) - offsetMinutes(timeZone, naive);
  return new Date(naive.getTime() + shift * 60_000);
}

/**
 * Whole-day difference between two calendar dates.
 * @param {{ year: number, month: number, day: number }} a
 * @param {{ year: number, month: number, day: number }} b
 */
function dayDiff(a, b) {
  return Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000,
  );
}

/**
 * @param {{ zones: readonly string[], start: Date, hours?: number }} options
 *   zones[0] is the reference zone; `dayShift` is relative to its calendar date.
 * @returns {Timeline}
 */
export function buildTimeline({ zones, start, hours = 24 }) {
  if (zones.length === 0) throw new Error('buildTimeline needs at least one zone');
  const reference = /** @type {string} */ (zones[0]);
  const origin = floorToZoneHour(reference, start);
  const instants = Array.from(
    { length: hours },
    (_, i) => new Date(origin.getTime() + i * HOUR_MS),
  );

  const rows = zones.map((timeZone) => ({
    timeZone,
    offsetMinutes: offsetMinutes(timeZone, origin),
    slots: instants.map((instant) => {
      const parts = localParts(timeZone, instant);
      const score = scoreHour(parts.hour);
      return {
        instant,
        hour: parts.hour,
        label: formatClock(timeZone, instant),
        dayShift: dayDiff(parts, localParts(reference, instant)),
        score,
        band: bandForScore(score),
      };
    }),
  }));

  const overlap = instants.map((_, i) => {
    const score = combineScores(rows.map((row) => /** @type {Slot} */ (row.slots[i]).score));
    return { score, band: bandForScore(score) };
  });

  return { start: origin, rows, overlap };
}
