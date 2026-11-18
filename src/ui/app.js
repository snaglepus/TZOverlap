// The main page: app shell, timelines card with the Add city button and the
// selection bar. Built only from the shared components in ./components.js and
// the tokens in src/styles/.

import { cityDataIfLoaded } from '../lib/city-data.js';
import { bannerMessage, changeSentence, changesBetween } from '../lib/dst.js';
import { dayQualifies, nextQualifyingDay } from '../lib/filter.js';
import {
  DEFAULT_DAYS,
  MAX_DATE,
  MAX_DAYS,
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
import { rowName, shortDate } from '../lib/row-header.js';
import { canMove, dropTarget, moveTarget } from '../lib/row-order.js';
import { createSelectionState } from '../lib/selection.js';
import { describeSelection, selectionSummary } from '../lib/selection-details.js';
import { MAX_EXTRA_ZONES } from '../lib/store.js';
import { localeHourCycle as readLocaleHourCycle, resolveHourCycle } from '../lib/time-format.js';
import { getLocalTimeZone, zoneCity } from '../lib/timezones.js';
import { addCitySheet } from './add-city.js';
import {
  appShell,
  button,
  card,
  createBanner,
  dateField,
  emptyState,
  errorState,
  segmentedControl,
  sheet,
} from './components.js';
import { h } from './dom.js';
import { timelineGrid } from './grid.js';
import { installController } from './install.js';
import { selectionBar } from './selection-bar.js';
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
 * @typedef {import('../lib/filter.js').Filter} Filter
 */

/** The filter options in key order: 1, 2 and 3. @type {readonly Filter[]} */
const FILTERS = ['all', 'good', 'best'];

const MINUTE_MS = 60000;

/** How long a deletion stays undoable. */
const UNDO_DURATION_MS = 5000;

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
  /** The filter the grid and control show; a change redraws the masks in place. */
  let shownFilter = store.getState().settings.filter;
  const filterControl = segmentedControl({
    legend: strings.filter.label,
    name: 'filter',
    options: FILTERS.map((value, i) => ({
      value,
      label: strings.filter.options[value],
      keyshortcuts: String(i + 1),
    })),
    value: shownFilter,
    onChange: (filter) => store.updateSettings({ filter }),
  });
  const shell = appShell({
    title: strings.app.title,
    tagline: strings.app.tagline,
    actions: [
      dateControl.root,
      todayButton,
      hourToggle,
      nowButton,
      settingsButton,
      filterControl.root,
    ],
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
    focusRow: (id) => view?.focusRow(id) ?? false,
  });

  // --- Timelines card --------------------------------------------------------
  const timelinesCard = card({ title: strings.timelines.cardTitle, actions: [legend()] });
  // Between the card header and its body, which showGrid() replaces.
  const noOverlap = h('div', {
    class: 'no-overlap',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  timelinesCard.body.before(noOverlap);

  // --- Selection ---------------------------------------------------------------
  // Kept in memory only; it survives rebuilds, date changes and lazy extension.
  const selection = createSelectionState();
  const bar = selectionBar({
    onClear: () => {
      selection.clear();
      // The bar and its button are gone; keep focus in the timelines.
      view?.root.focus({ preventScroll: true });
    },
  });
  /** The zones of the rows shown, home first. */
  let rowZones = /** @type {import('../lib/grid.js').GridZone[]} */ ([]);

  /** Recompute the bar from the selection; returns its summary, or null when hidden. */
  function syncBar() {
    const selected = selection.get();
    if (!selected || !view) {
      bar.hide();
      return null;
    }
    const details = describeSelection(selected, rowZones, {
      weekendsUnavailable: store.getState().settings.weekendsUnavailable,
    });
    const summary = selectionSummary(details, view.homeName, shownCycle);
    bar.show(summary);
    return summary;
  }

  selection.subscribe(() => {
    view?.setSelection(selection.get());
    const summary = syncBar();
    announcer.textContent = summary
      ? strings.selection.announce(summary)
      : strings.selection.cleared;
  });

  /** Home, zone list and weekend setting of the last render; other changes keep the DOM. */
  let renderedKey = '';

  // The DST banner: clock changes between now and a later shown date, under the
  // update banner. Its sheet lists them; neither changes while the sheet is open.
  const dstBanner = createBanner();
  const clockChanges = sheet({ title: strings.dst.sheetTitle });
  /** @type {import('../lib/dst.js').ChangeList | null} */
  let dstList = null;
  let dstDate = '';
  /** The text on the DST banner, or null while it's hidden. @type {string | null} */
  let dstShown = null;
  /** Whether a scan for the shown date is current, until now reaches its first change. */
  let dstScanned = false;
  let dstUntil = Infinity;

  function hideDst() {
    dstList = null;
    if (dstShown === null) return;
    const hadFocus = dstBanner.root.contains(document.activeElement);
    dstBanner.hide();
    dstShown = null;
    if (hadFocus) dateControl.input.focus();
  }

  /**
   * Show or hide the DST banner for `current`. Ticks pass `rescan` false: the
   * list is kept until now reaches its first change.
   * @param {Date} current
   * @param {boolean} rescan
   */
  function syncDst(current, rescan) {
    if (clockChanges.root.open) return;
    const target = headerInstant(homeZone(), anchor, current);
    const isToday = sameAnchor(todayAnchor(homeZone(), current), anchor);
    if (isToday || target.getTime() <= current.getTime()) {
      dstScanned = false;
      hideDst();
      return;
    }
    if (!rescan && dstScanned && current.getTime() < dstUntil) return;
    const { zones } = store.getState();
    const tz = home.current();
    const cities = cityDataIfLoaded()?.cities;
    const label = zones.find((z) => z.kind === 'iana' && z.tz === tz)?.label;
    /** @param {Zone} zone @param {string | undefined} name */
    const named = (zone, name) => {
      const { full, display } = rowName({ zone, label: name, cities });
      return { zone, name: full, display };
    };
    const list = changesBetween({
      home: named(homeZone(), label),
      others: shownZones().map((z) => named(z, z.label)),
      from: current,
      to: target,
    });
    const first = list.changes[0];
    dstScanned = true;
    dstUntil = first ? first.transition.at.getTime() : Infinity;
    if (!first) {
      hideDst();
      return;
    }
    dstList = list;
    dstDate = shortDate(homeZone(), target);
    const message = bannerMessage(list, dstDate);
    const text = JSON.stringify(message);
    if (text === dstShown) return;
    dstShown = text;
    dstBanner.show({
      message,
      action: { label: strings.dst.details, onClick: openClockChanges },
    });
  }

  function openClockChanges() {
    if (!dstList) return;
    clockChanges.body.replaceChildren(
      ...(dstList.capped ? [h('p', { text: strings.dst.cappedNote(dstDate) })] : []),
      h(
        'ul',
        { class: 'clock-changes' },
        dstList.changes.map((change) => h('li', { text: changeSentence(change).long })),
      ),
    );
    const opener = dstBanner.root.querySelector('button');
    clockChanges.open(opener ?? undefined);
  }
  // After the sheet's own close handler has returned focus to Details.
  clockChanges.root.addEventListener('close', () => syncDst(now(), true));
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

  /** The stored zones shown as rows: a stored copy of the home zone stays hidden. */
  function shownZones() {
    const tz = home.current();
    return store.getState().zones.filter((z) => !(z.kind === 'iana' && z.tz === tz));
  }

  /** The grid's home zone, rows, anchor, weekend setting and filter, for the day search. */
  function dayOptions() {
    return {
      homeZone: homeZone(),
      zones: shownZones(),
      anchor,
      weekendsUnavailable: store.getState().settings.weekendsUnavailable,
      filter: shownFilter,
    };
  }

  /** Show the no-overlap message while Good or Best leaves the anchor date empty. */
  function checkOverlap() {
    if (dayQualifies(dayOptions())) {
      noOverlap.replaceChildren();
      return;
    }
    const next = button({
      label: strings.filter.nextDay,
      variant: 'secondary',
      onClick: () => {
        const found = nextQualifyingDay(dayOptions());
        if (found) {
          resetTo(found);
        } else {
          next.replaceWith(
            h('p', { class: 'no-overlap__message', text: strings.filter.noneFound(MAX_DAYS) }),
          );
        }
        view?.root.focus({ preventScroll: true });
      },
    });
    noOverlap.replaceChildren(
      h('p', { class: 'no-overlap__message', text: strings.filter.noOverlap }),
      next,
    );
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
    const slot = view?.slot() ?? null;
    view?.destroy();
    rowZones = [homeZone(), ...shown];
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
      filter: shownFilter,
      actions: {
        canMove: (zone, direction) =>
          canMove(store.getState().zones, home.current(), zone.id, direction),
        change: (zone) => addCity.change(zone),
        move,
        remove,
        reorder,
      },
      homeLabel: zones.find(isHome)?.label,
      cities: cityDataIfLoaded()?.cities,
      onNowVisible: (visible) => {
        nowButton.disabled = visible;
      },
      onGoToNow: goToNow,
      onSelect: (instant) => selection.select(instant, store.getState().settings.defaultDuration),
      anchorStart: anchorStart(homeZone(), anchor),
      duration: settings.defaultDuration,
      weekendsUnavailable: settings.weekendsUnavailable,
      slot,
    });
    view.setSelection(selection.get());
    syncBar();
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
    body.push(bar.root);
    timelinesCard.body.replaceChildren(...body);
    if (scrollLeft !== null) {
      view.root.scrollLeft = scrollLeft;
      view.refresh();
    } else {
      const isToday = sameAnchor(todayAnchor(homeZone(), current), anchor);
      view.scrollTo(isToday ? current : anchorStart(homeZone(), anchor));
    }
    view.watch();
    checkOverlap();
    syncDst(current, true);
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
    syncBar();
  }

  /** The meeting length the next selection and the focused slot's name use. */
  let shownDuration = store.getState().settings.defaultDuration;

  // render()'s key and syncHourCycle() ignore it, so watch it here.
  function syncDuration() {
    const next = store.getState().settings.defaultDuration;
    if (next === shownDuration) return;
    shownDuration = next;
    view?.setDuration(next);
  }

  /**
   * Esc clears the selection, unless a sheet or popover is open: then it closes
   * that instead. Runs in the capture phase, before the popover's own handler.
   * @param {KeyboardEvent} event
   */
  function onEscape(event) {
    if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.shiftKey || !selection.get()) return;
    if (document.querySelector('dialog[open], :popover-open')) return;
    const inBar = bar.root.contains(document.activeElement);
    selection.clear();
    if (inBar) view?.root.focus({ preventScroll: true });
  }

  /** Follow the stored filter: control, masks and message, without a rebuild. */
  function syncFilter() {
    const next = store.getState().settings.filter;
    if (next === shownFilter) return;
    shownFilter = next;
    filterControl.setValue(next);
    view?.setFilter(next);
    checkOverlap();
  }

  // 1, 2 and 3 pick All, Good and Best, only while focus is in the grid (WCAG 2.1.4).
  /** @param {KeyboardEvent} event */
  function onFilterKey(event) {
    const filter = FILTERS[['1', '2', '3'].indexOf(event.key)];
    if (!filter) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.repeat || event.isComposing) return;
    if (!view || !(event.target instanceof Node) || !view.root.contains(event.target)) return;
    if (filter === shownFilter) return;
    event.preventDefault();
    store.updateSettings({ filter });
    announcer.textContent = strings.filter.changed(strings.filter.options[filter]);
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
        syncDst(current, false);
        scheduleTick();
      },
      MINUTE_MS - (now().getTime() % MINUTE_MS),
    );
  }

  /** Focus row `id`'s header trigger, or the Add city button without one. @param {string} id */
  function focusRow(id) {
    if (!view?.focusRow(id)) addButton?.focus();
  }

  /**
   * Move a row one place among the shown rows and announce where it went.
   * @param {StoredZone} zone
   * @param {import('../lib/row-order.js').Direction} direction
   */
  function move(zone, direction) {
    const target = moveTarget(store.getState().zones, home.current(), zone.id, direction);
    if (!target) return;
    store.move(zone.id, target.toIndex);
    focusRow(zone.id);
    announcer.textContent = strings.timelines.moved(zone.label, target.position, target.count);
  }

  /**
   * Drop a dragged row at 0-based `position` among the shown rows; nothing
   * when that is where it was.
   * @param {StoredZone} zone
   * @param {number} position
   */
  function reorder(zone, position) {
    const target = dropTarget(store.getState().zones, home.current(), zone.id, position);
    if (target) store.move(zone.id, target.toIndex);
  }

  /** Delete a row at once; the toast's Undo puts it back. @param {StoredZone} zone */
  function remove(zone) {
    const removed = store.remove(zone.id);
    if (!removed.ok) return;
    addButton?.focus();
    shell.toaster.show({
      message: strings.addCity.removed(zone.label),
      action: {
        label: strings.toasts.undo,
        onClick: () => {
          const restored = store.restore(removed.zone, removed.index);
          if (!restored.ok) return;
          focusRow(restored.zone.id);
          announcer.textContent = strings.addCity.restored(restored.zone.label);
        },
      },
      duration: UNDO_DURATION_MS,
    });
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
  shell.banner.root.after(dstBanner.root);
  shell.main.append(timelinesCard.root);
  root.replaceChildren(
    shell.root,
    settings.root,
    addCity.root,
    clockChanges.root,
    ...install.roots,
  );
  // After mounting: the grid is measured to set its scroll position.
  store.subscribe(render);
  store.subscribe(syncHourCycle);
  store.subscribe(syncDuration);
  store.subscribe(syncFilter);
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
  document.addEventListener('keydown', onEscape, true);
  document.addEventListener('keydown', onFilterKey);
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
