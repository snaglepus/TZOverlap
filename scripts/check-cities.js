// Validates the hand-curated city data in src/data/cities.js. Reads only that
// module: no network, no file writes. Run after editing the data.
// Usage: node scripts/check-cities.js

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidTimeZone } from '../src/lib/timezones.js';

/** @typedef {import('../src/data/cities.js').CityData} CityData */

export const CITY_COUNT = { min: 450, max: 550 };
export const POPULAR_COUNT = { min: 90, max: 110 };
export const REGIONS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
];

/**
 * Every problem with `data`, as human-readable strings. Empty when valid.
 * @param {CityData} data
 * @returns {string[]}
 */
export function validateCityData(data) {
  /** @type {string[]} */
  const problems = [];
  const { cities, abbreviations } = data;

  if (cities.length < CITY_COUNT.min || cities.length > CITY_COUNT.max) {
    problems.push(`city count ${cities.length} is outside ${CITY_COUNT.min}–${CITY_COUNT.max}`);
  }
  const popular = cities.filter((c) => c.popular).length;
  if (popular < POPULAR_COUNT.min || popular > POPULAR_COUNT.max) {
    problems.push(`popular count ${popular} is outside ${POPULAR_COUNT.min}–${POPULAR_COUNT.max}`);
  }

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, string>} */
  const countryByCode = new Map();
  /** @type {Set<number>} */
  const ranks = new Set();
  for (const city of cities) {
    const label = `${city.name} (${city.cc})`;
    if (!isValidTimeZone(city.tz)) problems.push(`${label}: unknown time zone "${city.tz}"`);
    if (!/^[A-Z]{2}$/.test(city.cc)) problems.push(`${label}: country code is not two letters`);
    const key = `${city.ascii.toLowerCase()}|${city.cc}`;
    if (seen.has(key)) problems.push(`${label}: duplicate city and country`);
    seen.add(key);
    const country = countryByCode.get(city.cc);
    if (country === undefined) countryByCode.set(city.cc, city.country);
    else if (country !== city.country) {
      problems.push(`${label}: country "${city.country}" differs from "${country}"`);
    }
    if (!Number.isInteger(city.rank) || city.rank < 1) {
      problems.push(`${label}: rank ${city.rank} is not a positive integer`);
    } else if (ranks.has(city.rank)) problems.push(`${label}: rank ${city.rank} is not unique`);
    ranks.add(city.rank);
    if (!REGIONS.includes(city.region)) problems.push(`${label}: unknown region "${city.region}"`);
  }

  for (const [key, meanings] of Object.entries(abbreviations)) {
    if (!/^[A-Z]{2,5}$/.test(key)) problems.push(`abbreviation "${key}" is not 2–5 capitals`);
    if (meanings.length === 0) problems.push(`abbreviation ${key} has no meanings`);
    for (const meaning of meanings) {
      if (!isValidTimeZone(meaning.tz)) {
        problems.push(`abbreviation ${key}: unknown time zone "${meaning.tz}"`);
      }
    }
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const data = await import('../src/data/cities.js');
  const problems = validateCityData(data);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  const popular = data.cities.filter((c) => c.popular).length;
  console.log(`City data OK: ${data.cities.length} cities, ${popular} popular.`);
}
