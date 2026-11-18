// The timeline grid: one horizontal scroll container (role="grid") with a row
// per zone plus the Everyone row. Cells are absolutely positioned in each
// row's track from the grid model (src/lib/grid.js), in home columns.

import { zoneCity } from '../lib/timezones.js';
import { zoneLocalParts, zoneOffsetLabel } from '../lib/zones.js';
import { button } from './components.js';
import { h } from './dom.js';
import { strings } from './strings.js';

/**
 * @typedef {import('../lib/grid.js').Grid} Grid
 * @typedef {import('../lib/grid.js').Segment} Segment
 * @typedef {import('../lib/grid.js').GridCell} GridCell
 * @typedef {import('../lib/zones.js').Zone} Zone
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
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

/**
 * Render the grid. `zones` are the stored zones behind rows 1.. of `grid`.
 * @param {{
 *   grid: Grid,
 *   zones: readonly StoredZone[],
 *   now: Date,
 *   onRemove: (zone: StoredZone) => void,
 * }} options
 * @returns {{ root: HTMLElement, tick: (now: Date) => void }}
 */
export function timelineGrid({ grid, zones, now, onRemove }) {
  /** @type {{ zone: Zone, time: HTMLElement, offset: HTMLElement }[]} */
  const clocks = [];

  const zoneRows = grid.rows.map(({ zone, cells }, i) => {
    const stored = i === 0 ? null : zones[i - 1];
    const time = h('span', { class: 'grid__time', text: clock(zone, now) });
    const offset = h('span', { text: zoneOffsetLabel(zone, now) });
    clocks.push({ zone, time, offset });
    const name =
      stored?.label ?? strings.timelines.you(zone.kind === 'iana' ? zoneCity(zone.tz) : '');
    return row(
      [
        h('div', { class: 'grid__label' }, [
          h('span', { class: 'grid__name', text: name }),
          h('span', { class: 'grid__meta' }, [
            time,
            offset,
            zone.kind === 'fixed' ? h('span', { text: strings.timelines.noDst }) : null,
          ]),
        ]),
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

  const home = /** @type {Zone} */ (grid.rows[0]?.zone);
  const everyone = row(
    [h('span', { class: 'grid__name', text: strings.timelines.everyone })],
    grid.everyone.map((segment) =>
      placed(segment, {
        'aria-label': strings.timelines.segment(
          clock(home, segment.start),
          clock(home, segment.end),
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
    tick(date) {
      for (const { zone, time, offset } of clocks) {
        time.textContent = clock(zone, date);
        offset.textContent = zoneOffsetLabel(zone, date);
      }
    },
  };
}
