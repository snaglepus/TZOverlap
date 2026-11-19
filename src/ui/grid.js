// The timeline grid: one horizontal scroll container (role="grid") with a row
// per zone plus the Everyone row last, whose header carries the day's summary. Cells are absolutely positioned in each
// row's track from the grid model (src/lib/grid.js), in home columns. Adds
// wheel, mouse-drag and arrow-key scrolling and the now line; touch and
// trackpad scrolling stay native. An IntersectionObserver extends the window
// by a day when the visible track area comes within EXTEND_COLUMNS of either end.
// A click or tap on a track, or Enter/Space on a home hour cell (the roving
// keyboard slots), selects a slot: the band and the headers' selected times.
// Each user row's header has a drag handle; src/ui/reorder.js reorders rows.
// In Edit mode (data-editing on the root) it also shows a Delete button.

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
  CLICK_SLOP_PX,
  columnsAt,
  instantAt,
  isLineVisible,
  keyStep,
  nowScrollLeft,
  wheelToHorizontal,
} from '../lib/scroll.js';
import { createSelection } from '../lib/selection.js';
import { describeSelection, slotLabel } from '../lib/selection-details.js';
import { formatTime } from '../lib/time-format.js';
import { zoneLocalParts } from '../lib/zones.js';
import { button, icon, popover } from './components.js';
import { append, h } from './dom.js';
import { attachReorder } from './reorder.js';
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
 * @typedef {import('../lib/selection.js').Selection} Selection
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

/**
 * Where the phone and wide header triggers swap (app.css): from --bp-md wide,
 * and as tall, so a phone in landscape keeps the phone header.
 */
const WIDE = '(min-width: 40rem) and (min-height: 40rem)';

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
 * @param {string} [id] stored zone id of a user row
 */
function row(header, track, key, modifier = '', id = undefined) {
  return h(
    'div',
    { class: `grid__row${modifier}`, attrs: { role: 'row', 'data-zone': key, 'data-id': id } },
    [h('div', { class: 'grid__header', attrs: { role: 'rowheader' } }, header), track],
  );
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
 *   setSelection: (selection: Selection | null) => void,
 *   setDuration: (minutes: number) => void,
 *   slot: () => Date | null,
 *   homeName: string,
 *   setFilter: (filter: Filter) => void,
 *   focusRow: (id: string) => boolean,
 *   focusDelete: (id: string) => boolean,
 *   setEditing: (on: boolean) => void,
 *   setSummary: (text: SummaryText) => void,
 *   destroy: () => void,
 * }} GridView
 * @typedef {{ long: string, short: string }} SummaryText
 * @typedef {import('../lib/row-order.js').Direction} Direction
 * @typedef {{
 *   canMove: (zone: StoredZone, direction: Direction) => boolean,
 *   change: (zone: StoredZone) => void,
 *   move: (zone: StoredZone, direction: Direction) => void,
 *   remove: (zone: StoredZone) => void,
 *   reorder: (zone: StoredZone, position: number) => void,
 * }} RowActions
 */

