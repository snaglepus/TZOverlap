// Entry point: wire state, theme and UI, with a top-level error boundary.

import { createStore } from './lib/store.js';
import { hasTimeZoneSupport } from './lib/timezones.js';
import { mountApp, mountFatalError } from './ui/app.js';
import { strings } from './ui/strings.js';
import { createTheme } from './ui/theme.js';

/** localStorage, or undefined where access throws (sandboxed iframes, some private modes). */
function safeStorage() {
  try {
    const storage = window.localStorage;
    storage.getItem('');
    return storage;
  } catch {
    return undefined;
  }
}

function zoneSuggestions() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

const root = /** @type {HTMLElement} */ (document.getElementById('app'));

try {
  if (!hasTimeZoneSupport()) {
    mountFatalError(root, strings.fatal.noTimeZones);
  } else {
    const persist = navigator.storage?.persist ? () => navigator.storage.persist() : undefined;
    const store = createStore({ storage: safeStorage(), persist });
    const theme = createTheme({
      root: document.documentElement,
      store,
      media: window.matchMedia('(prefers-color-scheme: dark)'),
    });
    mountApp(root, { store, theme, suggestions: zoneSuggestions() });
    // Save before the page goes away, and follow other tabs' writes.
    window.addEventListener('pagehide', () => store.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') store.flush();
    });
    window.addEventListener('storage', (event) => store.handleStorageEvent(event));
  }
} catch {
  mountFatalError(root, strings.fatal.startFailed);
}
