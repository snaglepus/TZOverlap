import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bandForScore, combineScores, scoreHour } from '../../src/lib/hours.js';

describe('scoreHour', () => {
  it('treats core working hours as ideal', () => {
    for (let h = 9; h <= 16; h += 1) assert.equal(scoreHour(h), 4, `hour ${h}`);
  });

  it('ramps down through the shoulder hours', () => {
    assert.deepEqual(
      [7, 8, 17, 18, 19, 20].map(scoreHour),
      [2, 3, 3, 2, 1, 1],
    );
  });

  it('treats night hours as unacceptable', () => {
    for (const h of [21, 22, 23, 0, 3, 6]) assert.equal(scoreHour(h), 0, `hour ${h}`);
  });

  it('rejects out-of-range and fractional hours', () => {
    assert.throws(() => scoreHour(24), RangeError);
    assert.throws(() => scoreHour(-1), RangeError);
    assert.throws(() => scoreHour(9.5), RangeError);
  });
});

describe('bandForScore', () => {
  it('maps scores onto the three legend bands', () => {
    assert.equal(bandForScore(4), 'ideal');
    assert.equal(bandForScore(3), 'acceptable');
    assert.equal(bandForScore(1), 'acceptable');
    assert.equal(bandForScore(0), 'unacceptable');
  });
});

describe('combineScores', () => {
  it('is only as good as the worst zone', () => {
    assert.equal(combineScores([4, 3, 4]), 3);
    assert.equal(combineScores([4, 0]), 0);
  });

  it('treats no zones as unacceptable', () => {
    assert.equal(combineScores([]), 0);
  });
});
