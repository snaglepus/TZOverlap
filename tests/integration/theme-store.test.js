// Integration: theme controller + store (in-memory Storage double, fake timer)
// + an OS colour-scheme media query double, wired the way main.js wires them.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStore } from '../../src/lib/store.js';
import { createTheme } from '../../src/ui/theme.js';

/** Storage double with the same contract as window.localStorage. */
class MemoryStorage {
  /** @type {Map<string, string>} */
  #data = new Map();
  /** @param {string} key */
  getItem(key) {
    return this.#data.get(key) ?? null;
  }
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    this.#data.set(key, String(value));
  }
  /** @param {string} key */
  removeItem(key) {
    this.#data.delete(key);
  }
}

/** prefers-color-scheme: dark double whose change event the test fires. */
class FakeMedia {
  matches = false;
  /** @type {Set<() => void>} */
  #listeners = new Set();
  /** @param {string} _type @param {() => void} listener */
  addEventListener(_type, listener) {
    this.#listeners.add(listener);
  }
  /** @param {boolean} dark */
  set(dark) {
    this.matches = dark;
    for (const listener of this.#listeners) listener();
  }
}

/** Saves wait for flush(); no real timers. */
const timer = { setTimeout: () => 0, clearTimeout: () => {} };

function setup() {
  const store = createStore({ storage: new MemoryStorage(), timer });
  const media = new FakeMedia();
  /** @type {{ dataset: Record<string, string> }} */
  const root = { dataset: {} };
  const theme = createTheme({
    root: /** @type {HTMLElement} */ (/** @type {unknown} */ (root)),
    store,
    // @ts-expect-error a partial MediaQueryList double
    media,
  });
  return { store, media, root, theme };
}

describe('theme follows the store and the OS', () => {
  it("follows OS changes live with 'system'", () => {
    const { store, media, root } = setup();
    assert.equal(store.getState().settings.theme, 'system');
    assert.equal(root.dataset.theme, 'light');
    media.set(true);
    assert.equal(root.dataset.theme, 'dark');
    media.set(false);
    assert.equal(root.dataset.theme, 'light');
  });

  it('keeps a chosen dark theme when the OS switches to light', () => {
    const { store, media, root, theme } = setup();
    media.set(true);
    theme.set('dark');
    assert.equal(store.getState().settings.theme, 'dark');
    media.set(false);
    assert.equal(root.dataset.theme, 'dark');
  });

  it('follows the OS again after a reset', () => {
    const { store, media, root, theme } = setup();
    theme.set('dark');
    assert.equal(root.dataset.theme, 'dark');
    store.reset();
    assert.equal(store.getState().settings.theme, 'system');
    assert.equal(root.dataset.theme, 'light');
    media.set(true);
    assert.equal(root.dataset.theme, 'dark');
    media.set(false);
    assert.equal(root.dataset.theme, 'light');
  });
});