/**
 * Render the grid. `zones` are the stored zones behind rows 1.. of `grid`.
 * Clocks and dates show `now`; offsets show `offsetAt`. `extend(side)` returns
 * the grid with one more day on that side, or null at the cap. `homeLabel` is
 * the label of a hidden stored copy of the home zone, if any; `cities` is the
 * city data when it is already loaded; `hourCycle` is the resolved 12/24-hour
 * cycle; `filter` greys out the instants whose Everyone rating it excludes.
 * `actions` are the user rows' popover actions; each runs after the popover
 * closes. `onNowVisible` is told whenever the now line comes into or goes out of
 * view, and `onGoToNow` runs on N (by default scrollToNow). `onSelect` gets the
 * instant clicked or tapped, or a home cell's start on Enter/Space. The roving
 * slot is the home cell starting at `slot`, else the one holding `now`, else
 * the one holding `anchorStart`; its name describes a `duration`-minute
 * meeting starting there. Once the grid is in the document, call
 * scrollToNow(), scrollTo() or set scrollLeft, then watch() to start lazy
 * extension. `editing` starts the grid in Edit mode, which shows each user
 * row's Delete button. `summary` is the Everyone header's summary line, long
 * and short. Call `destroy()` before dropping the grid.
 * @param {{
 *   grid: Grid,
 *   zones: readonly StoredZone[],
 *   now: Date,
 *   offsetAt: Date,
 *   extend: (side: Side) => Grid | null,
 *   hourCycle: HourCycle,
 *   filter: Filter,
 *   actions: RowActions,
 *   homeLabel?: string,
 *   cities?: readonly City[],
 *   onNowVisible?: (visible: boolean) => void,
 *   onGoToNow?: () => void,
 *   onSelect: (instant: Date) => void,
 *   anchorStart: Date,
 *   duration: number,
 *   weekendsUnavailable: boolean,
 *   slot?: Date | null,
 *   editing?: boolean,
 *   summary: SummaryText,
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
  actions,
  homeLabel,
  cities,
  onNowVisible = () => {},
  onGoToNow,
  onSelect,
  anchorStart,
  duration: initialDuration,
  weekendsUnavailable,
  slot: preferredSlot = null,
  editing = false,
  summary,
}) {
  const homeZone = /** @type {Zone} */ (grid.rows[0]?.zone);
  // One popover for every header trigger, filled from the row that opened it:
  // the details, then a user row's actions.
  /** @type {{ trigger: () => HTMLElement, hidden: () => HTMLElement | null } | null} */
  let openRow = null;
  const details = popover({
    label: strings.timelines.details,
    onClose: () => {
      openRow = null;
    },
  });
  const detailsPart = h('div', { class: 'popover__details' });
  /** Visible trigger of each user row, by stored id. @type {Map<string, () => HTMLElement>} */
  const rowTriggers = new Map();
  /** Delete button of each user row, by stored id. @type {Map<string, HTMLElement>} */
  const rowDeletes = new Map();
  const wide = window.matchMedia(WIDE);
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
  let duration = initialDuration;
  /** @type {Selection | null} */
  let selected = null;
  /** @type {string[]} Each row's full name, home first. */
  const names = [];
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
    names.push(full);

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
    // While a slot is selected, the time shows the selected time instead,
    // after this prefix; in the DOM only while selected, like the badges.
    const selectedPrefix = h('span', {
      class: 'visually-hidden',
      text: strings.selection.headerPrefix,
    });
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
    const triggerAttrs = {
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': details.root.id,
    };
    const trigger = h('button', { class: 'grid__trigger', attrs: triggerAttrs }, [
      h('span', { class: 'grid__line' }, [
        isHome ? homeSymbol() : null,
        h('span', { class: 'grid__name' }, nameText()),
      ]),
      clockLine,
    ]);

    // From --bp-md: every detail inline; a button for user rows.
    const time = h('span', { class: 'grid__time' });
    const day = h('span', { class: 'grid__day' });
    const date = h('span');
    const offset = h('span');
    const dstMeta = h('span', { class: 'grid__dst', text: strings.dst.badge });
    // The home row's warning is its own button; a user row's sits inside its
    // wide trigger, so it is a chip named by hidden text.
    const warningText = h('span', { attrs: isHome ? {} : { 'aria-hidden': 'true' } });
    const warningMetaLong = h('span', { class: 'visually-hidden' });
    const warning = isHome
      ? h('button', { class: 'grid__warning', attrs: triggerAttrs }, [icon('alert'), warningText])
      : h('span', { class: 'grid__warning' }, [icon('alert'), warningText, warningMetaLong]);
    const meta = h('span', { class: 'grid__meta' }, [
      time,
      day,
      date,
      offset,
      zone.kind === 'fixed' ? h('span', { text: strings.timelines.noDst }) : null,
    ]);
    const selectedTime = h('span', { class: 'grid__selected-time' });
    const selectedLine = h('span', { class: 'grid__selected' }, [
      strings.selection.headerPrefix,
      selectedTime,
    ]);
    const inline = h('span', { class: 'grid__details' }, [
      h('span', { class: 'grid__line' }, [
        isHome ? homeSymbol() : null,
        h('span', { class: 'grid__name' }, nameText()),
      ]),
      meta,
    ]);

    const wideTrigger = stored
      ? h('button', { class: 'grid__trigger grid__trigger--wide', attrs: triggerAttrs }, [inline])
      : null;
    // The trigger shown at the current width, and the one hidden.
    const visible = () => (wideTrigger && wide.matches ? wideTrigger : trigger);
    const hidden = () => (!wideTrigger ? null : wide.matches ? trigger : wideTrigger);
    // A user row's drag handle; activating it opens the details like the trigger.
    const handle = stored
      ? h(
          'button',
          {
            class: 'grid__handle',
            attrs: { ...triggerAttrs, 'aria-label': strings.timelines.reorder(full) },
          },
          [icon('grip')],
        )
      : null;
    // Shown only in Edit mode (app.css); deletes the row at once.
    const deleteButton = stored
      ? button({
          label: strings.timelines.deleteZone(full),
          icon: 'remove',
          iconOnly: true,
          variant: 'ghost',
          onClick: () => actions.remove(stored),
        })
      : null;
    deleteButton?.classList.add('grid__delete');
    const isOpen = () =>
      details.isOpenFor(trigger) ||
      (wideTrigger !== null && details.isOpenFor(wideTrigger)) ||
      (handle !== null && details.isOpenFor(handle));

    /** @param {Date} at @param {Date} offsetInstant */
    function fill(at, offsetInstant) {
      const diff = dayDifferenceLabel(dayDifference(zone, homeZone, at));
      detailsPart.replaceChildren();
      append(detailsPart, [
        h('p', { class: 'popover__title', text: full }),
        h('p', { class: 'grid__time', text: clock(zone, at, cycle) }),
        selected
          ? h('p', { text: strings.selection.header(clock(zone, selected.start, cycle)) })
          : null,
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

    if (isHome) {
      warning.addEventListener('click', () => {
        if (details.isOpenFor(warning)) {
          details.close();
          return;
        }
        fillWarning();
        details.open(warning);
        openRow = { trigger: () => trigger, hidden: () => warning };
      });
    }

    /** @param {StoredZone} zone */
    function actionList(zone) {
      /**
       * @param {string} label
       * @param {() => void} run
       * @param {boolean} [disabled]
       */
      const action = (label, run, disabled = false) =>
        button({
          label,
          variant: 'ghost',
          size: 'sm',
          disabled,
          onClick: () => {
            details.close();
            run();
          },
        });
      const { change, moveUp, moveDown, delete: remove } = strings.timelines.actions;
      return h('div', { class: 'popover__actions' }, [
        action(change, () => actions.change(zone)),
        action(moveUp, () => actions.move(zone, 'up'), !actions.canMove(zone, 'up')),
        action(moveDown, () => actions.move(zone, 'down'), !actions.canMove(zone, 'down')),
        action(remove, () => actions.remove(zone)),
      ]);
    }

    /** @param {HTMLElement} from */
    function open(from) {
      fill(current, currentOffset);
      const list = stored ? actionList(stored) : null;
      details.body.replaceChildren(detailsPart);
      if (list) details.body.append(list);
      details.open(from);
      openRow = { trigger: visible, hidden };
      list?.querySelector(/** @type {'button'} */ ('button:enabled'))?.focus();
    }

    /** @param {HTMLElement} from */
    const toggle = (from) => {
      if (details.isOpenFor(from)) details.close();
      else open(from);
    };
    trigger.addEventListener('click', () => toggle(trigger));
    wideTrigger?.addEventListener('click', () => toggle(wideTrigger));
    handle?.addEventListener('click', () => toggle(handle));

    /** @param {Date} at @param {Date} offsetInstant */
    function update(at, offsetInstant) {
      const hhmm = clock(zone, at, cycle);
      const diff = dayDifferenceLabel(dayDifference(zone, homeZone, at));
      const chosen = selected ? clock(zone, selected.start, cycle) : null;
      buttonTime.textContent = chosen ?? hhmm;
      if (chosen) buttonTime.dataset.selected = 'true';
      else delete buttonTime.dataset.selected;
      place(clockLine, [selectedPrefix], Boolean(chosen), buttonTime);
      selectedTime.textContent = chosen ?? '';
      place(inline, [selectedLine], Boolean(chosen), null);
      time.textContent = hhmm;
      badge.textContent = diff?.short ?? '';
      badge.hidden = !diff || Boolean(chosen);
      badgeLong.textContent = diff?.long ?? '';
      badgeLong.hidden = Boolean(chosen);
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
          warningMetaLong.textContent = label;
          if (isHome) warning.setAttribute('aria-label', label);
          warningText.textContent = dayMonth(zone, change.at);
        }
        if (details.isOpenFor(warning)) {
          if (change) fillWarning();
          else details.close();
        }
      }
      if (isOpen()) fill(at, offsetInstant);
    }
    update(now, offsetAt);
    updates.push(update);

    const track = h('div', { class: 'grid__track' }, trackContent(gridRow, cycle, hourCells));
    tracks.push(track);

    const el = row(
      [trigger, wideTrigger ?? inline, deleteButton, handle],
      track,
      zoneKey(zone),
      '',
      stored?.id,
    );
    if (stored) {
      rowTriggers.set(stored.id, visible);
      if (deleteButton) rowDeletes.set(stored.id, deleteButton);
      // Right-click anywhere in a user row's header opens its popover.
      el.firstElementChild?.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        open(visible());
      });
    }
    return el;
  });

  const everyoneTrack = h(
    'div',
    { class: 'grid__track' },
    everyoneSegments(grid, cycle, filter, segments),
  );
  tracks.push(everyoneTrack);
  // Both variants stay in the DOM; CSS shows one per breakpoint, like the banner's.
  const summaryShort = h('span', { class: 'grid__summary-short', text: summary.short });
  const summaryLong = h('span', { class: 'grid__summary-long', text: summary.long });
  const everyone = row(
    [
      h('span', { class: 'grid__name', text: strings.timelines.everyone }),
      h('span', { class: 'grid__summary' }, [summaryShort, summaryLong]),
    ],
    everyoneTrack,
    'everyone',
    ' grid__row--everyone',
  );

  const [homeRow, ...userRows] = zoneRows;
  const line = h('div', { class: 'grid__now', attrs: { 'aria-hidden': 'true' } });
  const band = h('div', { class: 'grid__selection', attrs: { 'aria-hidden': 'true' } });
  band.hidden = true;
  const root = h(
    'div',
    {
      class: 'grid',
      attrs: { role: 'grid', 'aria-label': strings.timelines.gridLabel, tabindex: '0' },
    },
    [homeRow, ...userRows, everyone, band, line],
  );
  root.style.setProperty('--grid-hours', String(grid.hours));
  root.toggleAttribute('data-editing', editing);
  const homeTrack = /** @type {HTMLElement} */ (tracks[0]);
  const reorder = attachReorder({
    root,
    rows: userRows,
    fixed: [/** @type {HTMLElement} */ (homeRow), everyone],
    onDrop: (from, position) => {
      const zone = zones[from];
      if (zone) actions.reorder(zone, position);
    },
  });

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

  // The band: from the selection start, clipped at the window end; hidden
  // while the start is outside the window.
  function placeBand() {
    if (!selected || !inWindow(selected.start)) {
      band.hidden = true;
      return;
    }
    const left = columnsAt(shown.start, selected.start);
    band.style.setProperty('--selection-left', String(left));
    band.style.setProperty(
      '--selection-width',
      String(Math.min(selected.duration / 60, shown.hours - left)),
    );
    band.dataset.start = selected.start.toISOString();
    band.dataset.duration = String(selected.duration);
    band.hidden = false;
  }

  // Keyboard slots: the home row's hour cells, with one roving tabindex="0".
  const rowZones = grid.rows.map((gridRow) => gridRow.zone);
  /** @type {[HTMLElement, GridCell, string | undefined][]} */
  let slots = [];
  /** @type {HTMLElement | null} */
  let roving = null;

  /** The roving cell's name: its visible label, then the meeting it would select. */
  function labelRoving() {
    const entry = slots.find(([el]) => el === roving);
    if (!roving || !entry) return;
    const [, cell] = entry;
    const details = describeSelection(createSelection(cell.start, duration), rowZones, {
      weekendsUnavailable,
    });
    roving.setAttribute(
      'aria-label',
      strings.selection.slotName(
        formatTime({ hour: cell.hour, minute: 0 }, cycle, 'compact'),
        slotLabel(details, names, cycle),
      ),
    );
  }

  /** @param {HTMLElement} el */
  function setRoving(el) {
    if (roving === el) return;
    const previous = slots.find(([cellEl]) => cellEl === roving);
    if (previous) {
      previous[0].tabIndex = -1;
      labelHourCell(previous[0], previous[1], cycle, previous[2]);
    }
    roving = el;
    el.tabIndex = 0;
    labelRoving();
  }

  /**
   * Make the home cells keyboard slots and pick the roving one.
   * @param {Date | null} preferred
   */
  function initSlots(preferred) {
    slots = hourCells.filter(([el]) => homeTrack.contains(el));
    for (const [el] of slots) el.tabIndex = -1;
    roving = null;
    /** @param {Date} at */
    const holding = (at) => slots.find(([, cell]) => cell.start <= at && at < cell.end);
    const target =
      (preferred && slots.find(([, cell]) => cell.start.getTime() === preferred.getTime())) ||
      (inWindow(current) && holding(current)) ||
      holding(anchorStart) ||
      slots[0];
    if (target) setRoving(target[0]);
  }
  initSlots(preferredSlot);
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
  /**
   * A primary press on a track: the instant under it, and whether a mouse
   * moved far enough to make it a drag.
   * @type {{ id: number, x: number, instant: Date, moved: boolean } | null}
   */
  let press = null;
  root.addEventListener('pointerdown', (event) => {
    const target = /** @type {Element} */ (event.target);
    const track = target.closest('.grid__track');
    press = null;
    if (track && event.isPrimary && event.button === 0) {
      const rect = track.getBoundingClientRect();
      const column = rect.width / shown.hours;
      press = {
        id: event.pointerId,
        x: event.clientX,
        instant: instantAt(shown.start, (event.clientX - rect.left) / column),
        moved: false,
      };
    }
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
    if (
      press?.id === event.pointerId &&
      event.pointerType === 'mouse' &&
      Math.abs(event.clientX - press.x) > CLICK_SLOP_PX
    ) {
      press.moved = true;
    }
    if (drag?.id !== event.pointerId) return;
    root.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
  });
  /** @param {PointerEvent} event */
  const endDrag = (event) => {
    if (drag?.id === event.pointerId) drag = null;
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', (event) => {
    endDrag(event);
    // A touch that scrolls the grid is cancelled and never clicks.
    if (press?.id === event.pointerId) press = null;
  });
  // Pointer capture makes the root the click target, so use what the press started on.
  root.addEventListener('click', (event) => {
    const done = press;
    press = null;
    if (!done || done.moved || event.detail === 0) return;
    onSelect(done.instant);
  });
  // Pressing a track keeps focus on the grid, never in a cell, and doesn't
  // scroll. Like a native mouse focus, it shows no focus ring.
  root.addEventListener('mousedown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.grid__track')) return;
    event.preventDefault();
    root.focus({ preventScroll: true, focusVisible: false });
  });
  // A home cell focused another way becomes the roving slot.
  root.addEventListener('focusin', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target !== roving && slots.some(([el]) => el === target)) setRoving(target);
  });

  /**
   * Move focus from the slot `from` by `step` home cells, within the window.
   * @param {HTMLElement} from
   * @param {number} step
   */
  function moveSlot(from, step) {
    const index = slots.findIndex(([el]) => el === from);
    const next = slots[Math.min(Math.max(index + step, 0), slots.length - 1)];
    if (index < 0 || !next || next[0] === from) return;
    setRoving(next[0]);
    next[0].focus({ preventScroll: true });
    // Scroll only as needed; scroll-padding keeps it clear of the sticky header.
    next[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'n' || event.key === 'N') {
      if (event.shiftKey) return;
      if (onGoToNow) onGoToNow();
      else scrollToNow({ animate: true });
      event.preventDefault();
      return;
    }
    if (event.target === roving && roving) {
      if (event.key === 'Enter' || event.key === ' ') {
        const entry = slots.find(([el]) => el === roving);
        if (entry) onSelect(entry[1].start);
        event.preventDefault();
        return;
      }
      const slotStep = keyStep(event);
      if (slotStep === null) return;
      moveSlot(roving, slotStep);
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
    const keep = slots.find(([el]) => el === roving)?.[1].start ?? null;
    const hadFocus = roving !== null && document.activeElement === roving;
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
    placeBand();
    initSlots(keep);
    if (hadFocus) roving?.focus({ preventScroll: true });
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

  // Crossing --bp-md hides the open popover's anchor: close it, and keep focus
  // on the row's visible trigger.
  function onWide() {
    if (!openRow) return;
    const { trigger, hidden } = openRow;
    const focused = document.activeElement;
    const refocus = details.root.contains(focused) || focused === hidden();
    details.close();
    if (refocus) trigger().focus();
  }
  wide.addEventListener('change', onWide);

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
      labelRoving();
      fitLabels();
    },
    /** Show `selection` (null clears it): the band and the headers' selected times. */
    setSelection(selection) {
      selected = selection;
      placeBand();
      for (const update of updates) update(current, currentOffset);
    },
    /** The meeting length the roving slot's name describes. */
    setDuration(minutes) {
      duration = minutes;
      labelRoving();
    },
    /** The roving slot's start. */
    slot: () => slots.find(([el]) => el === roving)?.[1].start ?? null,
    homeName: names[0] ?? '',
    /** Redraw the masks and Everyone labels for `next`; cells and scroll stay. */
    setFilter(next) {
      filter = next;
      placeMasks();
      for (const [el, segment] of segments) labelSegment(el, segment, homeZone, cycle, filter);
    },
    /** Focus the visible header trigger of user row `id`; false when there is none. */
    focusRow(id) {
      const trigger = rowTriggers.get(id);
      if (!trigger) return false;
      trigger().focus();
      return true;
    },
    /** Focus user row `id`'s Delete button; false when there is none. */
    focusDelete(id) {
      const deleteButton = rowDeletes.get(id);
      if (!deleteButton) return false;
      deleteButton.focus();
      return true;
    },
    /** Show or hide the user rows' Delete buttons and enlarged handles. */
    setEditing(on) {
      root.toggleAttribute('data-editing', on);
    },
    /** Rewrite the Everyone header's summary line. */
    setSummary(text) {
      summaryShort.textContent = text.short;
      summaryLong.textContent = text.long;
    },
    /** Stop lazy extension, label fitting, reordering and the breakpoint listener. */
    destroy() {
      reorder.destroy();
      wide.removeEventListener('change', onWide);
      window.removeEventListener('resize', watch);
      observer?.disconnect();
      observer = null;
      resize.disconnect();
    },
  };
}
