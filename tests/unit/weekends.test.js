import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWeekend, weekendDays, WEEKENDS } from '../../src/lib/weekends.js';

/** @type {import('../../src/lib/zones.js').Zone} */
const riyadh = { kind: 'iana', tz: 'Asia/Riyadh' };

describe('weekendDays', () => {
  it('gives Fri-Sat for Fri-Sat countries, in any case', () => {
    for (const country of ['SA', 'IL', 'EG', 'sa']) {
      assert.deepEqual(weekendDays(riyadh, country), [5, 6], country);
    }
  });

  it('gives Sat-Sun for other, missing and unknown countries', () => {
    const sydney = { kind: /** @type {const} */ ('iana'), tz: 'Australia/Sydney' };
    assert.deepEqual(weekendDays(sydney, 'AU'), [6, 0]);
    assert.deepEqual(weekendDays(sydney), [6, 0]);
    assert.deepEqual(weekendDays(sydney, ''), [6, 0]);
    assert.deepEqual(weekendDays(sydney, 'ZZ'), [6, 0]);
  });

  it('gives Sat-Sun for fixed zones whatever the country (FR-36)', () => {
    assert.deepEqual(weekendDays({ kind: 'fixed', minutes: 180 }, 'SA'), [6, 0]);
  });
});

describe('WEEKENDS', () => {
  it('is frozen, with Sat-Sun as the default', () => {
    assert.ok(Object.isFrozen(WEEKENDS));
    assert.ok(Object.isFrozen(WEEKENDS.SA));
    assert.deepEqual(WEEKENDS.default, [6, 0]);
  });
});

describe('isWeekend', () => {
  it('checks a weekday against a weekend', () => {
    assert.equal(isWeekend(5, [5, 6]), true);
    assert.equal(isWeekend(0, [5, 6]), false);
    assert.equal(isWeekend(0, [6, 0]), true);
  });
});
