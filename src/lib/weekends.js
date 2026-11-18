// Weekend days by country. Keys are ISO 3166-1 alpha-2 codes; values are
// weekday numbers (0 = Sunday ... 6 = Saturday). Countries not listed, zones
// with no country and fixed-offset zones use `default` (Sat-Sun).

/** @typedef {import('./zones.js').Zone} Zone */

const FRI_SAT = Object.freeze([5, 6]);

/** @type {Readonly<Record<string, readonly number[]>>} */
export const WEEKENDS = Object.freeze({
  SA: FRI_SAT,
  IL: FRI_SAT,
  EG: FRI_SAT,
  KW: FRI_SAT,
  QA: FRI_SAT,
  BH: FRI_SAT,
  OM: FRI_SAT,
  JO: FRI_SAT,
  IQ: FRI_SAT,
  SY: FRI_SAT,
  YE: FRI_SAT,
  DZ: FRI_SAT,
  SD: FRI_SAT,
  LY: FRI_SAT,
  BD: FRI_SAT,
  MV: FRI_SAT,
  default: Object.freeze([6, 0]),
});

const DEFAULT_WEEKEND = /** @type {readonly number[]} */ (WEEKENDS.default);

/**
 * Weekend weekday numbers for `zone`. Fixed zones are always Sat-Sun.
 * @param {Zone} zone
 * @param {string} [country] ISO 3166-1 alpha-2 code, any case
 * @returns {readonly number[]}
 */
export function weekendDays(zone, country) {
  if (zone.kind === 'fixed' || !country) return DEFAULT_WEEKEND;
  const code = country.toUpperCase();
  return (Object.hasOwn(WEEKENDS, code) && WEEKENDS[code]) || DEFAULT_WEEKEND;
}

/**
 * @param {number} weekday 0 = Sunday ... 6 = Saturday
 * @param {readonly number[]} days
 */
export function isWeekend(weekday, days) {
  return days.includes(weekday);
}
