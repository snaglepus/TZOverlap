// Drag to reorder the user rows of the timeline grid, with Pointer Events and
// pointer capture (never HTML5 drag and drop). A mouse or pen picks a row up by
// dragging its handle; a touch by dragging the handle or by a long press
// anywhere in the row's header. The other rows slide aside with transforms and
// the rows stay in DOM order until the drop; `onDrop` then gets the new
// position. Esc, pointercancel, a release outside the grid, a resize or a row
// height change cancels. Geometry is measured once at pickup, relative to the
// grid's top, so page scroll and layout shifts above the grid move it with the
// rows; only the Everyone row's top is read live, as it moves while pinned
// (src/ui/pin.js). A release over the home or Everyone row lands first or last
// among the user rows. The maths is in src/lib/row-order.js and src/lib/scroll.js.

import { pointerDropIndex, rowShift } from '../lib/row-order.js';
import {
  CLICK_SLOP_PX,
  HAPTIC_MS,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  edgeScrollStep,
} from '../lib/scroll.js';
import { visibleBottom } from './pin.js';

/** Height differences below this many px are rounding, not a layout change. */
const SIZE_EPSILON_PX = 0.5;

/**
 * @typedef {{
 *   id: number,
 *   touch: boolean,
 *   handle: boolean,
 *   from: number,
 *   x: number,
 *   y: number,
 *   startX: number,
 *   startY: number,
 *   timer: number,
 * }} Press
 * @typedef {{ top: number, bottom: number }} Rect
 * @typedef {{
 *   rects: Rect[],
 *   homeBottom: number,
 *   pickupY: number,
 *   centre: number,
 *   height: number,
 *   scrollLeft: number,
 *   position: number,
 *   frame: number,
 * }} Drag
 */

/**
 * Let a row's pointer gestures reorder `rows` (the user rows, in display
 * order). `fixed` are the home and Everyone rows, in that order, which stay
 * first and last; a height change in any of these or `rows` cancels a drag. `onDrop(from, position)` runs after
 * a drop that moves row `from` to 0-based `position`. Call `destroy()` before
 * dropping the grid; it cancels a drag without dropping.
 * @param {{
 *   root: HTMLElement,
 *   rows: HTMLElement[],
 *   fixed: HTMLElement[],
 *   onDrop: (from: number, position: number) => void,
 * }} options
 */
