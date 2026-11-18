import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseFixedOffset,
  zoneAbbreviation,
  zoneLocalParts,
  zoneOffsetLabel,
  zoneOffsetMinutes,
  zonesEqual,
} from '../../src/lib/zones.js';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));

/**
 * @param {string} dir
 * @returns {string[]}
 */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe('parseFixedOffset', () => {
  it('parses the FR-16 formats (T7)', () => {
    assert.equal(parseFixedOffset('GMT+11'), 660);
    assert.equal(parseFixedOffset('UTC-7'), -420);
    assert.equal(parseFixedOffset('+5:30'), 330);
    assert.equal(parseFixedOffset('-0330'), -210);
    assert.equal(parseFixedOffset('gmt +11'), 660);
    assert.equal(parseFixedOffset('GMT+05:45'), 345);
  });

  it('returns null for anything that is not an offset', () => {
    for (const input of [
      'GMT+15',
      '+14:30',
      'UTC+5:99',
      'London',
      'hello',
      '',
      '5',
      'UTC5',
      '+530',
      '+5:3',
      undefined,
      42,
    ]) {
      assert.doesNotThrow(() => parseFixedOffset(input));
      assert.equal(parseFixedOffset(input), null, String(input));
    }
  });

  it('handles the edges of the grammar', () => {
    assert.equal(parseFixedOffset('+14:00'), 840);
    assert.equal(parseFixedOffset('-14:00'), -840);
    assert.equal(parseFixedOffset('UTC'), 0);
    assert.equal(parseFixedOffset('gmt'), 0);
    assert.equal(Object.is(parseFixedOffset('UTC-0'), 0), true);
    assert.equal(parseFixedOffset('  utc+0530  '), 330);
    assert.equal(parseFixedOffset('−3'), -180);
  });
});

describe('zoneOffsetMinutes', () => {
  it('keeps fixed offsets fixed while IANA zones follow DST (T8)', () => {
    const sydney = /** @type {const} */ ({ kind: 'iana', tz: 'Australia/Sydney' });
    const fixed = /** @type {const} */ ({ kind: 'fixed', minutes: 600 });
    const january = new Date('2026-01-15T00:00:00Z');
    const july = new Date('2026-07-15T00:00:00Z');
    assert.equal(zoneOffsetMinutes(sydney, january) - zoneOffsetMinutes(fixed, january), 60);
    assert.equal(zoneOffsetMinutes(sydney, july) - zoneOffsetMinutes(fixed, july), 0);
  });
});

describe('zoneOffsetLabel', () => {
  it('formats fixed and IANA offsets', () => {
    const d = new Date('2026-03-01T00:00:00Z');
    assert.equal(zoneOffsetLabel({ kind: 'fixed', minutes: 330 }, d), 'UTC+5:30');
    assert.equal(zoneOffsetLabel({ kind: 'fixed', minutes: -210 }, d), 'UTC-3:30');
    assert.equal(zoneOffsetLabel({ kind: 'iana', tz: 'Asia/Kathmandu' }, d), 'UTC+5:45');
  });
});

describe('zoneLocalParts', () => {
  it('computes fixed-zone wall clock by arithmetic, matching Intl', () => {
    const d = new Date('2026-01-15T20:00:00Z');
    const expected = { year: 2026, month: 1, day: 16, hour: 1, minute: 30, weekday: 'Fri' };
    assert.deepEqual(zoneLocalParts({ kind: 'fixed', minutes: 330 }, d), expected);
    assert.deepEqual(zoneLocalParts({ kind: 'iana', tz: 'Asia/Kolkata' }, d), expected);
  });
});

describe('zoneAbbreviation', () => {
  it('returns the Intl short name for IANA zones in the given locale', () => {
    assert.equal(
      zoneAbbreviation(
        { kind: 'iana', tz: 'Australia/Sydney' },
        new Date('2026-01-15T00:00:00Z'),
        'en-AU',
      ),
      'AEDT',
    );
    assert.equal(
      zoneAbbreviation(
        { kind: 'iana', tz: 'America/New_York' },
        new Date('2026-01-15T12:00:00Z'),
        'en-US',
      ),
      'EST',
    );
  });

  it('uses the offset label for fixed zones', () => {
    const d = new Date('2026-01-15T00:00:00Z');
    assert.equal(zoneAbbreviation({ kind: 'fixed', minutes: 330 }, d), 'UTC+5:30');
  });
});

describe('zonesEqual', () => {
  it('matches same IANA ID or same fixed offset only', () => {
    assert.equal(
      zonesEqual({ kind: 'iana', tz: 'Europe/London' }, { kind: 'iana', tz: 'Europe/London' }),
      true,
    );
    assert.equal(
      zonesEqual({ kind: 'fixed', minutes: 660 }, { kind: 'fixed', minutes: 660 }),
      true,
    );
    assert.equal(
      zonesEqual({ kind: 'iana', tz: 'Asia/Kolkata' }, { kind: 'fixed', minutes: 330 }),
      false,
    );
    assert.equal(
      zonesEqual({ kind: 'iana', tz: 'Europe/London' }, { kind: 'iana', tz: 'Europe/Paris' }),
      false,
    );
    assert.equal(
      zonesEqual({ kind: 'fixed', minutes: 660 }, { kind: 'fixed', minutes: 600 }),
      false,
    );
  });
});

describe('fixed offsets stay arithmetic', () => {
  it('never maps to Etc/GMT zone IDs in src/', () => {
    for (const file of filesUnder(srcDir)) {
      assert.equal(readFileSync(file, 'utf8').includes('Etc/GMT'), false, file);
    }
  });
});
