// App state (PRD §8.1): a versioned { version, zones, settings, meta } object,
// persisted as JSON under STATE_KEY through an injected Storage-like object.
// Loads and migrates synchronously, validates everything it reads, saves on a
// debounce, and follows other tabs through storage events.

import { formatOffset, isValidTimeZone, zoneCity } from './timezones.js';
import { zonesEqual } from './zones.js';

/** @type {7} */
export const MAX_EXTRA_ZONES = 7;
/** @type {'tzoverlap.state'} */
export const STATE_KEY = 'tzoverlap.state';
/** @type {'tzoverlap.state.bak'} */
export const BACKUP_KEY = 'tzoverlap.state.bak';
/** @type {'tz-overlap:zones:v1'} */
export const LEGACY_ZONES_KEY = 'tz-overlap:zones:v1';
/** @type {'tz-overlap:theme'} */
export const LEGACY_THEME_KEY = 'tz-overlap:theme';
/** @type {1} */
export const STATE_VERSION = 1;

const SAVE_DELAY_MS = 250;
const MAX_OFFSET_MINUTES = 14 * 60;
const MAX_ID_LENGTH = 32;
const MAX_LABEL_LENGTH = 100;
const HOUR_CYCLES = ['auto', 'h12', 'h23'];
const THEMES = ['system', 'light', 'dark'];
const FILTERS = ['all', 'good', 'best'];

/**
 * @typedef {{ id: string, kind: 'iana', tz: string, label: string, country?: string }
 *   | { id: string, kind: 'fixed', minutes: number, label: string, country?: string }} StoredZone
 * @typedef {{ kind: 'iana', tz: string, label?: string, country?: string }
 *   | { kind: 'fixed', minutes: number, label?: string, country?: string }} NewZone
 * @typedef {{
 *   hourCycle: 'auto' | 'h12' | 'h23',
 *   theme: 'system' | 'light' | 'dark',
 *   filter: 'all' | 'good' | 'best',
 *   weekendsUnavailable: boolean,
 *   defaultDuration: number,
 * }} Settings
 * @typedef {{ installHintDismissed: boolean, lastHomeTz: string | null }} Meta
 * @typedef {{ version: 1, zones: StoredZone[], settings: Settings, meta: Meta }} State
 * @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} StorageLike
 * @typedef {{ setTimeout: (fn: () => void, ms: number) => unknown, clearTimeout: (handle: any) => void }} Timer
 * @typedef {{ ok: true, zone: StoredZone } | { ok: false, error: 'invalid' | 'duplicate' | 'limit' }} AddResult
 */

/** @returns {State} */
export function defaultState() {
  return {
    version: STATE_VERSION,
    zones: [],
    settings: {
      hourCycle: 'auto',
      theme: 'system',
      filter: 'all',
      weekendsUnavailable: true,
      defaultDuration: 60,
    },
    meta: { installHintDismissed: false, lastHomeTz: null },
  };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {value is string}
 */
const isText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

/**
 * Cleaned copy of one stored zone, or null when it breaks a rule.
 * @param {unknown} value
 * @returns {StoredZone | null}
 */
function validateZone(value) {
  if (!isObject(value)) return null;
  const { id, kind, tz, minutes, label, country } = value;
  if (!isText(id, MAX_ID_LENGTH) || !isText(label, MAX_LABEL_LENGTH)) return null;
  if (country !== undefined && (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country))) {
    return null;
  }
  /** @type {StoredZone} */
  let zone;
  if (kind === 'iana' && typeof tz === 'string' && isValidTimeZone(tz)) {
    zone = { id, kind, tz, label };
  } else if (
    kind === 'fixed' &&
    Number.isInteger(minutes) &&
    Math.abs(/** @type {number} */ (minutes)) <= MAX_OFFSET_MINUTES
  ) {
    zone = { id, kind, minutes: /** @type {number} */ (minutes), label };
  } else {
    return null;
  }
  if (country !== undefined) zone.country = country;
  return zone;
}

/**
 * @param {unknown} value
 * @returns {Settings | null}
 */
