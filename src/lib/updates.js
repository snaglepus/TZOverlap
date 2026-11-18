// Service worker registration and the "update ready" handshake. DOM-free: the
// container (navigator.serviceWorker) and reload are passed in. A missing API
// or a failed registration changes nothing: the app keeps working online.

/**
 * @typedef {{
 *   state: string,
 *   postMessage(message: unknown): void,
 *   addEventListener(type: 'statechange', listener: () => void): void,
 * }} WorkerLike
 * @typedef {{
 *   waiting: WorkerLike | null,
 *   installing: WorkerLike | null,
 *   addEventListener(type: 'updatefound', listener: () => void): void,
 * }} RegistrationLike
 * @typedef {{
 *   controller: unknown,
 *   register(url: string): Promise<RegistrationLike>,
 *   addEventListener(type: 'controllerchange', listener: () => void): void,
 * }} ContainerLike
 */

/**
 * Register the worker and offer an update once a new one is waiting. The new
 * worker takes over only after `apply()`, and only then does this page reload.
 * @param {{
 *   container: ContainerLike | undefined,
 *   url: string | null,
 *   onUpdateReady: (apply: () => void) => void,
 *   reload: () => void,
 * }} options
 * @returns {Promise<void>} settles once registration has succeeded or failed
 */
export function registerServiceWorker({ container, url, onUpdateReady, reload }) {
  if (!container || !url) return Promise.resolve();
  let applied = false;
  let offered = false;
  let reloaded = false;

  function reloadOnce() {
    if (reloaded) return;
    reloaded = true;
    reload();
  }

  // A controller change started by another tab never reloads this page.
  container.addEventListener('controllerchange', () => {
    if (applied) reloadOnce();
  });

  return Promise.resolve()
    .then(() => container.register(url))
    .then(
      (registration) => {
        // No controller means a first install: nothing to update from.
        const offer = () => {
          if (offered || !container.controller) return;
          offered = true;
          onUpdateReady(() => {
            applied = true;
            const waiting = registration.waiting;
            if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
            else reloadOnce();
          });
        };
        if (registration.waiting) offer();
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') offer();
          });
        });
      },
      () => {},
    );
}
