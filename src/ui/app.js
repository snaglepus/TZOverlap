// The main page: app shell, add-zone card, timelines card. Built only from the
// shared components in ./components.js and the tokens in src/styles/.

import { MAX_EXTRA_ZONES } from '../lib/store.js';
import { buildTimeline, startOfLocalDay } from '../lib/timeline.js';
import { formatOffset, zoneCity } from '../lib/timezones.js';
import { appShell, button, card, emptyState, errorState, field } from './components.js';
import { h } from './dom.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {ReturnType<typeof import('./theme.js').createTheme>} ThemeController
 * @typedef {import('../lib/hours.js').Band} Band
 */

/** @type {Record<Band, string>} */
const BAND_LABEL = {
  ideal: 'Ideal',
  acceptable: 'Acceptable',
  unacceptable: 'Unacceptable',
};

/** @type {Record<Band, string>} visible text in the "All zones" row */
const OVERLAP_TEXT = { ideal: 'best', acceptable: 'ok', unacceptable: 'no' };

/** @type {Record<'empty' | 'invalid' | 'duplicate' | 'limit', (input: string) => string>} */
const ADD_ERRORS = {
  empty: () => 'Enter a time zone, for example Asia/Tokyo.',
  invalid: (input) =>
    `“${input.trim()}” isn’t a time zone this browser recognises. Use a name like America/New_York.`,
  duplicate: () => 'That time zone is already on the board.',
  limit: () => `You can compare up to ${MAX_EXTRA_ZONES + 1} zones. Remove one to add another.`,
};

/**
 * @param {ThemeController} theme
 */
function themeToggle(theme) {
  const btn = button({
    label: 'Dark theme',
    variant: 'ghost',
    pressed: theme.get() === 'dark',
    onClick: () => theme.toggle(),
  });
  theme.subscribe((t) => btn.setAttribute('aria-pressed', String(t === 'dark')));
  return btn;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   store: Store,
 *   theme: ThemeController,
 *   now?: () => Date,
 *   suggestions?: readonly string[],
 * }} deps
 */
export function mountApp(root, { store, theme, now = () => new Date(), suggestions = [] }) {
  const announcer = h('p', {
    class: 'visually-hidden',
    attrs: { 'aria-live': 'polite', 'data-testid': 'announcer' },
  });
  const shell = appShell({
    title: 'TZ Overlap',
    tagline: 'Find the hours that work in every time zone.',
    actions: [themeToggle(theme)],
    footer: [
      h('p', { text: 'Runs entirely in your browser. Nothing you enter leaves this device.' }),
      announcer,
    ],
  });

  // --- Add-zone card ---------------------------------------------------------
  const zoneField = field({
    label: 'Time zone',
    name: 'zone',
    placeholder: 'e.g. Asia/Tokyo',
    suggestions,
  });
  const form = h('form', { class: 'add-zone', attrs: { novalidate: true } }, [
    zoneField.root,
    h('div', { class: 'add-zone__submit' }, [
      button({ label: 'Add zone', variant: 'primary', type: 'submit' }),
    ]),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = zoneField.input.value;
    const result = store.addZone(value);
    if (!result.ok) {
      zoneField.setError(ADD_ERRORS[result.error](value));
      zoneField.input.focus();
      return;
    }
    const added = store.getState().zones.at(-1) ?? value;
    zoneField.setError(null);
    zoneField.input.value = '';
    announcer.textContent = `Added ${zoneCity(added)}.`;
  });
  const addCard = card({ title: 'Add a time zone', children: [form] });

  // --- Timelines card --------------------------------------------------------
  const timelinesCard = card({ title: 'Timelines', actions: [legend()] });

  function render() {
    const { zones } = store.getState();
    const remaining = MAX_EXTRA_ZONES - zones.length;
    zoneField.setHelp(
      remaining > 0
        ? `Use an IANA name. You can add ${remaining} more.`
        : 'All eight slots are in use.',
    );

    const current = now();
    const all = store.allZones();
    const timeline = buildTimeline({
      zones: all,
      start: startOfLocalDay(store.getState().localZone, current),
      hours: 24,
    });
    const body = [timelineTable(timeline, current, (zone) => remove(zone))];
    if (zones.length === 0) {
      body.push(
        emptyState({
          title: 'Only your time zone so far',
          body: `Add up to ${MAX_EXTRA_ZONES} more to see which hours work for everyone.`,
          action: button({
            label: 'Add a time zone',
            variant: 'secondary',
            onClick: () => zoneField.input.focus(),
          }),
        }),
      );
    }
    timelinesCard.body.replaceChildren(...body);
  }

  /** @param {string} zone */
  function remove(zone) {
    store.removeZone(zone);
    announcer.textContent = `Removed ${zoneCity(zone)}.`;
    zoneField.input.focus();
  }

  store.subscribe(render);
  render();
  shell.main.append(addCard.root, timelinesCard.root);
  root.replaceChildren(shell.root);
}

