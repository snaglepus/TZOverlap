// The main page: app shell, add-zone card, timelines card. Built only from the
// shared components in ./components.js and the tokens in src/styles/.

import { cityDataIfLoaded } from '../lib/city-data.js';
import {
  DEFAULT_DAYS,
  MAX_DATE,
  MIN_DATE,
  anchorStart,
  buildGrid,
  extendExtent,
  formatAnchor,
  headerInstant,
  initialExtent,
  parseAnchor,
  sameAnchor,
  todayAnchor,
} from '../lib/grid.js';
import { createHomeTracker } from '../lib/home.js';
import { MAX_EXTRA_ZONES } from '../lib/store.js';
import { getLocalTimeZone, zoneCity } from '../lib/timezones.js';
import { ianaZoneFromInput } from '../lib/zones.js';
import { appShell, button, card, dateField, emptyState, errorState, field } from './components.js';
import { h } from './dom.js';
import { timelineGrid } from './grid.js';
import { settingsSheet } from './settings.js';
import { strings } from './strings.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {ReturnType<typeof import('./theme.js').createTheme>} ThemeController
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
 * @typedef {import('../lib/suitability.js').Rating} Rating
 * @typedef {import('../lib/grid.js').Anchor} Anchor
 * @typedef {import('../lib/grid.js').Extent} Extent
 * @typedef {import('../lib/zones.js').Zone} Zone
 */

const MINUTE_MS = 60000;

/** @type {Record<'empty' | 'invalid' | 'duplicate' | 'limit', (input: string) => string>} */
const ADD_ERRORS = {
  empty: () => strings.errors.empty,
  invalid: (input) => strings.errors.invalid(input.trim()),
  duplicate: () => strings.errors.duplicate,
  limit: () => strings.errors.limit(MAX_EXTRA_ZONES + 1),
};

/**
 * @param {HTMLElement} root
 * @param {{
 *   store: Store,
 *   theme: ThemeController,
 *   deviceZone?: () => string,
 *   now?: () => Date,
 *   suggestions?: readonly string[],
 * }} deps
 */