export function attachReorder({ root, rows, fixed, onDrop }) {
  const headers = rows.map((row) => /** @type {HTMLElement} */ (row.firstElementChild));
  // The Everyone row's header: its rendered place, raised while the row is pinned.
  const everyoneHeader = /** @type {HTMLElement} */ (fixed[1]?.firstElementChild);
  /** @type {Press | null} */
  let press = null;
  /** @type {Drag | null} */
  let drag = null;
  let dropTimer = 0;
  /** Heights of `fixed` and `rows` when the press started. @type {Map<Element, number>} */
  const heights = new Map();
  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const size = entry.borderBoxSize[0]?.blockSize;
      const was = heights.get(entry.target);
      if (size !== undefined && was !== undefined && Math.abs(size - was) > SIZE_EPSILON_PX) {
        cancel();
        return;
      }
    }
  });

  const rootTop = () => root.getBoundingClientRect().top;

  /** @param {HTMLElement} row @param {number | null} px */
  function setY(row, px) {
    // An empty value removes the property.
    row.style.setProperty('--reorder-y', px === null ? '' : String(px));
  }

  /** Follow the pointer: the lifted row, the drop position and the rows pushed aside. */
  function layout() {
    if (!drag || !press) return;
    const { from } = press;
    const pointerY = press.y - rootTop();
    const dy = pointerY - drag.pickupY;
    const position = pointerDropIndex({
      rects: drag.rects,
      from,
      centre: drag.centre + dy,
      pointerY,
      homeBottom: drag.homeBottom,
      // Read live: the pinned Everyone row moves with page scroll (src/ui/pin.js).
      everyoneTop: everyoneHeader.getBoundingClientRect().top - rootTop(),
    });
    const { height } = drag;
    drag.position = position;
    rows.forEach((row, i) => {
      if (i === from) {
        setY(row, dy);
        return;
      }
      const shift = rowShift(from, position, i);
      row.classList.toggle('grid__row--shifted', shift !== 0);
      setY(row, shift === 0 ? null : shift * height);
    });
  }

  function tick() {
    if (!drag || !press) return;
    const step = edgeScrollStep(press.y, 0, visibleBottom());
    if (step !== 0) window.scrollBy({ top: step, behavior: 'instant' });
    layout();
    drag.frame = requestAnimationFrame(tick);
  }

  function pickup() {
    if (!press || drag) return;
    clearTimeout(press.timer);
    const lifted = /** @type {HTMLElement} */ (rows[press.from]);
    const header = /** @type {HTMLElement} */ (headers[press.from]);
    try {
      header.setPointerCapture(press.id);
    } catch {
      // The pointer is already gone: its pointerup or pointercancel ends the press.
    }
    const top = rootTop();
    const rects = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top - top, bottom: rect.bottom - top };
    });
    const own = /** @type {Rect} */ (rects[press.from]);
    const homeRow = /** @type {HTMLElement} */ (fixed[0]);
    drag = {
      rects,
      homeBottom: homeRow.getBoundingClientRect().bottom - top,
      pickupY: press.y - top,
      centre: (own.top + own.bottom) / 2,
      height: own.bottom - own.top,
      scrollLeft: root.scrollLeft,
      position: press.from,
      frame: 0,
    };
    if (press.touch && typeof navigator.vibrate === 'function') navigator.vibrate(HAPTIC_MS);
    root.dataset.reordering = 'true';
    lifted.classList.add('grid__row--lifted');
    lifted.style.setProperty('--lift-origin', String(root.scrollLeft + root.clientWidth / 2));
    window.addEventListener('keydown', onKeydown, true);
    layout();
    drag.frame = requestAnimationFrame(tick);
  }

  /** Put every row back and stop listening; true when a drag was active. */
  function finish() {
    const wasDragging = drag !== null;
    if (press) clearTimeout(press.timer);
    if (drag) cancelAnimationFrame(drag.frame);
    press = null;
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('resize', cancel);
    window.removeEventListener('keydown', onKeydown, true);
    sizes.disconnect();
    heights.clear();
    return wasDragging;
  }

  function restore() {
    delete root.dataset.reordering;
    for (const row of rows) {
      row.classList.remove('grid__row--lifted', 'grid__row--shifted');
      setY(row, null);
      row.style.setProperty('--lift-origin', '');
    }
  }

  /** End a press or drag with nothing moved. */
  function cancel() {
    if (finish()) swallowClick();
    restore();
  }

  /** @param {PointerEvent} event */
  function onDown(event) {
    if (press || !event.isPrimary || event.button !== 0) return;
    const target = /** @type {Element} */ (event.target);
    const header = target.closest('.grid__header');
    const from = headers.findIndex((el) => el === header);
    if (from < 0) return;
    const touch = event.pointerType === 'touch';
    const handle = target.closest('.grid__handle') !== null;
    // A mouse or pen only drags the handle; a touch also long-presses the header.
    if (!touch && !handle) return;
    press = {
      id: event.pointerId,
      touch,
      handle,
      from,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      timer: touch ? window.setTimeout(pickup, LONG_PRESS_MS) : 0,
    };
    for (const row of [...fixed, ...rows]) {
      heights.set(row, row.getBoundingClientRect().height);
      sizes.observe(row, { box: 'border-box' });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('resize', cancel);
  }

  /** @param {PointerEvent} event */
  function onMove(event) {
    if (event.pointerId !== press?.id) return;
    press.x = event.clientX;
    press.y = event.clientY;
    if (drag) {
      layout();
      return;
    }
    const moved = Math.hypot(press.x - press.startX, press.y - press.startY);
    if (press.handle && moved > CLICK_SLOP_PX) pickup();
    else if (!press.handle && moved > LONG_PRESS_SLOP_PX) cancel();
  }

  /** @param {PointerEvent} event */
  function onUp(event) {
    if (event.pointerId !== press?.id) return;
    if (!drag) {
      // A click or a tap: the handle or trigger opens the popover as usual.
      finish();
      return;
    }
    press.x = event.clientX;
    press.y = event.clientY;
    const rect = root.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) {
      cancel();
      return;
    }
    layout();
    const { from } = press;
    const { position } = drag;
    finish();
    swallowClick();
    // After this gesture's click, with the rows still drawn where they were
    // dropped until the rebuild replaces them.
    dropTimer = window.setTimeout(() => {
      dropTimer = 0;
      if (position !== from) onDrop(from, position);
      restore();
    }, 0);
  }

  /** @param {PointerEvent} event */
  function onCancel(event) {
    if (event.pointerId === press?.id) cancel();
  }

  /**
   * Esc cancels the drag, and nothing else sees it (such as clearing the selection).
   * @param {KeyboardEvent} event
   */
  function onKeydown(event) {
    if (event.key !== 'Escape' || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  /** No popover from a touch that started a drag, nor during one. @param {Event} event */
  function onContextMenu(event) {
    if (!drag && !press?.touch && !menuBlocked) return;
    event.preventDefault();
    event.stopPropagation();
  }

  /** A long-press drag on the header must not pan the grid. @param {TouchEvent} event */
  function onTouchMove(event) {
    if (drag) event.preventDefault();
  }

  /** Hold the timeline still from pickup to drop or cancel. */
  function onScroll() {
    if (drag) root.scrollLeft = drag.scrollLeft;
  }

  // The touch that picked a row up may still send a contextmenu after it ends.
  let menuBlocked = false;
  function onAnyDown() {
    menuBlocked = false;
  }

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('contextmenu', onContextMenu, true);
  root.addEventListener('scroll', onScroll);
  window.addEventListener('pointerdown', onAnyDown, true);
  for (const header of headers) {
    header.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  /** Swallow the click that follows a drop or cancel; the next press disarms it. */
  function swallowClick() {
    menuBlocked = true;
    /** @param {Event} event */
    const swallow = (event) => {
      event.preventDefault();
      event.stopPropagation();
      disarm();
    };
    const disarm = () => {
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('pointerdown', disarm, true);
    };
    window.addEventListener('click', swallow, true);
    window.addEventListener('pointerdown', disarm, true);
  }

  return {
    /** Cancel any drag or pending drop without writing, and stop listening. */
    destroy() {
      clearTimeout(dropTimer);
      dropTimer = 0;
      finish();
      restore();
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('contextmenu', onContextMenu, true);
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointerdown', onAnyDown, true);
      for (const header of headers) header.removeEventListener('touchmove', onTouchMove);
    },
  };
}
