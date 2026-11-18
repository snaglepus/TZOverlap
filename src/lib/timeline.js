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
 * Start of the UTC hour containing `date`.
 * @param {Date} date
 */
export function floorToHour(date) {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
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
  const origin = floorToHour(start);
  const instants = Array.from({ length: hours }, (_, i) => new Date(origin.getTime() + i * HOUR_MS));
  const reference = /** @type {string} */ (zones[0]);

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
