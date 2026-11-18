import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalTimeZone,
  formatClock,
  formatOffset,
  isValidTimeZone,
  localParts,
  offsetMinutes,
  zoneCity,
} from '../../src/lib/timezones.js';

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects junk', () => {
    assert.equal(isValidTimeZone('Europe/London'), true);
    assert.equal(isValidTimeZone('Asia/Kolkata'), true);
    assert.equal(isValidTimeZone('Mars/Olympus_Mons'), false);
    assert.equal(isValidTimeZone(''), false);
    assert.equal(isValidTimeZone(42), false);
  });

  it('canonicalises casing', () => {
    assert.equal(canonicalTimeZone('america/new_york'), 'America/New_York');
  });
});

describe('offsetMinutes', () => {
  it('follows daylight saving in New York', () => {
    assert.equal(offsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z')), -300);
    assert.equal(offsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z')), -240);
  });

  it('handles half- and quarter-hour zones', () => {
    assert.equal(offsetMinutes('Asia/Kolkata', new Date('2026-03-01T00:00:00Z')), 330);
    assert.equal(offsetMinutes('Asia/Kathmandu', new Date('2026-03-01T00:00:00Z')), 345);
  });

  it('flips at the exact DST transition instant', () => {
    // US spring-forward 2026: 2026-03-08 07:00Z (02:00 EST -> 03:00 EDT)
    assert.equal(offsetMinutes('America/New_York', new Date('2026-03-08T06:59:00Z')), -300);
    assert.equal(offsetMinutes('America/New_York', new Date('2026-03-08T07:00:00Z')), -240);
  });
});

describe('formatting', () => {
  it('formats offsets', () => {
    assert.equal(formatOffset(0), 'UTC');
    assert.equal(formatOffset(330), 'UTC+5:30');
    assert.equal(formatOffset(-240), 'UTC-4');
  });

  it('formats local wall-clock time and parts', () => {
    const instant = new Date('2026-06-01T23:30:00Z');
    assert.equal(formatClock('Asia/Tokyo', instant), '08:30');
    assert.deepEqual(
      { ...localParts('Asia/Tokyo', instant), weekday: undefined },
      { year: 2026, month: 6, day: 2, hour: 8, minute: 30, weekday: undefined },
    );
  });

  it('derives a city label', () => {
    assert.equal(zoneCity('America/Los_Angeles'), 'Los Angeles');
    assert.equal(zoneCity('UTC'), 'UTC');
  });
});
