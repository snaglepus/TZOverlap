// Home zone tracker: follows the device time zone, saves meta.lastHomeTz and
// decides when a travel toast is due. Pure: the device lookup is injected.

import { isValidTimeZone } from './timezones.js';

/**
 * @typedef {{ home: string, changed: boolean, travelled: boolean }} HomeCheck
 */

/**
 * @param {{
 *   store: Pick<ReturnType<typeof import('./store.js').createStore>, 'getState' | 'updateMeta'>,
 *   deviceZone: () => string,
 * }} deps
 */
export function createHomeTracker({ store, deviceZone }) {
  let home = store.getState().meta.lastHomeTz ?? 'UTC';

  /** @returns {unknown} */
  function readDevice() {
    try {
      return deviceZone();
    } catch {
      return undefined;
    }
  }

  return {
    /** The home zone now shown. */
    current() {
      return home;
    },

    /**
     * Re-read the device zone. An invalid zone is ignored.
     * @returns {HomeCheck}
     */
    check() {
      const device = readDevice();
      if (!isValidTimeZone(device)) return { home, changed: false, travelled: false };
      const changed = device !== home;
      // Set before saving: the save notifies subscribers, which render `home`.
      home = device;
      const last = store.getState().meta.lastHomeTz;
      if (device === last) return { home, changed, travelled: false };
      const saved = store.updateMeta({ lastHomeTz: device }).ok;
      return { home, changed, travelled: saved && last !== null };
    },
  };
}
