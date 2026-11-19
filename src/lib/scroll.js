// Timeline scroll maths: where the now line sits, where to scroll to bring it
// back, how wheel and arrow-key input map to horizontal scrolling, the page
// auto-scroll while a row is dragged and the pinned Everyone row's lift. Pure: the caller measures the DOM
// and passes pixel sizes in.

const HOUR = 3600000;

/** WheelEvent.deltaMode values. */
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** Hours moved by an arrow key, and with Shift. */
const STEP = 1;
const SHIFT_STEP = 6;

/** A mouse press that moves further than this many CSS px sideways is a drag, not a click. */
export const CLICK_SLOP_PX = 4;

/** A touch held this long on a row header picks the row up. */
export const LONG_PRESS_MS = 400;

/** A touch that moves further than this many CSS px first is not a long press. */
export const LONG_PRESS_SLOP_PX = 8;

/** The navigator.vibrate() duration when a touch picks a row up. */
export const HAPTIC_MS = 10;

/** While dragging a row, a pointer this close to the top or bottom edge scrolls the page. */
export const EDGE_SCROLL_ZONE_PX = 48;

/** The most the page scrolls in one animation frame while dragging a row. */
export const EDGE_SCROLL_MAX_STEP_PX = 16;

/**
 * Hours from `windowStart` to `instant`, fractional.
 * @param {Date} windowStart
 * @param {Date} instant
 */
export function columnsAt(windowStart, instant) {
  return (instant.getTime() - windowStart.getTime()) / HOUR;
}

/**
 * The instant `columns` hours after `windowStart` (the inverse of columnsAt).
 * @param {Date} windowStart
 * @param {number} columns
 */
export function instantAt(windowStart, columns) {
  return new Date(windowStart.getTime() + columns * HOUR);
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

/**
 * Vertical page-scroll step in px for one frame while a row is dragged with the
 * pointer at `y`: negative inside EDGE_SCROLL_ZONE_PX of `top`, positive inside
 * it of `bottom`, else 0. Grows with depth into the zone, up to
 * EDGE_SCROLL_MAX_STEP_PX (also past the edge).
 * @param {number} y
 * @param {number} top
 * @param {number} bottom
 */
export function edgeScrollStep(y, top, bottom) {
  /** @param {number} depth px into the zone */
  const step = (depth) =>
    Math.min(
      EDGE_SCROLL_MAX_STEP_PX,
      Math.ceil((depth / EDGE_SCROLL_ZONE_PX) * EDGE_SCROLL_MAX_STEP_PX),
    );
  if (y < top + EDGE_SCROLL_ZONE_PX) return -step(top + EDGE_SCROLL_ZONE_PX - y);
  if (y > bottom - EDGE_SCROLL_ZONE_PX) return step(y - (bottom - EDGE_SCROLL_ZONE_PX));
  return 0;
}

/**
 * How many px the Everyone row is raised so it stays in view: by as much as it
 * runs past `visibleBottom`. All arguments are viewport px; 0 when the row's
 * natural place is in view, and 0 when the row doesn't fit between the home row
 * and `visibleBottom`, so it never rises over the home row.
 * @param {{ rowTop: number, rowBottom: number, homeBottom: number, visibleBottom: number }} rects
 */
export function pinLift({ rowTop, rowBottom, homeBottom, visibleBottom }) {
  const lift = rowBottom - visibleBottom;
  return lift > 0 && lift <= rowTop - homeBottom ? lift : 0;
}
