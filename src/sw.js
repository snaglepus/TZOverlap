// Service worker, production builds only: cache-first app shell for offline use.
// Built by scripts/build.js into a self-contained classic script, with the cache
// name and pre-cache list generated from the build output. It answers only
// requests for pre-cached files, never makes a request of its own beyond the
// install-time pre-cache, and only takes over when the page asks (SKIP_WAITING).

import { CACHE_NAME, PRECACHE_URLS } from './sw-manifest.js';

// The `webworker` lib conflicts with `dom`, so the worker types are local.
/**
 * @typedef {Event & { waitUntil(promise: Promise<unknown>): void }} LifecycleEvent
 * @typedef {LifecycleEvent & { request: Request, respondWith(response: Promise<Response>): void }} RequestEvent
 * @typedef {LifecycleEvent & { data: unknown }} WorkerMessageEvent
 * @typedef {{
 *   location: Location,
 *   skipWaiting(): Promise<void>,
 *   addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEvent) => void): void,
 *   addEventListener(type: 'fetch', listener: (event: RequestEvent) => void): void,
 *   addEventListener(type: 'message', listener: (event: WorkerMessageEvent) => void): void,
 * }} WorkerScope
 */

const worker = /** @type {WorkerScope} */ (/** @type {unknown} */ (self));
const CACHE_PREFIX = 'tzoverlap-';

/** Absolute URL of the cached copy, by URL path. */
const cachedByPath = new Map(
  PRECACHE_URLS.map((url) => {
    const absolute = new URL(url, worker.location.href);
    return [absolute.pathname, absolute.href];
  }),
);
const scopeRoot = new URL('./', worker.location.href);
const indexUrl = new URL('./index.html', worker.location.href);

worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))),
      ),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

worker.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scopeRoot.origin) return;
  const isShell =
    request.mode === 'navigate' &&
    (url.pathname === scopeRoot.pathname || url.pathname === indexUrl.pathname);
  const key = isShell ? indexUrl.href : cachedByPath.get(url.pathname);
  // Anything not pre-cached is left to the browser.
  if (!key) return;
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(key))
      .then((response) => response ?? Response.error()),
  );
});

worker.addEventListener('message', (event) => {
  const data = /** @type {{ type?: unknown } | null} */ (event.data);
  if (data?.type === 'SKIP_WAITING') worker.skipWaiting();
});
