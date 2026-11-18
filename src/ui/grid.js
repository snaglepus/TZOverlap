// The timeline grid: one horizontal scroll container (role="grid") with a row
// per zone plus the Everyone row. Cells are absolutely positioned in each
// row's track from the grid model (src/lib/grid.js), in home columns. Adds
// wheel, mouse-drag and arrow-key scrolling and the now line; touch and
// trackpad scrolling stay native. An IntersectionObserver extends the window
// by a day when the visible track area comes within EXTEND_COLUMNS of either end.

import { EXTEND_COLUMNS } from '../lib/grid.js';
import {
  dayDifference,
  dayDifferenceLabel,
  fullDate,
  offsetLine,
  rowName,
  shortDate,
} from '../lib/row-header.js';
import {
  columnsAt,
  isLineVisible,
  keyStep,
  nowScrollLeft,
  wheelToHorizontal,
} from '../lib/scroll.js';
import { zoneLocalParts } from '../lib/zones.js';
import { button, icon, popover } from './components.js';
import { append, h } from './dom.js';
import { strings } from './strings.js';

/**
 * @typedef {import('../lib/grid.js').Grid} Grid
 * @typedef {import('../lib/grid.js').Segment} Segment
 * @typedef {import('../lib/grid.js').GridCell} GridCell
 * @typedef {import('../lib/zones.js').Zone} Zone
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
 * @typedef {import('../data/cities.js').City} City
 * @typedef {keyof import('../lib/grid.js').Extent} Side
 */

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * "14:30" in `zone` at `date`.
 * @param {Zone} zone
 * @param {Date} date
 */
function clock(zone, date) {
  const { hour, minute } = zoneLocalParts(zone, date);
  return `${pad(hour)}:${pad(minute)}`;
}

/** Smooth scrolling unless the user asks for reduced motion. */
function smoothBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

/** @param {Zone} zone */
function zoneKey(zone) {
  return zone.kind === 'iana' ? zone.tz : `fixed:${zone.minutes}`;
}

/**
 * A positioned cell or segment: rating attributes plus left/width in columns.
 * @param {Segment} span
 * @param {Record<string, string | undefined>} attrs
 * @param {import('./dom.js').Child[]} [children]
 */
function placed(span, attrs, children = []) {
  const el = h(
    'div',
    {
      class: 'grid__cell heat',
      attrs: {
        role: 'gridcell',
        'data-rating': span.rating,
        'data-heat': span.step === undefined ? undefined : String(span.step),
        'data-start': span.start.toISOString(),
        ...attrs,
      },
    },
    children,
  );
  el.style.setProperty('--cell-left', String(span.left));
  el.style.setProperty('--cell-width', String(span.width));
  return el;
}

/** @param {GridCell} cell */
function hourCell(cell) {
  const hour = pad(cell.hour);
  return placed(
    cell,
    {
      'data-hour': String(cell.hour),
      'aria-label': strings.timelines.cell(hour, strings.ratings[cell.rating], cell.repeat),
      title: cell.repeat ? strings.timelines.repeatTitle : undefined,
    },
    [
      hour,
      cell.repeat
        ? h('sup', {
            class: 'grid__repeat',
            text: strings.timelines.repeatMarker,
            attrs: { 'aria-hidden': 'true' },
          })
        : null,
    ],
  );
}

/** @param {Grid} grid */
function everyoneSegments(grid) {
  const homeZone = /** @type {Zone} */ (grid.rows[0]?.zone);
  return grid.everyone.map((segment) =>
    placed(segment, {
      'aria-label': strings.timelines.segment(
        clock(homeZone, segment.start),
        clock(homeZone, segment.end),
        strings.ratings[segment.rating],
      ),
    }),
  );
}

/**
 * @param {import('./dom.js').Child[]} header
 * @param {HTMLElement} track
 * @param {string} key data-zone value
 * @param {string} [modifier]
 */
function row(header, track, key, modifier = '') {
  return h('div', { class: `grid__row${modifier}`, attrs: { role: 'row', 'data-zone': key } }, [
    h('div', { class: 'grid__header', attrs: { role: 'rowheader' } }, header),
    track,
  ]);
}

/** The home row's location symbol, named for screen readers. */
function homeSymbol() {
  return h(
    'span',
    { class: 'grid__home', attrs: { role: 'img', 'aria-label': strings.timelines.location } },
    [icon('location')],
  );
}