function validateSettings(value) {
  if (!isObject(value)) return null;
  const { hourCycle, theme, filter, weekendsUnavailable, defaultDuration } = value;
  if (
    typeof hourCycle !== 'string' ||
    !HOUR_CYCLES.includes(hourCycle) ||
    typeof theme !== 'string' ||
    !THEMES.includes(theme) ||
    typeof filter !== 'string' ||
    !FILTERS.includes(filter) ||
    typeof weekendsUnavailable !== 'boolean' ||
    typeof defaultDuration !== 'number' ||
    !Number.isInteger(defaultDuration) ||
    defaultDuration % 15 !== 0 ||
    defaultDuration < 15 ||
    defaultDuration > 1440
  ) {
    return null;
  }
  return /** @type {Settings} */ ({
    hourCycle,
    theme,
    filter,
    weekendsUnavailable,
    defaultDuration,
  });
}

/**
 * @param {unknown} value
 * @returns {Meta | null}
 */
function validateMeta(value) {
  if (!isObject(value)) return null;
  const { installHintDismissed, lastHomeTz } = value;
  if (typeof installHintDismissed !== 'boolean') return null;
  if (lastHomeTz !== null && (typeof lastHomeTz !== 'string' || !isValidTimeZone(lastHomeTz))) {
    return null;
  }
  return { installHintDismissed, lastHomeTz };
}

/**
 * True when no two zones share an id, an IANA ID or a fixed offset.
 * @param {StoredZone[]} zones
 */
function zonesDistinct(zones) {
  return zones.every(
    (zone, i) => zones.findIndex((other) => other.id === zone.id || zonesEqual(other, zone)) === i,
  );
}

/**
 * Cleaned copy of a parsed state holding only the known properties, or null.
 * @param {unknown} value
 * @returns {State | null}
 */
export function validateState(value) {
  if (!isObject(value) || value.version !== STATE_VERSION) return null;
  if (!Array.isArray(value.zones) || value.zones.length > MAX_EXTRA_ZONES) return null;
  /** @type {StoredZone[]} */
  const zones = [];
  for (const item of value.zones) {
    const zone = validateZone(item);
    if (!zone) return null;
    zones.push(zone);
  }
  if (!zonesDistinct(zones)) return null;
  const settings = validateSettings(value.settings);
  const meta = validateMeta(value.meta);
  if (!settings || !meta) return null;
  return { version: STATE_VERSION, zones, settings, meta };
}

/**
 * @param {string | null} text
 * @returns {State | null}
 */
