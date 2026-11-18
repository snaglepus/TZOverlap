// Lazy loader for the bundled city data. The data module is pulled in with a
// dynamic import() on first use, so it never weighs on the initial page load.

/** @typedef {import('../data/cities.js').CityData} CityData */

/** @type {Promise<CityData> | null} */
let pending = null;
/** @type {CityData | null} */
let loaded = null;

/**
 * The city and abbreviation data, imported once and cached.
 * @returns {Promise<CityData>}
 */
export function loadCityData() {
  if (!pending) {
    pending = import('../data/cities.js').then(({ cities, abbreviations }) => ({
      cities,
      abbreviations,
    }));
    pending.then((data) => {
      loaded = data;
    });
  }
  return pending;
}

/**
 * The city data if loadCityData() has already resolved, otherwise null. Never
 * starts a load.
 * @returns {CityData | null}
 */
export function cityDataIfLoaded() {
  return loaded;
}
