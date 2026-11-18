// App state: the user's local zone plus up to MAX_EXTRA_ZONES others,
// persisted through an injected Storage-like object (localStorage in the browser).

import { canonicalTimeZone, isValidTimeZone } from './timezones.js';

export const MAX_EXTRA_ZONES = 7;
export const STORAGE_KEY = 'tz-overlap:zones:v1';

/** @typedef {Pick<Storage, 'getItem' | 'setItem'>} StorageLike */
/** @typedef {{ localZone: string, zones: string[] }} State */
/** @typedef {{ ok: true } | { ok: false, error: 'empty' | 'invalid' | 'duplicate' | 'limit' }} Result */

/**
 * @param {StorageLike | undefined} storage
 * @returns {string[]}
 */
function readZones(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTimeZone).slice(0, MAX_EXTRA_ZONES);
  } catch {
    return [];
  }
}

/**
 * @param {{ localZone: string, storage?: StorageLike }} options
 */
export function createStore({ localZone, storage }) {
  /** @type {State} */
  let state = {
    localZone,
    zones: readZones(storage).filter((z) => z !== localZone),
  };
  /** @type {Set<(state: State) => void>} */
  const listeners = new Set();

  /** @param {State} next */
  function commit(next) {
    state = next;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state.zones));
    } catch {
      // Storage full or blocked (private mode): keep working in memory.
    }
    for (const listener of listeners) listener(state);
  }

  return {
    /** @returns {State} */
    getState: () => state,

    /** All zones in display order, local first. */
    allZones: () => [state.localZone, ...state.zones],

    /**
     * @param {string} input
     * @returns {Result}
     */
    addZone(input) {
      const raw = input.trim();
      if (!raw) return { ok: false, error: 'empty' };
      if (!isValidTimeZone(raw)) return { ok: false, error: 'invalid' };
      const zone = canonicalTimeZone(raw);
      if (zone === state.localZone || state.zones.includes(zone)) {
        return { ok: false, error: 'duplicate' };
      }
      if (state.zones.length >= MAX_EXTRA_ZONES) return { ok: false, error: 'limit' };
      commit({ ...state, zones: [...state.zones, zone] });
      return { ok: true };
    },

    /** @param {string} zone */
    removeZone(zone) {
      if (!state.zones.includes(zone)) return;
      commit({ ...state, zones: state.zones.filter((z) => z !== zone) });
    },

    /**
     * @param {(state: State) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
