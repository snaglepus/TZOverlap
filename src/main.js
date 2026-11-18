// Entry point: wire state, theme and UI, with a top-level error boundary.

import { createStore } from './lib/store.js';
import { getLocalTimeZone, hasTimeZoneSupport } from './lib/timezones.js';
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
    const storage = safeStorage();
    const theme = createTheme({
      root: document.documentElement,
      storage,
      media: window.matchMedia('(prefers-color-scheme: dark)'),
    });
    const store = createStore({ localZone: getLocalTimeZone(), storage });
    mountApp(root, { store, theme, suggestions: zoneSuggestions() });
  }
} catch {
  mountFatalError(root, strings.fatal.startFailed);
}
