import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as data from '../../src/data/cities.js';
import { fixedOffsetLabel, popularByRegion, searchZones } from '../../src/lib/search.js';

/** @param {string} query */
function firstCity(query) {
  const result = searchZones(query, data).find((r) => r.type === 'city');
  return result?.type === 'city' ? result.city : undefined;
}

describe('searchZones', () => {
  it('returns nothing for an empty or blank query', () => {
    assert.deepEqual(searchZones('', data), []);
    assert.deepEqual(searchZones('   ', data), []);
  });

  it('finds cities by alias, IANA ID and country', () => {
    assert.equal(firstCity('nyc')?.name, 'New York');
    assert.equal(firstCity('bombay')?.name, 'Mumbai');
    assert.equal(firstCity('Europe/Lisbon')?.name, 'Lisbon');
    assert.equal(firstCity('portugal')?.name, 'Lisbon');
  });

  it('ignores case and accents', () => {
    assert.equal(firstCity('sao paulo')?.name, 'São Paulo');
    assert.equal(firstCity('São Paulo')?.name, 'São Paulo');
    assert.equal(firstCity('SÃO PAULO')?.name, 'São Paulo');
    assert.equal(firstCity('ouagadougou')?.name, 'Ouagadougou');
  });

  it('matches word prefixes and short names', () => {
    assert.equal(firstCity('Ho Chi Minh')?.name, 'Ho Chi Minh City');
    assert.equal(firstCity('rio')?.name, 'Rio de Janeiro');
    assert.equal(firstCity('paulo')?.name, 'São Paulo');
  });

  it('ranks an exact match above a more populous prefix match', () => {
    const rank = (/** @type {string} */ name) => data.cities.find((c) => c.name === name)?.rank;
    // "porto" is only a prefix of Porto Alegre, which is more populous than Porto.
    assert.ok(Number(rank('Porto Alegre')) < Number(rank('Porto')));
    const names = searchZones('porto', data).flatMap((r) =>
      r.type === 'city' ? [r.city.name] : [],
    );
    assert.equal(names[0], 'Porto');
    assert.ok(names.includes('Porto Alegre'));
  });

  it('lists a city once even when several fields match', () => {
    const names = searchZones('new york', data).flatMap((r) =>
      r.type === 'city' ? [r.city.name] : [],
    );
    assert.equal(names.filter((n) => n === 'New York').length, 1);
  });

  it('returns every meaning of an ambiguous abbreviation', () => {
    const ist = searchZones('IST', data).filter((r) => r.type === 'abbreviation');
    assert.deepEqual(
      new Set(ist.map((r) => r.zone.kind === 'iana' && r.zone.tz)),
      new Set(['Asia/Kolkata', 'Europe/Dublin', 'Asia/Jerusalem']),
    );
    assert.equal(ist.length, 3);
    assert.equal(searchZones('ist', data).filter((r) => r.type === 'abbreviation').length, 3);
  });

  it('puts a parsed fixed offset first', () => {
    assert.deepEqual(searchZones('gmt +11', data)[0], {
      type: 'fixed',
      zone: { kind: 'fixed', minutes: 660 },
      label: 'UTC+11:00 (fixed, no daylight saving)',
    });
    assert.equal(searchZones('-0330', data)[0]?.type, 'fixed');
  });

  it('gives no fixed result beyond ±14:00', () => {
    assert.ok(!searchZones('GMT+15', data).some((r) => r.type === 'fixed'));
  });

  it('offers an IANA ID the runtime lists but no city uses', () => {
    assert.ok(!data.cities.some((c) => c.tz === 'Antarctica/Troll'));
    for (const query of ['Antarctica/Troll', 'antarctica/troll']) {
      const iana = searchZones(query, data).filter((r) => r.type === 'iana');
      assert.deepEqual(iana, [{ type: 'iana', zone: { kind: 'iana', tz: 'Antarctica/Troll' } }]);
    }
  });

  it('adds no IANA result when a city already uses the zone', () => {
    assert.ok(!searchZones('Europe/Lisbon', data).some((r) => r.type === 'iana'));
  });
});

describe('fixedOffsetLabel', () => {
  it('uses unpadded hours and two-digit minutes', () => {
    assert.equal(fixedOffsetLabel(660), 'UTC+11:00 (fixed, no daylight saving)');
    assert.equal(fixedOffsetLabel(-210), 'UTC-3:30 (fixed, no daylight saving)');
    assert.equal(fixedOffsetLabel(345), 'UTC+5:45 (fixed, no daylight saving)');
    assert.equal(fixedOffsetLabel(0), 'UTC+0:00 (fixed, no daylight saving)');
  });
});

describe('popularByRegion', () => {
  /**
   * @param {string} name
   * @param {number} rank
   * @param {import('../../src/data/cities.js').City['region']} region
   * @param {boolean} popular
   * @returns {import('../../src/data/cities.js').City}
   */
  const city = (name, rank, region, popular) => ({
    name,
    ascii: name,
    aliases: [],
    cc: 'XX',
    country: 'Testland',
    tz: 'UTC',
    rank,
    region,
    popular,
  });

  it('puts regions in alphabetical order', () => {
    const groups = popularByRegion([
      city('A', 1, 'Oceania', true),
      city('B', 2, 'Asia', true),
      city('C', 3, 'Europe', true),
    ]);
    assert.deepEqual(
      groups.map((g) => g.region),
      ['Asia', 'Europe', 'Oceania'],
    );
  });

  it('orders cities by rank within a region', () => {
    const groups = popularByRegion([
      city('Third', 9, 'Europe', true),
      city('First', 2, 'Europe', true),
      city('Second', 5, 'Europe', true),
    ]);
    assert.deepEqual(
      groups[0]?.cities.map((c) => c.name),
      ['First', 'Second', 'Third'],
    );
  });

  it('keeps popular cities only', () => {
    const groups = popularByRegion([
      city('Shown', 1, 'Europe', true),
      city('Hidden', 2, 'Europe', false),
      city('Alone', 3, 'Africa', false),
    ]);
    assert.deepEqual(groups, [{ region: 'Europe', cities: [city('Shown', 1, 'Europe', true)] }]);
  });

  it('covers every popular city in the bundled data', () => {
    const total = popularByRegion(data.cities).reduce((n, g) => n + g.cities.length, 0);
    assert.equal(total, data.cities.filter((c) => c.popular).length);
    assert.ok(total > 0);
  });
});
