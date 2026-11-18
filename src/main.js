// Entry point: wire state, theme and UI, with a top-level error boundary.

import { SERVICE_WORKER_URL } from './build-env.js';
import { installGuidance } from './lib/install.js';
import { createStore } from './lib/store.js';
import { hasTimeZoneSupport } from './lib/timezones.js';
import { registerServiceWorker } from './lib/updates.js';
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

/** navigator.serviceWorker, or undefined where it is missing or access throws. */
function serviceWorkerContainer() {
  try {
    return navigator.serviceWorker ?? undefined;
  } catch {
    return undefined;
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
    const installKind = installGuidance({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      // Safari-only, non-standard.
      navigatorStandalone: /** @type {{ standalone?: boolean }} */ (navigator).standalone === true,
    });
    const app = mountApp(root, { store, theme, installKind });
    // Save before the page goes away, and follow other tabs' writes.
    window.addEventListener('pagehide', () => store.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') store.flush();
    });
    window.addEventListener('storage', (event) => store.handleStorageEvent(event));
    // Production builds only: offline support, with an update banner when a new build waits.
    window.addEventListener('load', () => {
      registerServiceWorker({
        container: serviceWorkerContainer(),
        url: SERVICE_WORKER_URL,
        onUpdateReady: (apply) => app.showUpdate(apply),
        reload: () => location.reload(),
      });
    });
  }
} catch {
  mountFatalError(root, strings.fatal.startFailed);
}
