import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateCityData } from '../../scripts/check-cities.js';
import * as data from '../../src/data/cities.js';
import { loadCityData } from '../../src/lib/city-data.js';

/** @typedef {import('../../src/data/cities.js').City} City */

/**
 * A valid city with a unique name and rank.
 * @param {number} i
 * @returns {City}
 */
function fixtureCity(i) {
  return {
    name: `Town ${i}`,
    ascii: `Town ${i}`,
    aliases: [],
    cc: 'AU',
    country: 'Australia',
    tz: 'Australia/Sydney',
    rank: i + 1,
    region: 'Oceania',
    popular: i < 100,
  };
}

/**
 * Valid fixture data, with `change` applied to the first city.
 * @param {Partial<City>} [change]
 */
function fixture(change = {}) {
  const cities = Array.from({ length: 500 }, (_, i) => fixtureCity(i));
  cities[0] = { ...fixtureCity(0), ...change };
  return { cities, abbreviations: { AEST: [{ name: 'Eastern', tz: 'Australia/Sydney' }] } };
}

describe('city data', () => {
  it('passes validateCityData', () => {
    assert.deepEqual(validateCityData(data), []);
  });

  it('has 450 to 550 cities, 90 to 110 of them popular', () => {
    assert.ok(data.cities.length >= 450 && data.cities.length <= 550, `${data.cities.length}`);
    const popular = data.cities.filter((c) => c.popular).length;
    assert.ok(popular >= 90 && popular <= 110, `${popular}`);
  });

  it('uses only zones Intl.DateTimeFormat accepts', () => {
    const zones = [
      ...data.cities.map((c) => c.tz),
      ...Object.values(data.abbreviations).flatMap((list) => list.map((m) => m.tz)),
    ];
    for (const timeZone of zones) {
      assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone }), timeZone);
    }
  });

  it('uses two-letter country codes and no duplicate city plus country', () => {
    const keys = new Set();
    for (const city of data.cities) {
      assert.match(city.cc, /^[A-Z]{2}$/, city.name);
      const key = `${city.ascii.toLowerCase()}|${city.cc}`;
      assert.ok(!keys.has(key), `duplicate ${key}`);
      keys.add(key);
    }
  });

  it('lists every meaning of IST and CST', () => {
    assert.deepEqual(
      data.abbreviations.IST?.map((m) => m.tz),
      ['Asia/Kolkata', 'Europe/Dublin', 'Asia/Jerusalem'],
    );
    const cst = data.abbreviations.CST?.map((m) => m.tz) ?? [];
    assert.ok(cst.includes('America/Chicago') && cst.includes('Asia/Shanghai'));
  });
});

describe('validateCityData', () => {
  it('accepts the valid fixture', () => {
    assert.deepEqual(validateCityData(fixture()), []);
  });

  it('reports a bad zone', () => {
    assert.match(validateCityData(fixture({ tz: 'Mars/Olympus' })).join('\n'), /Mars\/Olympus/);
  });

  it('reports a three-letter country code', () => {
    assert.match(validateCityData(fixture({ cc: 'AUS' })).join('\n'), /two letters/);
  });

  it('reports a duplicate city plus country', () => {
    assert.match(validateCityData(fixture({ ascii: 'TOWN 1' })).join('\n'), /duplicate/);
  });

  it('reports a city count out of range', () => {
    const data = fixture();
    data.cities.length = 449;
    assert.match(validateCityData(data).join('\n'), /city count 449/);
  });

  it('reports a bad abbreviation key', () => {
    const data = { ...fixture(), abbreviations: { aest: [{ name: 'x', tz: 'Australia/Sydney' }] } };
    assert.match(validateCityData(data).join('\n'), /aest/);
  });
});

describe('loadCityData', () => {
  it('imports the data once and caches the promise', async () => {
    const first = loadCityData();
    assert.equal(loadCityData(), first);
    const loaded = await first;
    assert.equal(loaded.cities.length, data.cities.length);
    assert.equal(loaded.abbreviations, data.abbreviations);
  });
});
