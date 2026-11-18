// The timeline grid: one horizontal scroll container (role="grid") with a row
// per zone plus the Everyone row. Cells are absolutely positioned in each
// row's track from the grid model (src/lib/grid.js), in home columns. Adds
// wheel, mouse-drag and arrow-key scrolling and the now line; touch and
// trackpad scrolling stay native. An IntersectionObserver extends the window
// by a day when the visible track area comes within EXTEND_COLUMNS of either end.

import { changeSentence, describeChange, dstStatus } from '../lib/dst.js';
import { greyedSpans, qualifies } from '../lib/filter.js';
import { EXTEND_COLUMNS } from '../lib/grid.js';
import {
  dayDifference,
  dayDifferenceLabel,
  dayLabel,
  dayMonth,
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
import { formatTime } from '../lib/time-format.js';
import { zoneLocalParts } from '../lib/zones.js';
import { button, icon, popover } from './components.js';
import { append, h } from './dom.js';
import { strings } from './strings.js';

/**
 * @typedef {import('../lib/grid.js').Grid} Grid
 * @typedef {import('../lib/grid.js').Segment} Segment
 * @typedef {import('../lib/grid.js').GridCell} GridCell
 * @typedef {import('../lib/grid.js').GridRow} GridRow
 * @typedef {import('../lib/grid.js').Midnight} Midnight
 * @typedef {import('../lib/zones.js').Zone} Zone
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
 * @typedef {import('../data/cities.js').City} City
 * @typedef {keyof import('../lib/grid.js').Extent} Side
 * @typedef {import('../lib/time-format.js').HourCycle} HourCycle
 * @typedef {import('../lib/filter.js').Filter} Filter
 * @typedef {import('../lib/filter.js').Span} Span
 */

const HOUR_MS = 3600000;

/**
 * Put `nodes` at the end of `parent` (before `before` when it is there) while
 * `show`, else take them out; nodes already in place are left alone.
 * @param {HTMLElement} parent
 * @param {HTMLElement[]} nodes
 * @param {boolean} show
 * @param {HTMLElement | null} before
 */
function place(parent, nodes, show, before) {
  for (const node of nodes) {
    if (!show) node.remove();
    else if (node.parentNode !== parent) {
      parent.insertBefore(node, before?.parentNode === parent ? before : null);
    }
  }
}

/**
 * The full time ("2:30 pm" or "14:30") in `zone` at `date`.
 * @param {Zone} zone
 * @param {Date} date
 * @param {HourCycle} cycle
 */
function clock(zone, date, cycle) {
  return formatTime(zoneLocalParts(zone, date), cycle, 'full');
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

/**
 * An hour cell: the compact label in .grid__label (hidden on odd hours when
 * labels don't fit), the full time in its accessible name.
 * @param {GridCell} cell
 * @param {HourCycle} cycle
 * @param {string} [day] day label when the cell starts a local date
 */
function hourCell(cell, cycle, day) {
  const el = placed(
    cell,
    {
      'data-hour': String(cell.hour),
      'data-odd': cell.hour % 2 === 1 ? 'true' : undefined,
      'data-weekend': cell.weekend ? 'true' : undefined,
      title: cell.repeat ? strings.timelines.repeatTitle : undefined,
    },
    [
      h('span', { class: 'grid__label' }),
      cell.repeat
        ? h('sup', {
            class: 'grid__repeat',
            text: strings.timelines.repeatMarker,
            attrs: { 'aria-hidden': 'true' },
          })
        : null,
    ],
  );
  labelHourCell(el, cell, cycle, day);
  return el;
}

/**
 * @param {HTMLElement} el
 * @param {GridCell} cell
 * @param {HourCycle} cycle
 * @param {string} [day]
 */
function labelHourCell(el, cell, cycle, day) {
  const time = { hour: cell.hour, minute: 0 };
  const label = /** @type {HTMLElement} */ (el.firstElementChild);
  label.textContent = formatTime(time, cycle, 'compact');
  el.setAttribute(
    'aria-label',
    strings.timelines.cell(
      formatTime(time, cycle, 'full'),
      strings.ratings[cell.rating],
      cell.repeat,
      cell.weekend,
      day,
    ),
  );
}

/**
 * @param {HTMLElement} el
 * @param {Segment} segment
 * @param {Zone} homeZone
 * @param {HourCycle} cycle
 * @param {Filter} filter a segment the filter greys out says so
 */
function labelSegment(el, segment, homeZone, cycle, filter) {
  el.setAttribute(
    'aria-label',
    strings.timelines.segment(
      clock(homeZone, segment.start, cycle),
      clock(homeZone, segment.end, cycle),
      strings.ratings[segment.rating],
      !qualifies(segment.rating, filter),
    ),
  );
}

/**
 * The Everyone row's segments, each also pushed onto `segments` for relabelling.
 * @param {Grid} grid
 * @param {HourCycle} cycle
 * @param {Filter} filter
 * @param {[HTMLElement, Segment][]} segments
 */
function everyoneSegments(grid, cycle, filter, segments) {
  const homeZone = /** @type {Zone} */ (grid.rows[0]?.zone);
  return grid.everyone.map((segment) => {
    const el = placed(segment, {});
    labelSegment(el, segment, homeZone, cycle, filter);
    segments.push([el, segment]);
    return el;
  });
}

/**
 * A stretch the filter greys out, drawn over the cells of one track. Every
 * track gets the same masks, so all rows grey the same instants.
 * @param {Span} span
 */
function mask(span) {
  const el = h('div', {
    class: 'grid__mask',
    attrs: {
      'aria-hidden': 'true',
      'data-start': span.start.toISOString(),
      'data-end': span.end.toISOString(),
    },
  });
  el.style.setProperty('--cell-left', String(span.left));
  el.style.setProperty('--cell-width', String(span.width));
  return el;
}

/**
 * A local midnight: a line with a day label chip. Hidden from assistive tech;
 * the day's first cell carries the label in its name instead.
 * @param {Midnight} midnight
 * @param {string} label
 */
function divider(midnight, label) {
  const el = h(
    'div',
    {
      class: 'grid__divider',
      attrs: { 'data-start': midnight.at.toISOString(), 'aria-hidden': 'true' },
    },
    [h('span', { class: 'grid__day-label', text: label })],
  );
  el.style.setProperty('--cell-left', String(midnight.left));
  return el;
}

/**
 * A row's hour cells and its midnight dividers. The day label of each midnight
 * goes on the divider and on the day's first cell. Each cell is also pushed
 * onto `hourCells` for relabelling.
 * @param {GridRow} gridRow
 * @param {HourCycle} cycle
 * @param {[HTMLElement, GridCell, string | undefined][]} hourCells
 */
function trackContent({ zone, cells, midnights }, cycle, hourCells) {
  const labels = new Map(midnights.map(({ at }) => [at.getTime(), dayLabel(zone, at)]));
  return [
    ...cells.map((cell) => {
      const day = labels.get(cell.start.getTime());
      const el = hourCell(cell, cycle, day);
      hourCells.push([el, cell, day]);
      return el;
    }),
    ...midnights.map((midnight) =>
      divider(midnight, /** @type {string} */ (labels.get(midnight.at.getTime()))),
    ),
  ];
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
 *   refresh: () => void,
 *   setHourCycle: (cycle: HourCycle) => void,
 *   setFilter: (filter: Filter) => void,
 *   destroy: () => void,
 * }} GridView
 */

/**
 * Render the grid. `zones` are the stored zones behind rows 1.. of `grid`.
 * Clocks and dates show `now`; offsets show `offsetAt`. `extend(side)` returns
 * the grid with one more day on that side, or null at the cap. `homeLabel` is
 * the label of a hidden stored copy of the home zone, if any; `cities` is the
 * city data when it is already loaded; `hourCycle` is the resolved 12/24-hour
 * cycle; `filter` greys out the instants whose Everyone rating it excludes.
 * `onNowVisible` is told whenever the now line comes into or goes out of
 * view, and `onGoToNow` runs on N (by default scrollToNow). Once the grid is in
 * the document, call scrollToNow(), scrollTo() or set scrollLeft, then watch()
 * to start lazy extension. Call `destroy()` before dropping the grid.
 * @param {{
 *   grid: Grid,
 *   zones: readonly StoredZone[],
 *   now: Date,
 *   offsetAt: Date,
 *   extend: (side: Side) => Grid | null,
 *   hourCycle: HourCycle,
 *   filter: Filter,
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
  hourCycle,
  filter: initialFilter,
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
  /** @type {[HTMLElement, GridCell, string | undefined][]} */
  const hourCells = [];
  /** @type {[HTMLElement, Segment][]} */
  const segments = [];
  let current = now;
  let currentOffset = offsetAt;
  let shown = grid;
  /** @type {HTMLElement[]} */
  const tracks = [];
  let cycle = hourCycle;
  let filter = initialFilter;
  // Every row's names, for the DST sentences' gaps to home.
  const named = grid.rows.map(({ zone }, i) => {
    const stored = i === 0 ? null : zones[i - 1];
    const { full, display } = rowName({ zone, label: stored?.label ?? homeLabel, cities });
    return { zone, name: full, display };
  });
  const homeNamed = /** @type {import('../lib/dst.js').NamedZone} */ (named[0]);

  const zoneRows = grid.rows.map((gridRow, i) => {
    const { zone } = gridRow;
    const stored = i === 0 ? null : zones[i - 1];
    const isHome = !stored;
    const self = /** @type {import('../lib/dst.js').NamedZone} */ (named[i]);
    const { name: full, display } = self;
    const dst = zone.kind !== 'fixed';

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
    // DST and clock-change chips, aria-hidden with their long wording as hidden text.
    const dstChip = h('span', {
      class: 'grid__dst',
      text: strings.dst.badge,
      attrs: { 'aria-hidden': 'true' },
    });
    const dstLong = h('span', { class: 'visually-hidden', text: strings.dst.badgeLong });
    const warningChip = h('span', { class: 'grid__warning', attrs: { 'aria-hidden': 'true' } }, [
      icon('alert'),
    ]);
    const warningLong = h('span', { class: 'visually-hidden' });
    const clockLine = h('span', { class: 'grid__line grid__clock' }, [
      buttonTime,
      badge,
      badgeLong,
    ]);
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
        clockLine,
      ],
    );

    // From --bp-md: every detail inline.
    const time = h('span', { class: 'grid__time' });
    const day = h('span', { class: 'grid__day' });
    const date = h('span');
    const offset = h('span');
    const dstMeta = h('span', { class: 'grid__dst', text: strings.dst.badge });
    const warningText = h('span');
    const warning = h(
      'button',
      {
        class: 'grid__warning',
        attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': details.root.id },
      },
      [icon('alert'), warningText],
    );
    const meta = h('span', { class: 'grid__meta' }, [
      time,
      day,
      date,
      offset,
      zone.kind === 'fixed' ? h('span', { text: strings.timelines.noDst }) : null,
    ]);
    const inline = h('div', { class: 'grid__details' }, [
      h('span', { class: 'grid__line' }, [
        isHome ? homeSymbol() : null,
        h('span', { class: 'grid__name' }, nameText()),
      ]),
      meta,
    ]);

    /** @param {Date} at @param {Date} offsetInstant */
    function fill(at, offsetInstant) {
      const diff = dayDifferenceLabel(dayDifference(zone, homeZone, at));
      details.body.replaceChildren();
      append(details.body, [
        h('p', { class: 'popover__title', text: full }),
        h('p', { class: 'grid__time', text: clock(zone, at, cycle) }),
        diff ? h('p', { text: diff.long }) : null,
        h('p', { text: fullDate(zone, at) }),
        h('p', { text: offsetLine(zone, offsetInstant) }),
        zone.kind === 'fixed' ? h('p', { text: strings.timelines.noDst }) : null,
        status?.observing ? h('p', { text: strings.dst.badgeLong }) : null,
        sentence ? h('p', { text: sentence }) : null,
      ]);
    }

    // The status at the header instant, recomputed once per UTC hour or when its change arrives.
    /** @type {{ observing: boolean, change: import('../lib/time-engine.js').Transition | null } | null} */
    let status = null;
    let statusHour = NaN;
    let sentence = '';
    /** @param {Date} offsetInstant */
    function syncStatus(offsetInstant) {
      const t = offsetInstant.getTime();
      const hour = Math.floor(t / HOUR_MS);
      const due = status?.change && t >= status.change.at.getTime();
      if (status && hour === statusHour && !due) return;
      status = dstStatus(zone, offsetInstant);
      statusHour = hour;
      const others = named.filter((other) => other !== self && other !== homeNamed);
      sentence = status.change
        ? changeSentence(
            describeChange({ zone: self, transition: status.change, home: homeNamed, others }),
          ).long
        : '';
    }

    function fillWarning() {
      details.body.replaceChildren();
      append(details.body, [
        h('p', { class: 'popover__title', text: full }),
        h('p', { text: sentence }),
      ]);
    }

    warning.addEventListener('click', () => {
      if (details.isOpenFor(warning)) {
        details.close();
        return;
      }
      fillWarning();
      details.open(warning);
    });

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
      const hhmm = clock(zone, at, cycle);
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
      if (dst) {
        syncStatus(offsetInstant);
        const change = status?.change;
        const observing = Boolean(status?.observing);
        // Badges are in the DOM only while shown, DST before the warning.
        place(clockLine, [dstChip, dstLong], observing, warningChip);
        place(meta, [dstMeta], observing, warning);
        place(clockLine, [warningChip, warningLong], Boolean(change), null);
        place(meta, [warning], Boolean(change), null);
        if (change) {
          const label = strings.dst.warning(shortDate(zone, change.at));
          warningLong.textContent = label;
          warning.setAttribute('aria-label', label);
          warningText.textContent = dayMonth(zone, change.at);
        }
        if (details.isOpenFor(warning)) {
          if (change) fillWarning();
          else details.close();
        }
      }
      if (details.isOpenFor(trigger)) fill(at, offsetInstant);
    }
    update(now, offsetAt);
    updates.push(update);

    const track = h('div', { class: 'grid__track' }, trackContent(gridRow, cycle, hourCells));
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

  const everyoneTrack = h(
    'div',
    { class: 'grid__track' },
    everyoneSegments(grid, cycle, filter, segments),
  );
  tracks.push(everyoneTrack);
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
  const homeTrack = /** @type {HTMLElement} */ (tracks[0]);

  // Filter masks: after each track's cells, before its midnight dividers.
  function placeMasks() {
    const spans = greyedSpans(shown.everyone, filter);
    for (const track of tracks) {
      for (const el of track.querySelectorAll(':scope > .grid__mask')) el.remove();
      if (spans.length === 0) continue;
      const before = track.querySelector(':scope > .grid__divider, :scope > .grid__edge');
      for (const span of spans) track.insertBefore(mask(span), before);
    }
  }
  placeMasks();

  // Labels that don't fit one column (with --space-1 each side, the label's
  // padding) hide on odd hours; never shrunk. Viewport and root font-size
  // changes both resize the grid.
  function fitLabels() {
    const column = homeTrack.getBoundingClientRect().width / shown.hours;
    let widest = 0;
    for (const [el] of hourCells) {
      let width = 0;
      for (const child of el.children) width += child.getBoundingClientRect().width;
      widest = Math.max(widest, width);
    }
    if (widest > column) root.dataset.labels = 'alternate';
    else delete root.dataset.labels;
  }
  const resize = new ResizeObserver(fitLabels);
  resize.observe(root);
  fitLabels();

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
    hourCells.length = 0;
    segments.length = 0;
    next.rows.forEach((gridRow, i) =>
      tracks[i]?.replaceChildren(...trackContent(gridRow, cycle, hourCells)),
    );
    everyoneTrack.replaceChildren(...everyoneSegments(next, cycle, filter, segments));
    root.style.setProperty('--grid-hours', String(next.hours));
    placeEdges();
    placeMasks();
    placeLine(current);
    fitLabels();
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
    scrollToNow,
    /** Whether the current instant is inside the window. */
    hasNow: () => inWindow(current),
    refresh,
    setHourCycle(next) {
      cycle = next;
      for (const [el, cell, day] of hourCells) labelHourCell(el, cell, cycle, day);
      for (const [el, segment] of segments) labelSegment(el, segment, homeZone, cycle, filter);
      for (const update of updates) update(current, currentOffset);
      fitLabels();
    },
    /** Redraw the masks and Everyone labels for `next`; cells and scroll stay. */
    setFilter(next) {
      filter = next;
      placeMasks();
      for (const [el, segment] of segments) labelSegment(el, segment, homeZone, cycle, filter);
    },
    /** Stop lazy extension and label fitting. */
    destroy() {
      window.removeEventListener('resize', watch);
      observer?.disconnect();
      observer = null;
      resize.disconnect();
    },
  };
}