/**
 * @typedef {{
 *   root: HTMLElement,
 *   popover: HTMLElement,
 *   tick: (now: Date, offsetAt: Date) => void,
 *   scrollToNow: (options?: { animate?: boolean }) => void,
 *   scrollTo: (instant: Date) => void,
 *   hasNow: () => boolean,
 *   watch: () => void,
 *   disconnect: () => void,
 *   refresh: () => void,
 * }} GridView
 */

/**
 * Render the grid. `zones` are the stored zones behind rows 1.. of `grid`.
 * Clocks and dates show `now`; offsets show `offsetAt`. `extend(side)` returns
 * the grid with one more day on that side, or null at the cap. `homeLabel` is
 * the label of a hidden stored copy of the home zone, if any; `cities` is the
 * city data when it is already loaded. `onNowVisible` is told whenever the now
 * line comes into or goes out of view, and `onGoToNow` runs on N (by default
 * scrollToNow). Once the grid is in the document, call scrollToNow(), scrollTo()
 * or set scrollLeft, then watch() to start lazy extension.
 * @param {{
 *   grid: Grid,
 *   zones: readonly StoredZone[],
 *   now: Date,
 *   offsetAt: Date,
 *   extend: (side: Side) => Grid | null,
 *   onRemove: (zone: StoredZone) => void,
 *   homeLabel?: string,
 *   cities?: readonly City[],
 *   onNowVisible?: (visible: boolean) => void,
 *   onGoToNow?: () => void,
 * }} options
 * @returns {GridView}
 */