export function mountApp(
  root,
  { store, theme, deviceZone = getLocalTimeZone, now = () => new Date(), suggestions = [] },
) {
  const home = createHomeTracker({ store, deviceZone });
  const announcer = h('p', {
    class: 'visually-hidden',
    attrs: { 'aria-live': 'polite', 'data-testid': 'announcer' },
  });
  const settingsButton = button({
    label: strings.app.settings,
    icon: 'gear',
    iconOnly: true,
    variant: 'ghost',
    onClick: () => settings.open(settingsButton),
  });
  // The anchor date (home zone) and the days shown either side of it; the
  // first render sets both.
  const homeZone = () => /** @type {Zone} */ ({ kind: 'iana', tz: home.current() });
  let anchor = todayAnchor(homeZone(), now());
  /** @type {Extent} */
  let extent = { before: DEFAULT_DAYS, after: DEFAULT_DAYS };
  const dateControl = dateField({
    label: strings.date.today,
    name: 'date',
    value: formatAnchor(anchor),
    min: MIN_DATE,
    max: MAX_DATE,
  });
  const todayButton = button({
    label: strings.date.todayButton,
    variant: 'ghost',
    onClick: () => {
      resetTo(todayAnchor(homeZone(), now()));
      dateControl.input.focus();
    },
  });
  todayButton.hidden = true;
  dateControl.input.addEventListener('change', () => {
    const next = parseAnchor(dateControl.input.value, homeZone());
    if (next && !sameAnchor(next, anchor)) resetTo(next);
  });
  dateControl.input.addEventListener('blur', () => {
    dateControl.input.value = formatAnchor(anchor);
  });
  const shell = appShell({
    title: strings.app.title,
    tagline: strings.app.tagline,
    actions: [dateControl.root, todayButton, settingsButton],
    footer: [h('p', { text: strings.app.footer }), announcer],
  });
  const settings = settingsSheet({ store, theme, toaster: shell.toaster });

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
    const parsed = ianaZoneFromInput(value, home.current());
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

  /** Home, zone list and weekend setting of the last render; other changes keep the DOM. */
  let renderedKey = '';
  /** The home zone of the last render. */
  let renderedHome = '';
  /** @type {ReturnType<typeof timelineGrid> | null} */
  let view = null;

  /** Label and Today button against today's date at `current`. @param {Date} current */
  function syncDate(current) {
    const isToday = sameAnchor(todayAnchor(homeZone(), current), anchor);
    dateControl.setLabel(isToday ? strings.date.today : strings.date.other);
    todayButton.hidden = isToday;
  }

  /** Move the anchor, reset the extent, rebuild and scroll. @param {Anchor} next */
  function resetTo(next) {
    anchor = next;
    extent = initialExtent(homeZone(), anchor);
    dateControl.input.value = formatAnchor(anchor);
    showGrid(null);
    syncDate(now());
  }

  /**
   * Build the grid for the anchor and extent and put it in the card. With
   * `scrollLeft`, keep that position; otherwise scroll to the current instant
   * (anchor today) or the start of the anchor date.
   * @param {number | null} scrollLeft
   */
  function showGrid(scrollLeft) {
    const { zones, settings } = store.getState();
    const tz = home.current();
    // A stored copy of the home zone stays hidden; its label names the home row.
    const isHome = (/** @type {StoredZone} */ z) => z.kind === 'iana' && z.tz === tz;
    const shown = zones.filter((z) => !isHome(z));
    const build = () =>
      buildGrid({
        homeZone: homeZone(),
        zones: shown,
        anchor,
        ...extent,
        weekendsUnavailable: settings.weekendsUnavailable,
      });
    const current = now();
    view?.disconnect();
    view = timelineGrid({
      grid: build(),
      zones: shown,
      now: current,
      offsetAt: headerInstant(homeZone(), anchor, current),
      extend: (side) => {
        const next = extendExtent(extent, side);
        if (!next) return null;
        extent = next;
        return build();
      },
      onRemove: (zone) => remove(zone),
      homeLabel: zones.find(isHome)?.label,
      cities: cityDataIfLoaded()?.cities,
    });
    const body = [view.root, view.popover];
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
    if (scrollLeft !== null) view.root.scrollLeft = scrollLeft;
    else {
      const isToday = sameAnchor(todayAnchor(homeZone(), current), anchor);
      view.scrollTo(isToday ? current : anchorStart(homeZone(), anchor));
    }
    view.watch();
  }

  function render() {
    const { zones, settings } = store.getState();
    const tz = home.current();
    const key = JSON.stringify([
      tz,
      zones.map((z) => [z.id, z.kind, z.kind === 'iana' ? z.tz : z.minutes, z.label, z.country]),
      settings.weekendsUnavailable,
    ]);
    if (key === renderedKey) return;
    renderedKey = key;
    const remaining = MAX_EXTRA_ZONES - zones.length;
    zoneField.setHelp(remaining > 0 ? strings.addZone.help(remaining) : strings.addZone.full);

    // Same home: keep the anchor, extent and scroll. A new home opens on its today.
    if (view && tz === renderedHome) {
      showGrid(view.root.scrollLeft);
      return;
    }
    renderedHome = tz;
    resetTo(todayAnchor(homeZone(), now()));
  }

  /** Follow the device zone: re-render on a change, toast after travel. */
  function checkHome() {
    const { changed, travelled } = home.check();
    if (changed) render();
    if (travelled) showTravelled();
  }

  function showTravelled() {
    shell.toaster.show({ message: strings.toasts.travelled(zoneCity(home.current())) });
  }

  // Header clocks: tick on each minute boundary, re-aligned every time.
  function scheduleTick() {
    setTimeout(
      () => {
        checkHome();
        const current = now();
        view?.tick(current, headerInstant(homeZone(), anchor, current));
        syncDate(current);
        scheduleTick();
      },
      MINUTE_MS - (now().getTime() % MINUTE_MS),
    );
  }

  /** @param {StoredZone} zone */
  function remove(zone) {
    store.remove(zone.id);
    announcer.textContent = strings.addZone.removed(zone.label);
    zoneField.input.focus();
  }

  const launch = home.check();
  shell.main.append(addCard.root, timelinesCard.root);
  root.replaceChildren(shell.root, settings.root);
  // After mounting: the grid is measured to set its scroll position.
  store.subscribe(render);
  render();
  scheduleTick();
  // A later task than the region's mount, so screen readers announce it.
  if (store.wasReset()) {
    setTimeout(() => shell.toaster.show({ message: strings.toasts.dataReset }), 0);
  }
  if (launch.travelled) setTimeout(showTravelled, 0);
  window.addEventListener('focus', checkHome);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkHome();
  });
}

function legend() {
  /** @type {[Rating, string | undefined][]} */
  const items = [
    ['best', undefined],
    ['good', '1'],
    ['unsuitable', undefined],
  ];
  return h(
    'ul',
    { class: 'legend', attrs: { 'aria-label': strings.timelines.legend } },
    items.map(([rating, step]) =>
      h('li', { class: 'legend__item' }, [
        h('span', {
          class: 'legend__swatch heat',
          attrs: { 'aria-hidden': 'true', 'data-rating': rating, 'data-heat': step },
        }),
        strings.ratings[rating],
      ]),
    ),
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
