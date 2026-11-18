// The selected meeting slot: a start on a 15-minute boundary plus a duration in
// minutes. Pure (no DOM). Derived times and ratings are in selection-details.js.

import { SLOT_MINUTES } from './suitability.js';

/** @typedef {Readonly<{ start: Date, duration: number }>} Selection */

const SLOT_MS = SLOT_MINUTES * 60000;

/**
 * The nearest 15-minute UTC boundary; a tie at exactly 7.5 minutes rounds up.
 * @param {Date} instant
 */
export function snapToSlot(instant) {
  return new Date(Math.floor(instant.getTime() / SLOT_MS + 0.5) * SLOT_MS);
}

/**
 * @param {Date} start on a 15-minute UTC boundary
 * @param {number} duration minutes, a positive multiple of 15
 * @returns {Selection}
 */
export function createSelection(start, duration) {
  if (!(start instanceof Date) || !Number.isInteger(start.getTime() / SLOT_MS)) {
    throw new RangeError('start must be on a 15-minute UTC boundary');
  }
  if (!Number.isInteger(duration) || duration <= 0 || duration % SLOT_MINUTES !== 0) {
    throw new RangeError(`duration must be a positive multiple of 15, got ${duration}`);
  }
  return Object.freeze({ start: new Date(start.getTime()), duration });
}

/** The current selection, or null; subscribers run after every change. */
export function createSelectionState() {
  /** @type {Selection | null} */
  let current = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const notify = () => {
    for (const fn of listeners) fn();
  };
  return {
    get: () => current,
    /**
     * Snap `instant` and replace any current selection.
     * @param {Date} instant
     * @param {number} duration
     */
    select(instant, duration) {
      const next = createSelection(snapToSlot(instant), duration);
      current = next;
      notify();
      return next;
    },
    clear() {
      if (!current) return;
      current = null;
      notify();
    },
    /** @param {() => void} fn @returns {() => void} unsubscribe */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
