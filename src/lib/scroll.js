// Timeline scroll maths: where the now line sits, where to scroll to bring it
// back, and how wheel and arrow-key input map to horizontal scrolling. Pure: the
// caller measures the DOM and passes pixel sizes in.

const HOUR = 3600000;

/** WheelEvent.deltaMode values. */
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** Hours moved by an arrow key, and with Shift. */
const STEP = 1;
const SHIFT_STEP = 6;

/**
 * Hours from `windowStart` to `instant`, fractional.
 * @param {Date} windowStart
 * @param {Date} instant
 */
export function columnsAt(windowStart, instant) {
  return (instant.getTime() - windowStart.getTime()) / HOUR;
}

/**
 * scrollLeft that puts the line one third of the way across the visible track.
 * @param {{ linePx: number, visibleWidth: number, maxScroll: number }} sizes
 */
export function nowScrollLeft({ linePx, visibleWidth, maxScroll }) {
  return Math.min(Math.max(linePx - visibleWidth / 3, 0), Math.max(maxScroll, 0));
}

/**
 * Whether the line is inside the visible part of the track.
 * @param {{ linePx: number, scrollLeft: number, visibleWidth: number }} sizes
 */
export function isLineVisible({ linePx, scrollLeft, visibleWidth }) {
  return scrollLeft <= linePx && linePx <= scrollLeft + visibleWidth;
}

/**
 * Horizontal pixel delta for a mostly vertical wheel; null when the gesture is
 * already horizontal or is a pinch-zoom (ctrlKey).
 * @param {{ deltaX: number, deltaY: number, deltaMode: number, ctrlKey: boolean }} event
 * @param {{ linePx: number, pagePx: number }} sizes
 * @returns {number | null}
 */
export function wheelToHorizontal({ deltaX, deltaY, deltaMode, ctrlKey }, { linePx, pagePx }) {
  if (ctrlKey || Math.abs(deltaY) <= Math.abs(deltaX)) return null;
  if (deltaMode === DOM_DELTA_LINE) return deltaY * linePx;
  if (deltaMode === DOM_DELTA_PAGE) return deltaY * pagePx;
  return deltaY;
}

/**
 * Hours to scroll for an arrow key: ±1, or ±6 with Shift; null for other keys.
 * @param {{ key: string, shiftKey: boolean }} event
 * @returns {number | null}
 */
export function keyStep({ key, shiftKey }) {
  const step = shiftKey ? SHIFT_STEP : STEP;
  if (key === 'ArrowLeft') return -step;
  if (key === 'ArrowRight') return step;
  return null;
}
