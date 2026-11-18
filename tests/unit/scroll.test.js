import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLICK_SLOP_PX,
  columnsAt,
  instantAt,
  isLineVisible,
  keyStep,
  nowScrollLeft,
  wheelToHorizontal,
} from '../../src/lib/scroll.js';

const sizes = { linePx: 20, pagePx: 600 };
/** @param {Partial<{ deltaX: number, deltaY: number, deltaMode: number, ctrlKey: boolean }>} e */
const wheel = (e) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, ...e });

describe('columnsAt', () => {
  const start = new Date('2026-11-16T13:00:00Z');

  it('counts whole and fractional hours from the window start', () => {
    assert.equal(columnsAt(start, start), 0);
    assert.equal(columnsAt(start, new Date('2026-11-17T13:00:00Z')), 24);
    assert.equal(columnsAt(start, new Date('2026-11-16T14:30:00Z')), 1.5);
    assert.equal(columnsAt(start, new Date('2026-11-16T13:01:00Z')), 1 / 60);
  });

  it('is negative before the window', () => {
    assert.equal(columnsAt(start, new Date('2026-11-16T12:00:00Z')), -1);
  });
});

describe('instantAt', () => {
  const start = new Date('2026-11-16T13:00:00Z');

  it('is the inverse of columnsAt', () => {
    assert.equal(instantAt(start, 0).toISOString(), start.toISOString());
    assert.equal(instantAt(start, 24).toISOString(), '2026-11-17T13:00:00.000Z');
    assert.equal(instantAt(start, 1.5).toISOString(), '2026-11-16T14:30:00.000Z');
    assert.equal(instantAt(start, -1).toISOString(), '2026-11-16T12:00:00.000Z');
    const instant = new Date('2026-11-17T22:07:00Z');
    assert.equal(instantAt(start, columnsAt(start, instant)).getTime(), instant.getTime());
  });

  it('gives fractions of an hour for a pointer part-way across a column', () => {
    assert.equal(instantAt(start, 10.25).toISOString(), '2026-11-16T23:15:00.000Z');
  });
});

describe('CLICK_SLOP_PX', () => {
  it('is 4 px', () => {
    assert.equal(CLICK_SLOP_PX, 4);
  });
});

describe('nowScrollLeft', () => {
  it('puts the line one third of the way across the visible width', () => {
    assert.equal(nowScrollLeft({ linePx: 1000, visibleWidth: 300, maxScroll: 5000 }), 900);
  });

  it('clamps at the start', () => {
    assert.equal(nowScrollLeft({ linePx: 50, visibleWidth: 300, maxScroll: 5000 }), 0);
  });

  it('clamps at the end', () => {
    assert.equal(nowScrollLeft({ linePx: 5200, visibleWidth: 300, maxScroll: 5000 }), 5000);
  });

  it('is 0 when nothing scrolls', () => {
    assert.equal(nowScrollLeft({ linePx: 500, visibleWidth: 300, maxScroll: 0 }), 0);
  });
});

describe('isLineVisible', () => {
  const at = { linePx: 1000, visibleWidth: 300 };

  it('is true inside the visible track, boundaries included', () => {
    assert.equal(isLineVisible({ ...at, scrollLeft: 900 }), true);
    assert.equal(isLineVisible({ ...at, scrollLeft: 1000 }), true);
    assert.equal(isLineVisible({ ...at, scrollLeft: 700 }), true);
  });

  it('is false left or right of the visible track', () => {
    assert.equal(isLineVisible({ ...at, scrollLeft: 1001 }), false);
    assert.equal(isLineVisible({ ...at, scrollLeft: 699 }), false);
  });
});

describe('wheelToHorizontal', () => {
  it('passes pixel deltas through', () => {
    assert.equal(wheelToHorizontal(wheel({ deltaY: 120 }), sizes), 120);
    assert.equal(wheelToHorizontal(wheel({ deltaY: -40, deltaX: 10 }), sizes), -40);
  });

  it('converts line deltas', () => {
    assert.equal(wheelToHorizontal(wheel({ deltaY: 3, deltaMode: 1 }), sizes), 60);
  });

  it('converts page deltas', () => {
    assert.equal(wheelToHorizontal(wheel({ deltaY: -1, deltaMode: 2 }), sizes), -600);
  });

  it('leaves horizontal gestures to the browser', () => {
    assert.equal(wheelToHorizontal(wheel({ deltaX: 50, deltaY: 10 }), sizes), null);
    assert.equal(wheelToHorizontal(wheel({ deltaX: -30, deltaY: 30 }), sizes), null);
    assert.equal(wheelToHorizontal(wheel({}), sizes), null);
  });

  it('leaves pinch-zoom (ctrlKey) alone', () => {
    assert.equal(wheelToHorizontal(wheel({ deltaY: 100, ctrlKey: true }), sizes), null);
  });
});

describe('keyStep', () => {
  it('steps one hour with the arrows', () => {
    assert.equal(keyStep({ key: 'ArrowLeft', shiftKey: false }), -1);
    assert.equal(keyStep({ key: 'ArrowRight', shiftKey: false }), 1);
  });

  it('steps six hours with Shift', () => {
    assert.equal(keyStep({ key: 'ArrowLeft', shiftKey: true }), -6);
    assert.equal(keyStep({ key: 'ArrowRight', shiftKey: true }), 6);
  });

  it('ignores other keys', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'n', 'Home', ' ', 'Enter']) {
      assert.equal(keyStep({ key, shiftKey: false }), null, key);
      assert.equal(keyStep({ key, shiftKey: true }), null, key);
    }
  });
});