function parseState(text) {
  if (text === null) return null;
  try {
    return validateState(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * A new "z_…" id not used by any of `zones`.
 * @param {StoredZone[]} zones
 */
function newId(zones) {
  for (;;) {
    const id = `z_${Math.random().toString(36).slice(2, 12)}`;
    if (id.length > 2 && !zones.some((zone) => zone.id === id)) return id;
  }
}

/**
 * @param {NewZone} zone
 * @param {string} id
 * @returns {StoredZone | null}
 */
function toStoredZone(zone, id) {
  if (!isObject(zone)) return null;
  let label = zone.label;
  if (label === undefined) {
    if (zone.kind === 'iana' && typeof zone.tz === 'string') label = zoneCity(zone.tz);
    else if (zone.kind === 'fixed' && Number.isInteger(zone.minutes)) {
      label = formatOffset(zone.minutes);
    }
  }
  return validateZone({ ...zone, id, label });
}

/** @type {Timer} */
const globalTimer = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

/**
 * @param {{ storage?: StorageLike, timer?: Timer, persist?: () => Promise<unknown> }} [options]
 */
export function createStore({ storage, timer = globalTimer, persist } = {}) {
  /** @param {string} key */
  const read = (key) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  /** @param {string} key @param {string} value */
  const write = (key, value) => {
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      // Storage full or blocked (private mode): keep working in memory.
      return false;
    }
  };

  let reset = false;
  /** Original STATE_KEY text that still has to reach BACKUP_KEY. @type {string | null} */
  let pendingBackup = null;
  /** @type {unknown} */
  let saveHandle;
  let savePending = false;
  let persistCalled = false;

  /** @returns {State} */
  function load() {
    const text = read(STATE_KEY);
    if (text !== null) {
      const loaded = parseState(text);
      if (loaded) return loaded;
      reset = true;
      const fresh = defaultState();
      if (write(BACKUP_KEY, text)) write(STATE_KEY, JSON.stringify(fresh));
      else pendingBackup = text;
      return fresh;
    }
    const legacyZones = read(LEGACY_ZONES_KEY);
    const legacyTheme = read(LEGACY_THEME_KEY);
    if (legacyZones === null && legacyTheme === null) return defaultState();
    const migrated = migrate(legacyZones, legacyTheme);
    if (write(STATE_KEY, JSON.stringify(migrated))) {
      try {
        storage?.removeItem(LEGACY_ZONES_KEY);
        storage?.removeItem(LEGACY_THEME_KEY);
      } catch {
        // Left behind; STATE_KEY now wins over them on every load.
      }
    }
    return migrated;
  }

  /** @type {State} */
  let state = load();
  /** @type {Set<(state: State) => void>} */
  const listeners = new Set();

  function save() {
    savePending = false;
    saveHandle = undefined;
    if (pendingBackup !== null) {
      if (!write(BACKUP_KEY, pendingBackup)) return;
      pendingBackup = null;
    }
    write(STATE_KEY, JSON.stringify(state));
  }

  function cancelSave() {
    if (savePending) timer.clearTimeout(saveHandle);
    savePending = false;
    saveHandle = undefined;
  }

  /** @param {State} next */
  function commit(next) {
    state = next;
    cancelSave();
    savePending = true;
    saveHandle = timer.setTimeout(save, SAVE_DELAY_MS);
    for (const listener of listeners) listener(state);
  }

  /** @param {StoredZone[]} zones */
  const withZones = (zones) => commit({ ...state, zones });

  /**
   * @param {StoredZone} zone
   * @param {StoredZone[]} others
   * @returns {'duplicate' | 'limit' | null}
   */
  const conflict = (zone, others) => {
    if (others.some((other) => zonesEqual(other, zone))) return 'duplicate';
    if (others.length >= MAX_EXTRA_ZONES) return 'limit';
    return null;
  };

  return {
    /** @returns {State} */
    getState: () => state,

    /** Whether the load found a bad state and reset it to the defaults. */
    wasReset: () => reset,

    /**
     * @param {NewZone} zone
     * @returns {AddResult}
     */
    add(zone) {
      const stored = toStoredZone(zone, newId(state.zones));
      if (!stored) return { ok: false, error: 'invalid' };
      const error = conflict(stored, state.zones);
      if (error) return { ok: false, error };
      withZones([...state.zones, stored]);
      if (!persistCalled && persist) {
        persistCalled = true;
        try {
          persist().catch(() => {});
        } catch {
          // Persistence is best effort.
        }
      }
      return { ok: true, zone: stored };
    },

    /**
     * @param {string} id
     * @param {NewZone} zone
     * @returns {{ ok: true, zone: StoredZone } | { ok: false, error: 'missing' | 'invalid' | 'duplicate' }}
     */
    replace(id, zone) {
      const index = state.zones.findIndex((z) => z.id === id);
      if (index < 0) return { ok: false, error: 'missing' };
      const stored = toStoredZone(zone, id);
      if (!stored) return { ok: false, error: 'invalid' };
      if (state.zones.some((other, i) => i !== index && zonesEqual(other, stored))) {
        return { ok: false, error: 'duplicate' };
      }
      withZones(state.zones.map((z, i) => (i === index ? stored : z)));
      return { ok: true, zone: stored };
    },

    /**
     * @param {string} id
     * @returns {{ ok: true, zone: StoredZone, index: number } | { ok: false, error: 'missing' }}
     */
    remove(id) {
      const index = state.zones.findIndex((z) => z.id === id);
      const zone = state.zones[index];
      if (!zone) return { ok: false, error: 'missing' };
      withZones(state.zones.filter((z) => z !== zone));
      return { ok: true, zone, index };
    },

    /**
     * Put a removed zone back at `index`, keeping its id unless it is taken.
     * @param {StoredZone} zone
     * @param {number} index
     * @returns {AddResult}
     */
    restore(zone, index) {
      const taken = !isObject(zone) || state.zones.some((z) => z.id === zone.id);
      const stored = validateZone(taken ? { ...zone, id: newId(state.zones) } : zone);
      if (!stored) return { ok: false, error: 'invalid' };
      const error = conflict(stored, state.zones);
      if (error) return { ok: false, error };
      const at = Math.min(Math.max(Math.trunc(index) || 0, 0), state.zones.length);
      withZones([...state.zones.slice(0, at), stored, ...state.zones.slice(at)]);
      return { ok: true, zone: stored };
    },

    /**
     * @param {string} id
     * @param {number} toIndex
     * @returns {{ ok: true } | { ok: false, error: 'missing' }}
     */
    move(id, toIndex) {
      const from = state.zones.findIndex((z) => z.id === id);
      const zone = state.zones[from];
      if (!zone) return { ok: false, error: 'missing' };
      const to = Math.min(Math.max(Math.trunc(toIndex) || 0, 0), state.zones.length - 1);
      if (to === from) return { ok: true };
      const rest = state.zones.filter((z) => z !== zone);
      withZones([...rest.slice(0, to), zone, ...rest.slice(to)]);
      return { ok: true };
    },

    /**
     * @param {Partial<Settings>} patch
     * @returns {{ ok: true } | { ok: false, error: 'invalid' }}
     */
    updateSettings(patch) {
      if (!isObject(patch) || !Object.keys(patch).every((k) => k in state.settings)) {
        return { ok: false, error: 'invalid' };
      }
      const settings = validateSettings({ ...state.settings, ...patch });
      if (!settings) return { ok: false, error: 'invalid' };
      commit({ ...state, settings });
      return { ok: true };
    },

    /**
     * @param {Partial<Meta>} patch
     * @returns {{ ok: true } | { ok: false, error: 'invalid' }}
     */
    updateMeta(patch) {
      if (!isObject(patch) || !Object.keys(patch).every((k) => k in state.meta)) {
        return { ok: false, error: 'invalid' };
      }
      const meta = validateMeta({ ...state.meta, ...patch });
      if (!meta) return { ok: false, error: 'invalid' };
      commit({ ...state, meta });
      return { ok: true };
    },

    /** Back to the default state. */
    reset() {
      commit(defaultState());
    },

    /**
     * @param {(state: State) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Write any pending save now. */
    flush() {
      if (!savePending) return;
      cancelSave();
      save();
    },

    /**
     * Another tab wrote storage. The event is only a signal: the value used is
     * the one in storage now, so a delayed event cannot undo a later write.
     * @param {{ key: string | null, newValue?: string | null }} event
     */
    handleStorageEvent(event) {
      if (event.key !== STATE_KEY) return;
      const next = parseState(read(STATE_KEY));
      if (!next || JSON.stringify(next) === JSON.stringify(state)) return;
      state = next;
      cancelSave();
      for (const listener of listeners) listener(state);
    },
  };
}

/**
 * Version 1 state from the pre-versioned keys.
 * @param {string | null} zonesText
 * @param {string | null} themeText
 * @returns {State}
 */
function migrate(zonesText, themeText) {
  const state = defaultState();
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(zonesText ?? 'null');
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed)) {
    for (const tz of parsed) {
      if (state.zones.length >= MAX_EXTRA_ZONES) break;
      if (typeof tz !== 'string' || !isValidTimeZone(tz)) continue;
      if (state.zones.some((zone) => zone.kind === 'iana' && zone.tz === tz)) continue;
      state.zones.push({ id: newId(state.zones), kind: 'iana', tz, label: zoneCity(tz) });
    }
  }
  if (themeText === 'light' || themeText === 'dark') state.settings.theme = themeText;
  return state;
}