export function timelineGrid({
  grid,
  zones,
  now,
  offsetAt,
  extend,
  onRemove,
  homeLabel,
  cities,
  onNowVisible = () => {},
  onGoToNow,
}) {
  const homeZone = /** @type {Zone} */ (grid.rows[0]?.zone);
  // One details popover for every phone header, filled from the one that opened it.
  const details = popover({ label: strings.timelines.details });
  /** @type {((date: Date, offsetAt: Date) => void)[]} */
  const updates = [];
  let current = now;
  let currentOffset = offsetAt;
  let shown = grid;
  /** @type {HTMLElement[]} */
  const tracks = [];

  const zoneRows = grid.rows.map(({ zone, cells }, i) => {
    const stored = i === 0 ? null : zones[i - 1];
    const isHome = !stored;
    const { full, display } = rowName({ zone, label: stored?.label ?? homeLabel, cities });

    // Shows `display`; screen readers get `full`.
    const nameText = () =>
      display === full
        ? [full]
        : [
            h('span', { text: display, attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'visually-hidden', text: full }),
          ];

    // Phone: a button with the name and the time, opening the details popover.
    // Its name comes from its content, so the badge's long wording is hidden text.
    const buttonTime = h('span', { class: 'grid__time' });
    const badge = h('span', { class: 'grid__badge', attrs: { 'aria-hidden': 'true' } });
    const badgeLong = h('span', { class: 'visually-hidden' });
    const trigger = h(
      'button',
      {
        class: 'grid__trigger',
        attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': details.root.id },
      },
      [
        h('span', { class: 'grid__line' }, [
          isHome ? homeSymbol() : null,
          h('span', { class: 'grid__name' }, nameText()),
        ]),
        h('span', { class: 'grid__line grid__clock' }, [buttonTime, badge, badgeLong]),
      ],
    );

    // From --bp-md: every detail inline.
    const time = h('span', { class: 'grid__time' });
    const day = h('span', { class: 'grid__day' });
    const date = h('span');
    const offset = h('span');
    const inline = h('div', { class: 'grid__details' }, [
      h('span', { class: 'grid__line' }, [
        isHome ? homeSymbol() : null,
        h('span', { class: 'grid__name' }, nameText()),
      ]),
      h('span', { class: 'grid__meta' }, [
        time,
        day,
        date,
        offset,
        zone.kind === 'fixed' ? h('span', { text: strings.timelines.noDst }) : null,
      ]),
    ]);

    /** @param {Date} at @param {Date} offsetInstant */
    function fill(at, offsetInstant) {
      const diff = dayDifferenceLabel(dayDifference(zone, homeZone, at));
      details.body.replaceChildren();
      append(details.body, [
        h('p', { class: 'popover__title', text: full }),
        h('p', { class: 'grid__time', text: clock(zone, at) }),
        diff ? h('p', { text: diff.long }) : null,
        h('p', { text: fullDate(zone, at) }),
        h('p', { text: offsetLine(zone, offsetInstant) }),
        zone.kind === 'fixed' ? h('p', { text: strings.timelines.noDst }) : null,
      ]);
    }

    trigger.addEventListener('click', () => {
      if (details.isOpenFor(trigger)) {
        details.close();
        return;
      }
      fill(current, currentOffset);
      details.open(trigger);
    });

    /** @param {Date} at @param {Date} offsetInstant */
    function update(at, offsetInstant) {
      const hhmm = clock(zone, at);
      const diff = dayDifferenceLabel(dayDifference(zone, homeZone, at));
      buttonTime.textContent = hhmm;
      time.textContent = hhmm;
      badge.textContent = diff?.short ?? '';
      badge.hidden = !diff;
      badgeLong.textContent = diff?.long ?? '';
      day.textContent = diff?.long ?? '';
      day.hidden = !diff;
      date.textContent = shortDate(zone, at);
      offset.textContent = offsetLine(zone, offsetInstant);
      if (details.isOpenFor(trigger)) fill(at, offsetInstant);
    }
    update(now, offsetAt);
    updates.push(update);

    const track = h('div', { class: 'grid__track' }, cells.map(hourCell));
    tracks.push(track);

    return row(
      [
        trigger,
        inline,
        stored
          ? button({
              label: strings.timelines.removeLabel,
              variant: 'ghost',
              size: 'sm',
              ariaLabel: strings.timelines.remove(stored.label),
              onClick: () => onRemove(stored),
            })
          : null,
      ],
      track,
      zoneKey(zone),
    );
  });

  const everyoneTrack = h('div', { class: 'grid__track' }, everyoneSegments(grid));
  const everyone = row(
    [h('span', { class: 'grid__name', text: strings.timelines.everyone })],
    everyoneTrack,
    'everyone',
    ' grid__row--everyone',
  );

  const [homeRow, ...userRows] = zoneRows;
  const line = h('div', { class: 'grid__now', attrs: { 'aria-hidden': 'true' } });
  const root = h(
    'div',
    {
      class: 'grid',
      attrs: { role: 'grid', 'aria-label': strings.timelines.gridLabel, tabindex: '0' },
    },
    [homeRow, everyone, ...userRows, line],
  );
  root.style.setProperty('--grid-hours', String(grid.hours));

  /** @param {Date} date */
  const inWindow = (date) => shown.start <= date && date < shown.end;
  /** @param {Date} date */
  const placeLine = (date) => {
    current = date;
    root.style.setProperty('--now-left', String(columnsAt(shown.start, date)));
    // Outside the window (another date shown) the line would widen the scroll area.
    line.hidden = !inWindow(date);
  };
  placeLine(now);

  /** Track geometry in px; null before layout. */
  function measure() {
    const header = root.querySelector('.grid__header');
    const track = root.querySelector('.grid__track');
    if (!header || !track) return null;
    const trackWidth = track.getBoundingClientRect().width;
    if (trackWidth === 0) return null;
    const column = trackWidth / shown.hours;
    return {
      column,
      linePx: columnsAt(shown.start, current) * column,
      visibleWidth: root.clientWidth - header.getBoundingClientRect().width,
      maxScroll: root.scrollWidth - root.clientWidth,
    };
  }

  /** @type {boolean | undefined} */
  let lineVisible;
  function refresh() {
    const m = measure();
    if (!m) return;
    const visible = inWindow(current) && isLineVisible({ ...m, scrollLeft: root.scrollLeft });
    if (visible === lineVisible) return;
    lineVisible = visible;
    onNowVisible(visible);
  }

  /** @param {{ animate?: boolean }} [options] animate: smooth unless reduced motion */
  function scrollToNow({ animate = false } = {}) {
    const m = measure();
    if (!m) return;
    root.scrollTo({ left: nowScrollLeft(m), behavior: animate ? smoothBehavior() : 'instant' });
    refresh();
  }

  /** Scroll position held while header text is being selected with the mouse. */
  let held = -1;
  let frame = 0;
  root.addEventListener('scroll', () => {
    // Selecting header text past the grid's edge would autoscroll the timeline.
    if (held >= 0) root.scrollLeft = held;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  });

  root.addEventListener(
    'wheel',
    (event) => {
      const m = measure();
      if (!m) return;
      const dx = wheelToHorizontal(event, { linePx: m.column / 3, pagePx: m.visibleWidth });
      if (dx === null) return;
      // At the edge, let the page scroll instead.
      if ((dx < 0 && root.scrollLeft <= 0) || (dx > 0 && root.scrollLeft >= m.maxScroll - 1)) {
        return;
      }
      root.scrollLeft += dx;
      event.preventDefault();
    },
    { passive: false },
  );

  /** @type {{ id: number, x: number, scrollLeft: number } | null} */
  let drag = null;
  root.addEventListener('pointerdown', (event) => {
    const target = /** @type {Element} */ (event.target);
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (target.closest('.grid__header')) {
      held = root.scrollLeft;
      // The press can end outside the grid, so listen on the window.
      const release = () => {
        held = -1;
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      return;
    }
    if (!target.closest('.grid__track')) return;
    root.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, scrollLeft: root.scrollLeft };
  });
  root.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    root.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
  });
  /** @param {PointerEvent} event */
  const endDrag = (event) => {
    if (drag?.id === event.pointerId) drag = null;
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'n' || event.key === 'N') {
      if (event.shiftKey) return;
      if (onGoToNow) onGoToNow();
      else scrollToNow({ animate: true });
      event.preventDefault();
      return;
    }
    const step = keyStep(event);
    const m = step === null ? null : measure();
    if (step === null || !m) return;
    root.scrollBy({ left: step * m.column, behavior: smoothBehavior() });
    event.preventDefault();
  });

  // Lazy extension: an edge marker EXTEND_COLUMNS wide at each end of the home
  // track, observed against the grid minus the sticky header.
  const homeTrack = /** @type {HTMLElement} */ (tracks[0]);
  const homeHeader = /** @type {HTMLElement} */ (homeRow?.firstElementChild);
  const edgeEl = () => h('div', { class: 'grid__edge', attrs: { 'aria-hidden': 'true' } });
  /** @type {Record<Side, HTMLElement>} */
  const edges = { before: edgeEl(), after: edgeEl() };
  /** @type {Set<Side>} */
  const capped = new Set();
  /** @type {IntersectionObserver | null} */
  let observer = null;

  function placeEdges() {
    edges.before.style.setProperty('--cell-left', '0');
    edges.after.style.setProperty('--cell-left', String(shown.hours - EXTEND_COLUMNS));
    for (const edge of Object.values(edges)) {
      edge.style.setProperty('--cell-width', String(EXTEND_COLUMNS));
    }
    homeTrack.append(edges.before, edges.after);
  }
  placeEdges();

  /** @param {Grid} next */
  function setGrid(next) {
    shown = next;
    next.rows.forEach(({ cells }, i) => tracks[i]?.replaceChildren(...cells.map(hourCell)));
    everyoneTrack.replaceChildren(...everyoneSegments(next));
    root.style.setProperty('--grid-hours', String(next.hours));
    placeEdges();
    placeLine(current);
  }

  /** @param {IntersectionObserverEntry[]} entries */
  function onIntersect(entries) {
    let changed = false;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const side = entry.target === edges.before ? 'before' : 'after';
      const next = extend(side);
      changed = true;
      if (!next) {
        capped.add(side);
        continue;
      }
      const width = homeTrack.getBoundingClientRect().width;
      setGrid(next);
      // Keep what's on screen in place: earlier days push the content right.
      if (side === 'before') root.scrollLeft += homeTrack.getBoundingClientRect().width - width;
    }
    // A fresh observer reports the current state, so a still-near edge extends again.
    if (changed) {
      refresh();
      watch();
    }
  }

  function watch() {
    observer?.disconnect();
    const header = homeHeader.getBoundingClientRect().width;
    observer = new IntersectionObserver(onIntersect, {
      root,
      rootMargin: `0px 0px 0px ${-header}px`,
    });
    for (const side of /** @type {Side[]} */ (['before', 'after'])) {
      if (!capped.has(side)) observer.observe(edges[side]);
    }
  }

  return {
    root,
    popover: details.root,
    /** @param {Date} date clock time @param {Date} offsetInstant */
    tick(date, offsetInstant) {
      currentOffset = offsetInstant;
      for (const update of updates) update(date, offsetInstant);
      placeLine(date);
      refresh();
    },
    /**
     * Scroll so `instant` sits a third of the way across the visible track area.
     * @param {Date} instant
     */
    scrollTo(instant) {
      const m = measure();
      if (!m) return;
      root.scrollLeft = nowScrollLeft({ ...m, linePx: columnsAt(shown.start, instant) * m.column });
      refresh();
    },
    /** Start (or restart) lazy extension. */
    watch() {
      window.addEventListener('resize', watch);
      watch();
    },
    /** Stop lazy extension. */
    disconnect() {
      window.removeEventListener('resize', watch);
      observer?.disconnect();
      observer = null;
    },
    scrollToNow,
    /** Whether the current instant is inside the window. */
    hasNow: () => inWindow(current),
    refresh,
  };
}
