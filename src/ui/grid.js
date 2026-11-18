// The timeline grid: one horizontal scroll container (role="grid") with a row
// per zone plus the Everyone row. Cells are absolutely positioned in each
// row's track from the grid model (src/lib/grid.js), in home columns.

import {
  dayDifference,
  dayDifferenceLabel,
  fullDate,
  offsetLine,
  rowName,
  shortDate,
} from '../lib/row-header.js';
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
 * Render the grid. `zones` are the stored zones behind rows 1.. of `grid`.
 * `homeLabel` is the label of a hidden stored copy of the home zone, if any;
 * `cities` is the city data when it is already loaded.
 * @param {{
 *   grid: Grid,
 *   zones: readonly StoredZone[],
 *   now: Date,
 *   onRemove: (zone: StoredZone) => void,
 *   homeLabel?: string,
 *   cities?: readonly City[],
 * }} options
 * @returns {{ root: HTMLElement, popover: HTMLElement, tick: (now: Date) => void }}
 */
export function timelineGrid({ grid, zones, now, onRemove, homeLabel, cities }) {
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
  const root = h(
    'div',
    {
      class: 'grid',
      attrs: { role: 'grid', 'aria-label': strings.timelines.gridLabel, tabindex: '0' },
    },
    [homeRow, everyone, ...userRows],
  );
  root.style.setProperty('--grid-hours', String(grid.hours));

  return {
    root,
    popover: details.root,
    tick(date) {
      current = date;
      for (const update of updates) update(date);
    },
  };
}
