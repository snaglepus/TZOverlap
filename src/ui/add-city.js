// The Add city sheet: popular cities by region and a search over the lazily
// loaded city data. In change mode it replaces one stored zone in place. Built from the shared components in ./components.js; page
// styles in src/styles/app.css.

import { loadCityData } from '../lib/city-data.js';
import { popularByRegion, searchZones } from '../lib/search.js';
import { MAX_EXTRA_ZONES } from '../lib/store.js';
import { isZoneAdded, zoneLocalParts, zoneOffsetLabel } from '../lib/zones.js';
import { errorState, field, sheet } from './components.js';
import { h } from './dom.js';
import { strings } from './strings.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {import('../lib/search.js').SearchResult} SearchResult
 * @typedef {import('../lib/zones.js').Zone} Zone
 * @typedef {import('../data/cities.js').City} City
 * @typedef {import('../data/cities.js').CityData} CityData
 * @typedef {import('../lib/store.js').NewZone} NewZone
 * @typedef {import('../lib/store.js').StoredZone} StoredZone
 */

/** Phones and tablets get no autofocus, so the on-screen keyboard stays down. */
const DESKTOP_POINTER = '(hover: hover) and (pointer: fine)';

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {{
 *   store: Store,
 *   homeZone: () => string,
 *   now: () => Date,
 *   announce: (text: string) => void,
 *   focusTarget: () => HTMLElement | null,
 *   focusRow: (id: string) => boolean,
 * }} deps `focusRow` focuses a changed zone's row on close; else `focusTarget()`.
 * `announce` speaks "Added X." or "Changed X to Y." in the app's live region.
 */
export function addCitySheet({ store, homeZone, now, announce, focusTarget, focusRow }) {
  const search = field({ label: strings.addCity.search, name: 'city-search' });
  const results = h('div', { class: 'add-city__results' });
  const note = h('p', { class: 'add-city__note', attrs: { 'aria-live': 'polite' } });
  const panel = sheet({
    title: strings.addCity.title,
    children: [h('div', { class: 'add-city' }, [search.root, note, results])],
  });
  const title = /** @type {HTMLElement} */ (panel.root.querySelector('.sheet__title'));

  /** The zone being changed, in change mode. @type {StoredZone | null} */
  let target = null;

  /** @type {CityData | null} */
  let data = null;
  /** @type {Promise<void> | null} */
  let loading = null;

  /**
   * "14:30" and "UTC+9" for `zone` now.
   * @param {Zone} zone
   * @param {Date} date
   */
  function timeParts(zone, date) {
    const { hour, minute } = zoneLocalParts(zone, date);
    return [
      h('span', { class: 'add-city__time mono', text: `${pad(hour)}:${pad(minute)}` }),
      h('span', { class: 'add-city__offset mono', text: zoneOffsetLabel(zone, date) }),
    ];
  }

  /**
   * One result button.
   * @param {SearchResult} result
   * @param {Date} date
   */
  function resultButton(result, date) {
    const { zone } = result;
    const added = isZoneAdded(zone, store.getState().zones, homeZone());
    const [time, offset] = timeParts(zone, date);
    /** @type {string[]} */
    let text;
    if (result.type === 'fixed') text = [result.label];
    else if (result.type === 'abbreviation') text = [result.abbreviation, result.name];
    else if (result.type === 'city') {
      text = [result.city.short ?? result.city.name, result.city.country];
    } else text = [result.zone.kind === 'iana' ? result.zone.tz : ''];
    const [primary, secondary] = text;
    return h('li', {}, [
      h(
        'button',
        {
          class: 'add-city__result',
          attrs: { type: 'button', 'data-added': added ? 'true' : undefined },
          on: { click: () => choose(result) },
        },
        [
          h('span', { class: 'add-city__name' }, [
            h('span', { class: 'add-city__primary', text: primary ?? '' }),
            secondary ? h('span', { class: 'add-city__secondary', text: secondary }) : null,
          ]),
          added ? h('span', { class: 'add-city__added', text: strings.addCity.addedMarker }) : null,
          time ?? null,
          result.type === 'fixed' ? null : (offset ?? null),
        ],
      ),
    ]);
  }

  /** @param {SearchResult[]} list @param {Date} date */
  function resultList(list, date) {
    return h(
      'ul',
      { class: 'add-city__list' },
      list.map((result) => resultButton(result, date)),
    );
  }

  /** @param {City} city @returns {SearchResult} */
  const cityResult = (city) => ({ type: 'city', zone: { kind: 'iana', tz: city.tz }, city });

  function renderResults() {
    if (!data) return;
    const date = now();
    const query = search.input.value;
    if (query.trim() === '') {
      results.replaceChildren(
        ...popularByRegion(data.cities).flatMap(({ region, cities }) => [
          h('h3', { class: 'add-city__region', text: region }),
          resultList(cities.map(cityResult), date),
        ]),
      );
      return;
    }
    const found = searchZones(query, data);
    results.replaceChildren(
      found.length > 0
        ? resultList(found, date)
        : h('p', { class: 'add-city__empty', text: strings.addCity.noResults }),
    );
  }

  /** @param {SearchResult} result */
  function choose(result) {
    if (isZoneAdded(result.zone, store.getState().zones, homeZone())) {
      note.textContent = strings.addCity.alreadyAdded;
      return;
    }
    /** @type {NewZone} */
    const zone =
      result.type === 'city'
        ? {
            kind: 'iana',
            tz: result.city.tz,
            label: result.city.short ?? result.city.name,
            country: result.city.cc,
          }
        : result.zone;
    if (target) {
      const from = target.label;
      const outcome = store.replace(target.id, zone);
      if (!outcome.ok) {
        if (outcome.error === 'duplicate') note.textContent = strings.addCity.alreadyAdded;
        else if (outcome.error === 'missing') panel.close();
        return;
      }
      panel.close();
      announce(strings.addCity.changed(from, outcome.zone.label));
      return;
    }
    const outcome = store.add(zone);
    if (!outcome.ok) {
      if (outcome.error === 'limit') note.textContent = strings.addCity.limit(MAX_EXTRA_ZONES);
      return;
    }
    panel.close();
    announce(strings.addCity.added(outcome.zone.label));
  }

  function load() {
    results.replaceChildren(h('p', { class: 'add-city__loading', text: strings.addCity.loading }));
    loading = loadCityData().then(
      (loaded) => {
        data = loaded;
        renderResults();
      },
      () => {
        results.replaceChildren(
          errorState({
            title: strings.addCity.loadFailedTitle,
            body: strings.addCity.loadFailedBody,
          }),
        );
      },
    );
  }

  search.input.addEventListener('input', renderResults);
  panel.root.addEventListener('close', () => {
    const id = target?.id;
    target = null;
    if (!(id && focusRow(id))) focusTarget()?.focus();
  });
  // Another tab can delete the zone being changed, or reset all data.
  store.subscribe(({ zones }) => {
    if (target && panel.root.open && !zones.some((z) => z.id === target?.id)) panel.close();
  });

  /** @param {StoredZone | null} zone */
  function show(zone) {
    if (panel.root.open) return;
    target = zone;
    title.textContent = zone ? strings.addCity.changeTitle(zone.label) : strings.addCity.title;
    search.input.value = '';
    note.textContent = '';
    if (data) renderResults();
    else if (!loading) load();
    panel.open();
    if (window.matchMedia(DESKTOP_POINTER).matches) search.input.focus();
  }

  return {
    root: panel.root,
    open: () => show(null),
    /** Open in change mode for `zone`. @param {StoredZone} zone */
    change: (zone) => show(zone),
  };
}
