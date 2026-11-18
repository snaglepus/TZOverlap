// The main page: app shell, timelines card with the Add city button. Built only from the
// shared components in ./components.js and the tokens in src/styles/.

import { cityDataIfLoaded } from '../lib/city-data.js';
import { buildGrid } from '../lib/grid.js';
import { createHomeTracker } from '../lib/home.js';
import { MAX_EXTRA_ZONES } from '../lib/store.js';
import { getLocalTimeZone, zoneCity } from '../lib/timezones.js';
import { addCitySheet } from './add-city.js';
import { appShell, button, card, emptyState, errorState } from './components.js';
import { h } from './dom.js';
import { timelineGrid } from './grid.js';
import { installController } from './install.js';
import { settingsSheet } from './settings.js';
import { strings } from './strings.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {ReturnType<typeof import('./theme.js').createTheme>} ThemeController
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
 * @typedef {import('../lib/suitability.js').Rating} Rating
 * @typedef {import('./grid.js').GridView} GridView
 * @typedef {import('../lib/install.js').InstallKind} InstallKind
 */

const MINUTE_MS = 60000;

/**
 * @param {HTMLElement} root
 * @param {{
 *   store: Store,
 *   theme: ThemeController,
 *   deviceZone?: () => string,
 *   now?: () => Date,
 *   installKind?: InstallKind,
 * }} deps
 */
export function mountApp(
  root,
  { store, theme, deviceZone = getLocalTimeZone, now = () => new Date(), installKind = 'other' },
) {
  const home = createHomeTracker({ store, deviceZone });
  const announcer = h('p', {
    class: 'visually-hidden',
    attrs: { 'aria-live': 'polite', 'data-testid': 'announcer' },
  });
  const nowButton = button({
    label: strings.app.now,
    ariaLabel: strings.app.nowLabel,
    variant: 'ghost',
    disabled: true,
    onClick: () => {
      const hadFocus = document.activeElement === nowButton;
      view?.scrollToNow({ animate: true });
      // The button disables itself once the line is back; keep keyboard focus.
      if (hadFocus) view?.root.focus({ preventScroll: true });
    },
  });
  const settingsButton = button({
    label: strings.app.settings,
    icon: 'gear',
    iconOnly: true,
    variant: 'ghost',
    onClick: () => settings.open(settingsButton),
  });
  const shell = appShell({
    title: strings.app.title,
    tagline: strings.app.tagline,
    actions: [nowButton, settingsButton],
    footer: [h('p', { text: strings.app.footer }), announcer],
  });
  const install = installController({ store, kind: installKind, main: shell.main });
  const settings = settingsSheet({ store, theme, toaster: shell.toaster, install });

  const addCity = addCitySheet({
    store,
    homeZone: home.current,
    now,
    announcer,
    focusTarget: () =>
      timelinesCard.body.querySelector('.add-city-button') ??
      timelinesCard.body.querySelector('[role="grid"]'),
  });

  // --- Timelines card --------------------------------------------------------
  const timelinesCard = card({ title: strings.timelines.cardTitle, actions: [legend()] });

  /** Home, zone list and weekend setting of the last render; other changes keep the DOM. */
  let renderedKey = '';
  /** @type {GridView | null} */
  let view = null;
  /** Every render builds the same window, so a saved scroll instant stays inside it. */
  const anchor = now();
  /** @type {HTMLButtonElement | null} */
  let addButton = null;

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

    // A stored copy of the home zone stays hidden; its label names the home row.
    const isHome = (/** @type {StoredZone} */ z) => z.kind === 'iana' && z.tz === homeZone;
    const shown = zones.filter((z) => !isHome(z));
    const grid = buildGrid({
      homeZone: { kind: 'iana', tz: homeZone },
      zones: shown,
      now: anchor,
      weekendsUnavailable: settings.weekendsUnavailable,
    });
    // Keep the instant at the left of the visible track across the rebuild.
    const left = view?.root.isConnected ? view.leftInstant() : null;
    view = timelineGrid({
      grid,
      zones: shown,
      now: now(),
      onRemove: (zone) => remove(zone),
      homeLabel: zones.find(isHome)?.label,
      cities: cityDataIfLoaded()?.cities,
      onNowVisible: (visible) => {
        nowButton.disabled = visible;
      },
    });
    const body = [view.root, view.popover];
    addButton = null;
    if (zones.length >= MAX_EXTRA_ZONES) {
      body.push(h('p', { class: 'add-city-limit', text: strings.addCity.limit(MAX_EXTRA_ZONES) }));
    } else {
      addButton = button({
        label: strings.addCity.button,
        variant: shown.length === 0 ? 'primary' : 'secondary',
        onClick: () => addCity.open(),
      });
      addButton.classList.add('add-city-button');
      if (shown.length === 0) {
        body.push(
          emptyState({
            title: strings.addCity.promptTitle,
            body: strings.addCity.promptBody(MAX_EXTRA_ZONES),
            action: addButton,
          }),
        );
      } else {
        body.push(h('div', { class: 'add-city-row' }, [addButton]));
      }
    }
    timelinesCard.body.replaceChildren(...body);
    if (left) view.showInstant(left);
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

  // Header clocks and the now line: tick on each minute boundary, re-aligned every time.
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
    announcer.textContent = strings.addCity.removed(zone.label);
    addButton?.focus();
  }

  /** The A key opens Add city, outside text fields and other dialogs. @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== 'a' && event.key !== 'A') return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    ) {
      return;
    }
    if (document.querySelector('dialog[open]') || !addButton?.isConnected) return;
    event.preventDefault();
    addCity.open();
  }

  const launch = home.check();
  store.subscribe(render);
  render();
  scheduleTick();
  document.addEventListener('keydown', onKeydown);
  shell.main.append(timelinesCard.root);
  root.replaceChildren(shell.root, settings.root, addCity.root, ...install.roots);
  install.start();
  // TS narrows `view` to null here; render() above has set it.
  /** @type {GridView | null} */ (view)?.scrollToNow();
  window.addEventListener('resize', () => view?.refresh());
  // A later task than the region's mount, so screen readers announce it.
  if (store.wasReset()) {
    setTimeout(() => shell.toaster.show({ message: strings.toasts.dataReset }), 0);
  }
  if (launch.travelled) setTimeout(showTravelled, 0);
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
