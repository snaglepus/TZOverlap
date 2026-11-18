import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { floorToZoneHour, startOfLocalDay } from '../../src/lib/timeline.js';

describe('floorToZoneHour', () => {
  it('floors to the UTC hour for whole-hour zones', () => {
    const d = new Date('2026-06-15T13:47:12Z');
    assert.equal(floorToZoneHour('Europe/London', d).toISOString(), '2026-06-15T13:00:00.000Z');
  });

  it('floors to the local half-hour boundary in UTC+5:30', () => {
    const d = new Date('2026-06-15T13:47:12Z'); // 19:17 in Kolkata
    assert.equal(floorToZoneHour('Asia/Kolkata', d).toISOString(), '2026-06-15T13:30:00.000Z');
  });
});

describe('startOfLocalDay', () => {
  it('returns local midnight', () => {
    const d = new Date('2026-06-15T13:47:00Z');
    assert.equal(startOfLocalDay('Asia/Tokyo', d).toISOString(), '2026-06-14T15:00:00.000Z');
    assert.equal(startOfLocalDay('Asia/Kolkata', d).toISOString(), '2026-06-14T18:30:00.000Z');
  });

  it('is correct on a spring-forward day (23-hour day)', () => {
    // New York 2026-03-08: 02:00 EST jumps to 03:00 EDT. 15:00 EDT = 19:00Z.
    const d = new Date('2026-03-08T19:00:00Z');
    assert.equal(startOfLocalDay('America/New_York', d).toISOString(), '2026-03-08T05:00:00.000Z');
  });

  it('is correct on a fall-back day (25-hour day)', () => {
    // New York 2026-11-01: 02:00 EDT falls back to 01:00 EST. 15:00 EST = 20:00Z.
    const d = new Date('2026-11-01T20:00:00Z');
    assert.equal(startOfLocalDay('America/New_York', d).toISOString(), '2026-11-01T04:00:00.000Z');
  });
});