function legend() {
  /** @type {[string, Band][]} */
  const items = [
    ['heat-4', 'ideal'],
    ['heat-2', 'acceptable'],
    ['heat-0', 'unacceptable'],
  ];
  return h(
    'ul',
    { class: 'legend', attrs: { 'aria-label': 'Legend' } },
    items.map(([cls, band]) =>
      h('li', { class: 'legend__item' }, [
        h('span', { class: `legend__swatch ${cls}`, attrs: { 'aria-hidden': 'true' } }),
        BAND_LABEL[band],
      ]),
    ),
  );
}

/**
 * @param {import('../lib/timeline.js').Timeline} timeline
 * @param {Date} current
 * @param {(zone: string) => void} onRemove
 */
function timelineTable(timeline, current, onRemove) {
  const captionId = 'timeline-caption';
  const reference = timeline.rows[0];
  const nowIndex = reference
    ? reference.slots.findIndex(
        (s) => current >= s.instant && current.getTime() < s.instant.getTime() + 3_600_000,
      )
    : -1;

  const head = h('thead', { class: 'visually-hidden' }, [
    h('tr', {}, [
      h('th', { text: 'Zone', attrs: { scope: 'col' } }),
      ...(reference?.slots ?? []).map((slot) =>
        h('th', { text: `Your ${slot.label}`, attrs: { scope: 'col' } }),
      ),
    ]),
  ]);

  const rows = timeline.rows.map((row, rowIndex) =>
    h('tr', { attrs: { 'data-zone': row.timeZone } }, [
      h('th', { class: 'timeline__zone', attrs: { scope: 'row' } }, [
        h('div', { class: 'timeline__zone-inner' }, [
          h('div', {}, [
            h('span', {
              class: 'timeline__city',
              text: rowIndex === 0 ? `${zoneCity(row.timeZone)} (you)` : zoneCity(row.timeZone),
            }),
            h('span', {
              class: 'timeline__meta',
              text: `${formatOffset(row.offsetMinutes)}`,
            }),
          ]),
          rowIndex === 0
            ? null
            : button({
                label: '×',
                variant: 'ghost',
                size: 'sm',
                ariaLabel: `Remove ${zoneCity(row.timeZone)}`,
                onClick: () => onRemove(row.timeZone),
              }),
        ]),
      ]),
      ...row.slots.map((slot, i) =>
        h(
          'td',
          {
            class: `slot heat-${slot.score}${i === nowIndex ? ' slot--now' : ''}`,
            attrs: { 'data-band': slot.band, 'aria-current': i === nowIndex ? 'time' : undefined },
          },
          [
            slot.label.slice(0, 2),
            h('span', { class: 'visually-hidden', text: ` ${slot.label}, ${slot.band}` }),
            slot.dayShift
              ? h('span', {
                  class: 'slot__day',
                  text: slot.dayShift > 0 ? `+${slot.dayShift}d` : `${slot.dayShift}d`,
                })
              : null,
          ],
        ),
      ),
    ]),
  );

  if (timeline.rows.length > 1) {
    rows.push(
      h('tr', { class: 'timeline__row--overlap', attrs: { 'data-zone': 'overlap' } }, [
        h('th', { class: 'timeline__zone', attrs: { scope: 'row' } }, [
          h('span', { class: 'timeline__city', text: 'All zones' }),
          h('span', { class: 'timeline__meta', text: 'overlap' }),
        ]),
        ...timeline.overlap.map((o, i) =>
          h(
            'td',
            {
              class: `slot heat-${o.score}${i === nowIndex ? ' slot--now' : ''}`,
              attrs: { 'data-band': o.band },
            },
            [
              OVERLAP_TEXT[o.band],
              h('span', { class: 'visually-hidden', text: `, ${o.band} for everyone` }),
            ],
          ),
        ),
      ]),
    );
  }

  return h(
    'div',
    {
      class: 'timeline',
      attrs: { role: 'region', 'aria-labelledby': captionId, tabindex: '0' },
    },
    [
      h('table', { class: 'timeline__table' }, [
        h('caption', {
          class: 'visually-hidden',
          text: 'Today’s hours in each time zone, aligned on the same moment. Scroll sideways for more.',
          attrs: { id: captionId },
        }),
        head,
        h('tbody', {}, rows),
      ]),
    ],
  );
}

/**
 * Render the full-page error state (used when the app cannot start).
 * @param {HTMLElement} root
 * @param {{ title: string, body: string }} message
 */
export function mountFatalError(root, { title, body }) {
  const shell = appShell({ title: 'TZ Overlap' });
  shell.main.append(
    errorState({
      title,
      body,
      action: button({
        label: 'Try again',
        variant: 'secondary',
        onClick: () => window.location.reload(),
      }),
    }),
  );
  root.replaceChildren(shell.root);
}
