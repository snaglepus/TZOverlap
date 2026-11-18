// The main page: app shell, add-zone card, timelines card. Built only from the
// shared components in ./components.js and the tokens in src/styles/.

import { MAX_EXTRA_ZONES } from '../lib/store.js';
import { buildTimeline, startOfLocalDay } from '../lib/timeline.js';
import { formatOffset, zoneCity } from '../lib/timezones.js';
import { ianaZoneFromInput } from '../lib/zones.js';
import { appShell, button, card, emptyState, errorState, field } from './components.js';
import { h } from './dom.js';
import { strings } from './strings.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {ReturnType<typeof import('./theme.js').createTheme>} ThemeController
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
 * @typedef {Extract<StoredZone, { kind: 'iana' }>} IanaZone
 * @typedef {import('../lib/hours.js').Band} Band
 */

/** @type {Record<'empty' | 'invalid' | 'duplicate' | 'limit', (input: string) => string>} */
const ADD_ERRORS = {
  empty: () => strings.errors.empty,
  invalid: (input) => strings.errors.invalid(input.trim()),
  duplicate: () => strings.errors.duplicate,
  limit: () => strings.errors.limit(MAX_EXTRA_ZONES + 1),
};

/**
 * @param {ThemeController} theme
 */
function themeToggle(theme) {
  const btn = button({
    label: strings.app.themeToggle,
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
 *   homeZone: string,
 *   now?: () => Date,
 *   suggestions?: readonly string[],
 * }} deps
 */
export function mountApp(
  root,
  { store, theme, homeZone, now = () => new Date(), suggestions = [] },
) {
  const announcer = h('p', {
    class: 'visually-hidden',
    attrs: { 'aria-live': 'polite', 'data-testid': 'announcer' },
  });
  const shell = appShell({
    title: strings.app.title,
    tagline: strings.app.tagline,
    actions: [themeToggle(theme)],
    footer: [h('p', { text: strings.app.footer }), announcer],
  });

  // --- Add-zone card ---------------------------------------------------------
  const zoneField = field({
    label: strings.addZone.label,
    name: 'zone',
    placeholder: strings.addZone.placeholder,
    suggestions,
  });
  const form = h('form', { class: 'add-zone', attrs: { novalidate: true } }, [
    zoneField.root,
    h('div', { class: 'add-zone__submit' }, [
      button({ label: strings.addZone.submit, variant: 'primary', type: 'submit' }),
    ]),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = zoneField.input.value;
    const parsed = ianaZoneFromInput(value, homeZone);
    const result = parsed.ok ? store.add(parsed.zone) : parsed;
    if (!result.ok) {
      zoneField.setError(ADD_ERRORS[result.error](value));
      zoneField.input.focus();
      return;
    }
    zoneField.setError(null);
    zoneField.input.value = '';
    announcer.textContent = strings.addZone.added(result.zone.label);
  });
  const addCard = card({ title: strings.addZone.cardTitle, children: [form] });

  // --- Timelines card --------------------------------------------------------
  const timelinesCard = card({ title: strings.timelines.cardTitle, actions: [legend()] });

  /** Zone list of the last render; settings-only changes keep the DOM. */
  let renderedKey = '';

  function render() {
    const { zones } = store.getState();
    const key = JSON.stringify(
      zones.map((z) => [z.id, z.kind, z.kind === 'iana' ? z.tz : z.minutes, z.label]),
    );
    if (key === renderedKey) return;
    renderedKey = key;
    const remaining = MAX_EXTRA_ZONES - zones.length;
    zoneField.setHelp(remaining > 0 ? strings.addZone.help(remaining) : strings.addZone.full);

    // Fixed zones wait for TZO-8; a stored copy of the home zone stays hidden.
    const shown = /** @type {IanaZone[]} */ (
      zones.filter((z) => z.kind === 'iana' && z.tz !== homeZone)
    );
    const current = now();
    const timeline = buildTimeline({
      zones: [homeZone, ...shown.map((z) => z.tz)],
      start: startOfLocalDay(homeZone, current),
      hours: 24,
    });
    const body = [timelineTable(timeline, current, shown, (zone) => remove(zone))];
    if (zones.length === 0) {
      body.push(
        emptyState({
          title: strings.empty.title,
          body: strings.empty.body(MAX_EXTRA_ZONES),
          action: button({
            label: strings.empty.action,
            variant: 'secondary',
            onClick: () => zoneField.input.focus(),
          }),
        }),
      );
    }
    timelinesCard.body.replaceChildren(...body);
  }

  /** @param {StoredZone} zone */
  function remove(zone) {
    store.remove(zone.id);
    announcer.textContent = strings.addZone.removed(zone.label);
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
    { class: 'legend', attrs: { 'aria-label': strings.timelines.legend } },
    items.map(([cls, band]) =>
      h('li', { class: 'legend__item' }, [
        h('span', { class: `legend__swatch ${cls}`, attrs: { 'aria-hidden': 'true' } }),
        strings.bands[band],
      ]),
    ),
  );
}

/**
 * @param {import('../lib/timeline.js').Timeline} timeline
 * @param {Date} current
 * @param {IanaZone[]} zones stored zones for rows 1.., in order
 * @param {(zone: StoredZone) => void} onRemove
 */
function timelineTable(timeline, current, zones, onRemove) {
  const captionId = 'timeline-caption';
  const reference = timeline.rows[0];
  const nowIndex = reference
    ? reference.slots.findIndex(
        (s) => current >= s.instant && current.getTime() < s.instant.getTime() + 3_600_000,
      )
    : -1;

  const head = h('thead', { class: 'visually-hidden' }, [
    h('tr', {}, [
      h('th', { text: strings.timelines.zoneHeader, attrs: { scope: 'col' } }),
      ...(reference?.slots ?? []).map((slot) =>
        h('th', { text: strings.timelines.slotHeader(slot.label), attrs: { scope: 'col' } }),
      ),
    ]),
  ]);

  const rows = timeline.rows.map((row, rowIndex) => {
    const zone = rowIndex === 0 ? null : zones[rowIndex - 1];
    return h('tr', { attrs: { 'data-zone': row.timeZone } }, [
      h('th', { class: 'timeline__zone', attrs: { scope: 'row' } }, [
        h('div', { class: 'timeline__zone-inner' }, [
          h('div', {}, [
            h('span', {
              class: 'timeline__city',
              text: zone ? zone.label : strings.timelines.you(zoneCity(row.timeZone)),
            }),
            h('span', {
              class: 'timeline__meta',
              text: formatOffset(row.offsetMinutes),
            }),
          ]),
          zone
            ? button({
                label: strings.timelines.removeLabel,
                variant: 'ghost',
                size: 'sm',
                ariaLabel: strings.timelines.remove(zone.label),
                onClick: () => onRemove(zone),
              })
            : null,
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
            h('span', {
              class: 'visually-hidden',
              text: strings.timelines.slotDetail(slot.label, slot.band),
            }),
            slot.dayShift
              ? h('span', {
                  class: 'slot__day',
                  text: strings.timelines.dayShift(slot.dayShift),
                })
              : null,
          ],
        ),
      ),
    ]);
  });

  if (timeline.rows.length > 1) {
    rows.push(
      h('tr', { class: 'timeline__row--overlap', attrs: { 'data-zone': 'overlap' } }, [
        h('th', { class: 'timeline__zone', attrs: { scope: 'row' } }, [
          h('span', { class: 'timeline__city', text: strings.timelines.overlapTitle }),
          h('span', { class: 'timeline__meta', text: strings.timelines.overlapMeta }),
        ]),
        ...timeline.overlap.map((o, i) =>
          h(
            'td',
            {
              class: `slot heat-${o.score}${i === nowIndex ? ' slot--now' : ''}`,
              attrs: { 'data-band': o.band },
            },
            [
              strings.overlap[o.band],
              h('span', {
                class: 'visually-hidden',
                text: strings.timelines.overlapDetail(o.band),
              }),
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
          text: strings.timelines.caption,
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
  const shell = appShell({ title: strings.app.title });
  shell.main.append(
    errorState({
      title,
      body,
      action: button({
        label: strings.fatal.retry,
        variant: 'secondary',
        onClick: () => window.location.reload(),
      }),
    }),
  );
  root.replaceChildren(shell.root);
}
