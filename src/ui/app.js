// The main page: app shell, add-zone card, timelines card. Built only from the
// shared components in ./components.js and the tokens in src/styles/.

import { cityDataIfLoaded } from '../lib/city-data.js';
import { buildGrid } from '../lib/grid.js';
import { createHomeTracker } from '../lib/home.js';
import { MAX_EXTRA_ZONES } from '../lib/store.js';
import { localeHourCycle as readLocaleHourCycle, resolveHourCycle } from '../lib/time-format.js';
import { getLocalTimeZone, zoneCity } from '../lib/timezones.js';
import { ianaZoneFromInput } from '../lib/zones.js';
import { appShell, button, card, emptyState, errorState, field } from './components.js';
import { h } from './dom.js';
import { timelineGrid } from './grid.js';
import { settingsSheet } from './settings.js';
import { strings } from './strings.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {ReturnType<typeof import('./theme.js').createTheme>} ThemeController
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
 * @typedef {import('../lib/suitability.js').Rating} Rating
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
 *   localeHourCycle?: string,
 * }} deps
 */
export function mountApp(
  root,
  {
    store,
    theme,
    deviceZone = getLocalTimeZone,
    now = () => new Date(),
    suggestions = [],
    localeHourCycle = readLocaleHourCycle(),
  },
) {
  const home = createHomeTracker({ store, deviceZone });
  /** The 12/24-hour cycle on screen: the setting, with `auto` following the locale. */
  const hourCycle = () => resolveHourCycle(store.getState().settings.hourCycle, localeHourCycle);
  /** Store the explicit opposite of the cycle showing (toggle and T key). */
  const toggleHourCycle = () =>
    store.updateSettings({ hourCycle: hourCycle() === 'h23' ? 'h12' : 'h23' });
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
  // Title bar 12/24 toggle, desktop only (app.css); pressed while 24-hour shows.
  const hourToggle = button({
    label: strings.app.hourToggle,
    variant: 'ghost',
    pressed: hourCycle() === 'h23',
    onClick: toggleHourCycle,
  });
  hourToggle.classList.add('hour-toggle');
  hourToggle.setAttribute('aria-keyshortcuts', 'T');
  const shell = appShell({
    title: strings.app.title,
    tagline: strings.app.tagline,
    actions: [hourToggle, settingsButton],
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
  /** @type {ReturnType<typeof timelineGrid> | null} */
  let view = null;

  function render() {
    const { zones, settings } = store.getState();
    const homeZone = home.current();
    const key = JSON.stringify([
      homeZone,
      zones.map((z) => [z.id, z.kind, z.kind === 'iana' ? z.tz : z.minutes, z.label, z.country]),
      settings.weekendsUnavailable,
    ]);
    if (key === renderedKey) return;
    renderedKey = key;
    const remaining = MAX_EXTRA_ZONES - zones.length;
    zoneField.setHelp(remaining > 0 ? strings.addZone.help(remaining) : strings.addZone.full);

    // A stored copy of the home zone stays hidden; its label names the home row.
    const isHome = (/** @type {StoredZone} */ z) => z.kind === 'iana' && z.tz === homeZone;
    const shown = zones.filter((z) => !isHome(z));
    const current = now();
    view?.destroy();
    const grid = buildGrid({
      homeZone: { kind: 'iana', tz: homeZone },
      zones: shown,
      now: current,
      weekendsUnavailable: settings.weekendsUnavailable,
    });
    view = timelineGrid({
      grid,
      zones: shown,
      now: current,
      hourCycle: shownCycle,
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
  }

  /** The cycle the grid and toggle show; a change rewrites them in place. */
  let shownCycle = hourCycle();

  function syncHourCycle() {
    const next = hourCycle();
    if (next === shownCycle) return;
    shownCycle = next;
    hourToggle.setAttribute('aria-pressed', String(next === 'h23'));
    view?.setHourCycle(next);
  }

  // T toggles the cycle, only while focus is in the timeline grid (WCAG 2.1.4).
  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== 't' && event.key !== 'T') return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.repeat || event.isComposing) return;
    if (!view || !(event.target instanceof Node) || !view.root.contains(event.target)) return;
    event.preventDefault();
    toggleHourCycle();
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
        view?.tick(now());
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
  store.subscribe(render);
  store.subscribe(syncHourCycle);
  render();
  scheduleTick();
  shell.main.append(addCard.root, timelinesCard.root);
  root.replaceChildren(shell.root, settings.root);
  // A later task than the region's mount, so screen readers announce it.
  if (store.wasReset()) {
    setTimeout(() => shell.toaster.show({ message: strings.toasts.dataReset }), 0);
  }
  if (launch.travelled) setTimeout(showTravelled, 0);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('focus', checkHome);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkHome();
  });

  return {
    /** Show the "Update available" banner. @param {() => void} onReload */
    showUpdate(onReload) {
      shell.banner.show({
        message: strings.update.available,
        action: { label: strings.update.reload, onClick: onReload },
      });
    },
  };
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
