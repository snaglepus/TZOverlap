import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTime, localeHourCycle, resolveHourCycle } from '../../src/lib/time-format.js';

/** @param {number} hour @param {number} minute */
const t = (hour, minute) => ({ hour, minute });

describe('formatTime', () => {
  it('formats compact 12-hour labels with the hour only', () => {
    assert.equal(formatTime(t(0, 0), 'h12', 'compact'), '12a');
    assert.equal(formatTime(t(1, 0), 'h12', 'compact'), '1a');
    assert.equal(formatTime(t(11, 0), 'h12', 'compact'), '11a');
    assert.equal(formatTime(t(12, 0), 'h12', 'compact'), '12p');
    assert.equal(formatTime(t(13, 0), 'h12', 'compact'), '1p');
    assert.equal(formatTime(t(21, 0), 'h12', 'compact'), '9p');
    assert.equal(formatTime(t(9, 30), 'h12', 'compact'), '9a');
    assert.equal(formatTime(t(9, 45), 'h12', 'compact'), '9a');
    assert.equal(formatTime(t(23, 45), 'h12', 'compact'), '11p');
  });

  it('formats compact 24-hour labels as a two-digit hour', () => {
    assert.equal(formatTime(t(0, 0), 'h23', 'compact'), '00');
    assert.equal(formatTime(t(12, 0), 'h23', 'compact'), '12');
    assert.equal(formatTime(t(9, 30), 'h23', 'compact'), '09');
    assert.equal(formatTime(t(9, 45), 'h23', 'compact'), '09');
    assert.equal(formatTime(t(23, 45), 'h23', 'compact'), '23');
  });

  it('formats full 12-hour times', () => {
    assert.equal(formatTime(t(0, 0), 'h12', 'full'), '12:00 am');
    assert.equal(formatTime(t(12, 0), 'h12', 'full'), '12:00 pm');
    assert.equal(formatTime(t(9, 30), 'h12', 'full'), '9:30 am');
    assert.equal(formatTime(t(12, 45), 'h12', 'full'), '12:45 pm');
    assert.equal(formatTime(t(23, 45), 'h12', 'full'), '11:45 pm');
  });

  it('formats full 24-hour times', () => {
    assert.equal(formatTime(t(0, 0), 'h23', 'full'), '00:00');
    assert.equal(formatTime(t(12, 0), 'h23', 'full'), '12:00');
    assert.equal(formatTime(t(9, 30), 'h23', 'full'), '09:30');
    assert.equal(formatTime(t(12, 45), 'h23', 'full'), '12:45');
    assert.equal(formatTime(t(23, 45), 'h23', 'full'), '23:45');
  });
});

describe('resolveHourCycle', () => {
  it('keeps an explicit choice', () => {
    assert.equal(resolveHourCycle('h12', 'h23'), 'h12');
    assert.equal(resolveHourCycle('h23', 'h12'), 'h23');
  });

  it('follows the locale for auto', () => {
    assert.equal(resolveHourCycle('auto', 'h11'), 'h12');
    assert.equal(resolveHourCycle('auto', 'h12'), 'h12');
    assert.equal(resolveHourCycle('auto', 'h23'), 'h23');
    assert.equal(resolveHourCycle('auto', 'h24'), 'h23');
  });

  it('falls back to 24-hour for an unknown locale cycle', () => {
    assert.equal(resolveHourCycle('auto', undefined), 'h23');
  });
});

describe('localeHourCycle', () => {
  it('reads the cycle with an hour field requested', () => {
    assert.equal(localeHourCycle('en-US'), 'h12');
    assert.equal(localeHourCycle('en-GB'), 'h23');
  });
});
