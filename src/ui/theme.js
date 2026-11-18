// Light/dark theme control — DESIGN.md §4.
// settings.theme ('light' | 'dark') > OS preference ('system') > light.
// Keep resolve() in sync with theme-init.js.

/**
 * @typedef {'light' | 'dark'} Theme
 * @typedef {'system' | Theme} ThemeSetting
 */

/**
 * @param {{
 *   root: HTMLElement,
 *   store: ReturnType<typeof import('../lib/store.js').createStore>,
 *   media?: Pick<MediaQueryList, 'matches' | 'addEventListener'>,
 * }} options
 */
export function createTheme({ root, store, media }) {
  /** @returns {Theme | null} */
  const saved = () => {
    const { theme } = store.getState().settings;
    return theme === 'light' || theme === 'dark' ? theme : null;
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
  const update = () => {
    const theme = resolve();
    if (root.dataset.theme !== theme) apply(theme);
  };

  media?.addEventListener('change', () => {
    if (!saved()) update();
  });
  // Store changes include a theme set in another tab.
  store.subscribe(update);
  apply(resolve());

  return {
    /** @returns {Theme} */
    get: () => /** @type {Theme} */ (root.dataset.theme),
    /** @param {ThemeSetting} theme */
    set(theme) {
      store.updateSettings({ theme });
    },
    /** @param {(theme: Theme) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
