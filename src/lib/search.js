// Zone search over the bundled city data: fixed offsets, abbreviations, cities
// and IANA IDs the runtime knows but the list doesn't. Pure: the caller passes
// the data in (see city-data.js).

import { listedTimeZone } from './timezones.js';
import { parseFixedOffset } from './zones.js';

/** @typedef {import('./zones.js').Zone} Zone */
/** @typedef {import('../data/cities.js').City} City */
/** @typedef {import('../data/cities.js').CityData} CityData */

/**
 * @typedef {{ type: 'fixed', zone: Zone, label: string }
 *   | { type: 'abbreviation', zone: Zone, abbreviation: string, name: string }
 *   | { type: 'city', zone: Zone, city: City }
 *   | { type: 'iana', zone: Zone }} SearchResult
 */

const WORD_SEPARATORS = /[\s/_,-]+/;

/**
 * Case- and accent-insensitive form of `text`.
 * @param {string} text
 */
function normalise(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * "UTC+11:00 (fixed, no daylight saving)": unpadded hours, two-digit minutes.
 * @param {number} minutes
 */
export function fixedOffsetLabel(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${Math.floor(abs / 60)}:${mm} (fixed, no daylight saving)`;
}

/**
 * How well `city` matches the normalised query: 2 exact, 1 prefix, 0 none.
 * @param {City} city
 * @param {string} query
 */
function cityMatch(city, query) {
  const fields = [city.name, city.ascii, city.short ?? '', ...city.aliases, city.country, city.tz];
  let best = 0;
  for (const field of fields) {
    const value = normalise(field);
    if (value === '') continue;
    if (value === query) return 2;
    if (value.startsWith(query) || value.split(WORD_SEPARATORS).some((w) => w.startsWith(query))) {
      best = 1;
    }
  }
  return best;
}

/**
 * Ordered search results for `query`: a fixed offset first, then every meaning
 * of an exact abbreviation, then matching cities (exact before prefix, then by
 * population rank), then an IANA ID the runtime lists but no city uses.
 * @param {string} query
 * @param {CityData} data
 * @returns {SearchResult[]}
 */
export function searchZones(query, data) {
  const q = normalise(query);
  if (q === '') return [];
  /** @type {SearchResult[]} */
  const results = [];

  const minutes = parseFixedOffset(query);
  if (minutes !== null) {
    results.push({
      type: 'fixed',
      zone: { kind: 'fixed', minutes },
      label: fixedOffsetLabel(minutes),
    });
  }

  for (const [abbreviation, meanings] of Object.entries(data.abbreviations)) {
    if (abbreviation.toLowerCase() !== q) continue;
    for (const { name, tz } of meanings) {
      results.push({ type: 'abbreviation', zone: { kind: 'iana', tz }, abbreviation, name });
    }
  }

  const matches = data.cities
    .map((city) => ({ city, score: cityMatch(city, q) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.city.rank - b.city.rank);
  for (const { city } of matches) {
    results.push({ type: 'city', zone: { kind: 'iana', tz: city.tz }, city });
  }

  const tz = listedTimeZone(query);
  if (tz && !data.cities.some((city) => city.tz === tz)) {
    results.push({ type: 'iana', zone: { kind: 'iana', tz } });
  }
  return results;
}
