// Keeps the Everyone row in view at the bottom of the screen while the grid
// runs past it. The grid scrolls sideways (overflow-x), so position: sticky
// would stick to the grid, not the viewport; instead one rAF-coalesced read per
// frame gives a lift in px, and CSS raises the row's header and track by it
// (--everyone-lift, app.css). The row element itself never moves, so its rect is
// its natural place. While pinned, --everyone-pin-room on <html> keeps toasts
// and focus scrolling clear of it. The maths is pinLift() in src/lib/scroll.js.

import { pinLift } from '../lib/scroll.js';

/** The --bp-md breakpoint (tokens.css); below it the toolbar is fixed at the bottom. */
const WIDE = '(min-width: 40rem)';

/** Where the visible area ends: the top of a bottom toolbar, else the viewport's bottom. */
export function visibleBottom() {
  const toolbar = window.matchMedia(WIDE).matches ? null : document.querySelector('.toolbar');
  return toolbar ? toolbar.getBoundingClientRect().top : window.innerHeight;
}

/**
 * Pin `row` (the Everyone row) to the visible bottom while the grid `root`
 * runs past it, never over `home` (the home row). Call `destroy()` before
 * dropping the grid.
 * @param {{ root: HTMLElement, row: HTMLElement, home: HTMLElement }} options
 */
export function attachPin({ root, row, home }) {
  const html = document.documentElement;
  let frame = 0;
  let checkFocus = true;
  let lift = 0;
  let room = 0;

  /** Whether focus is on a home slot or a user row's control, which the pinned row can cover. */
  function eligible(/** @type {Element | null} */ el) {
    return el !== null && el !== root && root.contains(el) && !row.contains(el);
  }

  function update() {
    frame = 0;
    const checking = checkFocus;
    checkFocus = false;
    // Reads, then writes.
    const natural = row.getBoundingClientRect();
    const homeBottom = home.getBoundingClientRect().bottom;
    const bottom = visibleBottom();
    const viewport = window.innerHeight;
    const active = checking && eligible(document.activeElement) ? document.activeElement : null;
    const activeBottom = active ? active.getBoundingClientRect().bottom : 0;
    const next = pinLift({
      rowTop: natural.top,
      rowBottom: natural.bottom,
      homeBottom,
      visibleBottom: bottom,
    });
    const pinnedTop = natural.top - next;
    if (next !== lift) {
      lift = next;
      // An empty value removes the property.
      row.style.setProperty('--everyone-lift', next > 0 ? String(next) : '');
    }
    const nextRoom = next > 0 ? viewport - pinnedTop : 0;
    if (nextRoom !== room) {
      room = nextRoom;
      html.style.setProperty('--everyone-pin-room', nextRoom > 0 ? String(nextRoom) : '');
    }
    if (active && next > 0 && activeBottom > pinnedTop) {
      window.scrollBy({ top: activeBottom - pinnedTop, behavior: 'instant' });
    }
  }

  function refresh() {
    if (frame === 0) frame = requestAnimationFrame(update);
  }

  function onFocusIn() {
    checkFocus = true;
    refresh();
  }

  const sizes = new ResizeObserver(refresh);
  sizes.observe(root);
  sizes.observe(document.body);
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) sizes.observe(toolbar);
  window.addEventListener('scroll', refresh, { passive: true });
  window.addEventListener('resize', refresh);
  root.addEventListener('focusin', onFocusIn);
  refresh();

  return {
    /** Recompute the lift in the next frame. */
    refresh,
    /** Stop pinning and remove the properties. */
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      sizes.disconnect();
      window.removeEventListener('scroll', refresh);
      window.removeEventListener('resize', refresh);
      root.removeEventListener('focusin', onFocusIn);
      row.style.setProperty('--everyone-lift', '');
      html.style.setProperty('--everyone-pin-room', '');
    },
  };
}
