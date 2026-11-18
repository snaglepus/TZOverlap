// The timeline grid: one horizontal scroll container (role="grid") with a row
// per zone plus the Everyone row. Cells are absolutely positioned in each
// row's track from the grid model (src/lib/grid.js), in home columns. Adds
// wheel, mouse-drag and arrow-key scrolling and the now line; touch and
// trackpad scrolling stay native.

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
 */

const HOUR = 3600000;

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

/**
 * @param {import('./dom.js').Child[]} header
 * @param {HTMLElement[]} cells
 * @param {string} key data-zone value
 * @param {string} [modifier]
 */
function row(header, cells, key, modifier = '') {
  return h('div', { class: `grid__row${modifier}`, attrs: { role: 'row', 'data-zone': key } }, [
    h('div', { class: 'grid__header', attrs: { role: 'rowheader' } }, header),
    h('div', { class: 'grid__track' }, cells),
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
 *   tick: (now: Date) => void,
 *   scrollToNow: (options?: { animate?: boolean }) => void,
 *   leftInstant: () => Date | null,
 *   showInstant: (instant: Date) => void,
 *   refresh: () => void,
 * }} GridView
 */

/**
 * Render the grid. `zones` are the stored zones behind rows 1.. of `grid`.
 * `homeLabel` is the label of a hidden stored copy of the home zone, if any;
 * `cities` is the city data when it is already loaded. `onNowVisible` is told
 * whenever the now line comes into or goes out of view.
 * @param {{
 *   grid: Grid,
 *   zones: readonly StoredZone[],
 *   now: Date,
 *   onRemove: (zone: StoredZone) => void,
 *   homeLabel?: string,
 *   cities?: readonly City[],
 *   onNowVisible?: (visible: boolean) => void,
 * }} options
 * @returns {GridView}
 */
export function timelineGrid({
  grid,
  zones,
  now,
  onRemove,
  homeLabel,
  cities,
  onNowVisible = () => {},
}) {
  const homeZone = /** @type {Zone} */ (grid.rows[0]?.zone);
  // One details popover for every phone header, filled from the one that opened it.
  const details = popover({ label: strings.timelines.details });
  /** @type {((date: Date) => void)[]} */
  const updates = [];
  let current = now;

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

    /** @param {Date} at */
    function fill(at) {
      const diff = dayDifferenceLabel(dayDifference(zone, homeZone, at));
      details.body.replaceChildren();
      append(details.body, [
        h('p', { class: 'popover__title', text: full }),
        h('p', { class: 'grid__time', text: clock(zone, at) }),
        diff ? h('p', { text: diff.long }) : null,
        h('p', { text: fullDate(zone, at) }),
        h('p', { text: offsetLine(zone, at) }),
        zone.kind === 'fixed' ? h('p', { text: strings.timelines.noDst }) : null,
      ]);
    }

    trigger.addEventListener('click', () => {
      if (details.isOpenFor(trigger)) {
        details.close();
        return;
      }
      fill(current);
      details.open(trigger);
    });

    /** @param {Date} at */
    function update(at) {
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
      offset.textContent = offsetLine(zone, at);
      if (details.isOpenFor(trigger)) fill(at);
    }
    update(now);
    updates.push(update);

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
      cells.map(hourCell),
      zoneKey(zone),
    );
  });

  const everyone = row(
    [h('span', { class: 'grid__name', text: strings.timelines.everyone })],
    grid.everyone.map((segment) =>
      placed(segment, {
        'aria-label': strings.timelines.segment(
          clock(homeZone, segment.start),
          clock(homeZone, segment.end),
          strings.ratings[segment.rating],
        ),
      }),
    ),
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
  const placeLine = (date) => {
    current = date;
    root.style.setProperty('--now-left', String(columnsAt(grid.start, date)));
  };
  placeLine(now);

  /** Track geometry in px; null before layout. */
  function measure() {
    const header = root.querySelector('.grid__header');
    const track = root.querySelector('.grid__track');
    if (!header || !track) return null;
    const trackWidth = track.getBoundingClientRect().width;
    if (trackWidth === 0) return null;
    const column = trackWidth / grid.hours;
    return {
      column,
      linePx: columnsAt(grid.start, current) * column,
      visibleWidth: root.clientWidth - header.getBoundingClientRect().width,
      maxScroll: root.scrollWidth - root.clientWidth,
    };
  }

  /** @type {boolean | undefined} */
  let lineVisible;
  function refresh() {
    const m = measure();
    if (!m) return;
    const visible = isLineVisible({ ...m, scrollLeft: root.scrollLeft });
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
      scrollToNow({ animate: true });
      event.preventDefault();
      return;
    }
    const step = keyStep(event);
    const m = step === null ? null : measure();
    if (step === null || !m) return;
    root.scrollBy({ left: step * m.column, behavior: smoothBehavior() });
    event.preventDefault();
  });

  return {
    root,
    popover: details.root,
    tick(date) {
      for (const update of updates) update(date);
      placeLine(date);
      refresh();
    },
    scrollToNow,
    leftInstant() {
      const m = measure();
      if (!m) return null;
      return new Date(grid.start.getTime() + (root.scrollLeft / m.column) * HOUR);
    },
    showInstant(instant) {
      const m = measure();
      if (!m) return;
      root.scrollLeft = columnsAt(grid.start, instant) * m.column;
      refresh();
    },
    refresh,
  };
}
