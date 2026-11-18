// Light/dark theme control — DESIGN.md §4.
// Saved choice > OS preference > light. Keep THEME_KEY in sync with theme-init.js.

export const THEME_KEY = 'tz-overlap:theme';

/** @typedef {'light' | 'dark'} Theme */

/**
 * @param {{
 *   root: HTMLElement,
 *   storage?: Pick<Storage, 'getItem' | 'setItem'>,
 *   media?: Pick<MediaQueryList, 'matches' | 'addEventListener'>,
 * }} options
 */
export function createTheme({ root, storage, media }) {
  /** @returns {Theme | null} */
  const saved = () => {
    try {
      const value = storage?.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };
  /** @returns {Theme} */
  const resolve = () => saved() ?? (media?.matches ? 'dark' : 'light');

  /** @type {Set<(theme: Theme) => void>} */
  const listeners = new Set();
  /** @param {Theme} theme */
  const apply = (theme) => {
    root.dataset.theme = theme;
    for (const listener of listeners) listener(theme);
  };

  media?.addEventListener('change', () => {
    if (!saved()) apply(resolve());
  });
  apply(resolve());

  return {
    /** @returns {Theme} */
    get: () => /** @type {Theme} */ (root.dataset.theme),
    /** @param {Theme} theme */
    set(theme) {
      try {
        storage?.setItem(THEME_KEY, theme);
      } catch {
        // Not persisted; still applied for this session.
      }
      apply(theme);
    },
    toggle() {
      this.set(this.get() === 'dark' ? 'light' : 'dark');
    },
    /** @param {(theme: Theme) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
