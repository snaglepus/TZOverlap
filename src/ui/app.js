// The main page: app shell, timelines card with the Add city button. Built only from the
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
import { localeHourCycle as readLocaleHourCycle, resolveHourCycle } from '../lib/time-format.js';
import { getLocalTimeZone, zoneCity } from '../lib/timezones.js';
import { addCitySheet } from './add-city.js';
import { appShell, button, card, dateField, emptyState, errorState } from './components.js';
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
 * @typedef {import('../lib/grid.js').Anchor} Anchor
 * @typedef {import('../lib/grid.js').Extent} Extent
 * @typedef {import('../lib/zones.js').Zone} Zone
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
 *   localeHourCycle?: string,
 *   installKind?: InstallKind,
 * }} deps
 */
export function mountApp(
  root,
  {
    store,
    theme,
    deviceZone = getLocalTimeZone,
    now = () => new Date(),
    localeHourCycle = readLocaleHourCycle(),
    installKind = 'other',
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
  const nowButton = button({
    label: strings.app.now,
    ariaLabel: strings.app.nowLabel,
    variant: 'ghost',
    disabled: true,
    onClick: () => {
      const hadFocus = document.activeElement === nowButton;
      goToNow();
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
    actions: [dateControl.root, todayButton, hourToggle, nowButton, settingsButton],
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
  /** The home zone of the last render. */
  let renderedHome = '';
  /** @type {GridView | null} */
  let view = null;
  /** @type {HTMLButtonElement | null} */
  let addButton = null;

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

  /** Now button and N: scroll to the now line, or back to today when it isn't in the window. */
  function goToNow() {
    if (view?.hasNow()) view.scrollToNow({ animate: true });
    else resetTo(todayAnchor(homeZone(), now()));
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
    view?.destroy();
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
      hourCycle: shownCycle,
      onRemove: (zone) => remove(zone),
      homeLabel: zones.find(isHome)?.label,
      cities: cityDataIfLoaded()?.cities,
      onNowVisible: (visible) => {
        nowButton.disabled = visible;
      },
      onGoToNow: goToNow,
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
    if (scrollLeft !== null) {
      view.root.scrollLeft = scrollLeft;
      view.refresh();
    } else {
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
    // Same home: keep the anchor, extent and scroll. A new home opens on its today.
    if (view && tz === renderedHome) {
      showGrid(view.root.scrollLeft);
      return;
    }
    renderedHome = tz;
    resetTo(todayAnchor(homeZone(), now()));
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
  function onHourCycleKey(event) {
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

  // Header clocks and the now line: tick on each minute boundary, re-aligned every time.
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
  shell.main.append(timelinesCard.root);
  root.replaceChildren(shell.root, settings.root, addCity.root, ...install.roots);
  // After mounting: the grid is measured to set its scroll position.
  store.subscribe(render);
  store.subscribe(syncHourCycle);
  render();
  scheduleTick();
  document.addEventListener('keydown', onKeydown);
  install.start();
  window.addEventListener('resize', () => view?.refresh());
  // A later task than the region's mount, so screen readers announce it.
  if (store.wasReset()) {
    setTimeout(() => shell.toaster.show({ message: strings.toasts.dataReset }), 0);
  }
  if (launch.travelled) setTimeout(showTravelled, 0);
  document.addEventListener('keydown', onHourCycleKey);
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
