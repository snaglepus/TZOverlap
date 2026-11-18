// The service worker's build-time constants. This is a placeholder: the
// production build (scripts/build.js) replaces the whole module with the real
// cache name and pre-cache list. Source served from src/ never runs a worker.

/** Cache name, `tzoverlap-` plus a content hash of the build. */
export const CACHE_NAME = 'tzoverlap-dev';

/** @type {readonly string[]} every built file but sw.js, as `./<path>` */
export const PRECACHE_URLS = [];
