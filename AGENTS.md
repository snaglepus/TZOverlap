# AGENTS.md

Guide for humans and coding agents working on TZ Overlap. Features land one PR
at a time through an automated pipeline, so every PR must leave
`npm run check` green.

## What this is and who it's for

TZ Overlap is a lightweight, client-side-only web app for people who schedule
across time zones: distributed teams, people with friends and family abroad,
and anyone booking a call with several regions. It shows the user's own time
zone plus up to seven others as horizontal, scrollable timelines aligned on the
same moment. A heat scale shows which hours are ideal, acceptable (the shoulder
hours) or unacceptable in each zone, and an "All zones" row shows the overlap.

Planned next: select a slot to see the exact local time in every zone, share a
proposal link, and export to a calendar.

**Hard constraints**

- Static files only. No back end, no API calls, no third-party requests at
  runtime: no web fonts, CDNs, analytics or beacons. The CSP in
  `src/index.html` and `scripts/serve.js` enforces `default-src 'self'`.
  ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and
  `navigator.sendBeacon` in `src/`. E2E fails on any non-first-party request.
- Vanilla HTML, CSS and JavaScript (ES modules). No runtime dependencies. npm
  packages are dev tooling only.
- Types come from JSDoc and are checked by `tsc`. There is no TypeScript source
  and nothing is emitted.

## Setup from a fresh checkout

Requires Node.js 22 or newer (`.nvmrc` pins 22) and npm.

```sh
git clone https://github.com/snaglepus/TZOverlap.git
cd TZOverlap
nvm use              # optional, picks Node 22 from .nvmrc
npm ci               # dev tooling only
npm run setup:browsers   # headless Chromium for Playwright (one-off, ~100 MB)
cp .env.example .env     # optional; defaults work without it
npm run check            # everything should pass
```

On Linux CI images, use `npx playwright install --with-deps --only-shell chromium`
to also get system libraries.

## Running the app

```sh
npm run dev                    # serves src/ on PORT (default 5173)
PORT=8080 npm run dev          # port from the environment
npm run dev -- --port 8080     # port from a flag (wins over env and .env)
npm run preview                # production build, served from dist/
```

Config is read by `config/env.js`. Precedence: CLI flag > environment variable

> `.env` > default. Variables are documented in `.env.example`: `PORT`, `HOST`,
> `SERVE_DIR`, `BUILD_OUT_DIR`. `PORT=0` picks a free port.

**Service worker.** Only production builds register one (`npm run preview`,
the perf tests); dev from `src/` has none. A worker installed by
`npm run preview` keeps controlling that origin, so before running
`npm run dev` on the same port, unregister it in DevTools (Application >
Service workers) or use another port.

## Checks

Each command is headless and non-interactive, exits non-zero on failure, and
never rewrites files.

| Check                    | Command                    | What it does                                                                                    |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- |
| Lint                     | `npm run lint`             | ESLint, then `scripts/lint-tokens.js` (no raw colours, sizes or durations outside `tokens.css`) |
| Format                   | `npm run format:check`     | Prettier `--check`                                                                              |
| Typecheck                | `npm run typecheck`        | `tsc` strict, JSDoc-checked JS, `--noEmit`                                                      |
| Unit tests               | `npm run test:unit`        | `node --test tests/unit`                                                                        |
| Integration tests        | `npm run test:integration` | `node --test tests/integration`: real module wiring, Storage double, local HTTP server          |
| Production build         | `npm run build`            | esbuild bundle and minify into `dist/`                                                          |
| End-to-end tests         | `npm run test:e2e`         | Playwright, headless Chromium, dev server on `E2E_PORT` (default 4173), axe-core WCAG AA        |
| Performance              | `npm run test:perf`        | gzip size budget plus LCP/CLS budget on a production build served on `PERF_PORT` (default 4174) |
| **Everything, in order** | **`npm run check`**        | lint → format → typecheck → unit → integration → build → e2e → perf                             |

To fix formatting, run `npm run format`. This is the only script that writes
files. `npm test` runs just the four test layers.

Budgets live in `perf-budget.json`. If a PR has to raise one, say why in the PR.
The lazily loaded city data (`dist/data/cities.js`) has its own `cityData`
budget and is not counted in the `js` or `total` shell budgets.

## Where things live

```
src/                    the app (served as-is in dev; bundled for prod)
  index.html            entry page, CSP meta, manifest link, theme-color and iOS home-screen tags
  manifest.webmanifest  web app manifest (name, display, theme colours, icons)
  icons/                app/home-screen PNGs, generated by `scripts/make-icons.js`; run
                        `node scripts/make-icons.js` after changing accent tokens
  main.js               boot: wires store, theme and UI; top-level error boundary;
                        registers the service worker on load (production builds only)
  build-env.js          SERVICE_WORKER_URL: null in src/, './sw.js' in production builds
  sw.js                 service worker: cache-first pre-cache of the build, SKIP_WAITING on request
  sw-manifest.js        placeholder CACHE_NAME and PRECACHE_URLS, generated by the build
  theme-init.js         sets data-theme before first paint (classic script)
  data/
    cities.js           curated city and abbreviation data, lazy-loaded; never fetched or downloaded
  lib/                  pure logic, no DOM: unit-test it
    timezones.js        Intl-based tz primitives (validation, offsets, formatting)
    zones.js            zone model: iana/fixed zones, offsets, labels, equality, fixed-offset parser
    time-engine.js      offset transitions, zone gaps, per-zone hour cells, DST status
    grid.js             grid model: home yesterday–tomorrow window, positioned hour cells, Everyone segments
    suitability.js      bands and heat constants; 15-minute slot ratings, heat distance, overlap, meeting rating, weekend rule
    weekends.js         country-to-weekend map
    store.js            versioned state (zones, settings, meta): validated load, legacy-key
                        migration, debounced save via injected Storage, cross-tab sync
    updates.js          registerServiceWorker(): registration and the update-ready handshake
    city-data.js        loadCityData(): cached dynamic import() of data/cities.js;
                        cityDataIfLoaded(): the data once loaded, else null
    row-header.js       row header text: names, day difference, dates, abbreviation and offset line
    search.js           zone search: fixed offsets, abbreviations, cities, IANA IDs
    home.js             device-zone tracker: decides home changes, lastHomeTz saves and the travel toast
  ui/
    dom.js              h() element builder (textContent only, never innerHTML)
    components.js       shared components: button, icon, field, card, appShell, emptyState,
                        errorState, sheet, popover, createToaster (toast), createBanner, radioGroup
    theme.js            light/dark controller
    app.js              the timelines page; re-checks the home zone on launch, focus, visibility and each minute
    grid.js             timeline grid DOM (role="grid"), header clocks
    settings.js         the Settings sheet: Appearance and Reset all data
    strings.js          all user-visible text (en-AU), short/long variants
  styles/
    tokens.css          ALL design tokens (the only place for raw values)
    base.css, components.css, app.css, main.css
config/env.js           env/flag/.env config loader
scripts/
  serve.js              zero-dependency static server (dev + preview)
  build.js              production build; generates sw.js, its pre-cache list and
                        content-hashed cache name (tzoverlap-<hash>)
  make-icons.js         generates src/icons/ from the accent tokens (run by hand)
  lint-tokens.js        design-token enforcement
  check-cities.js       validates src/data/cities.js; run `node scripts/check-cities.js`
                        after editing the data
tests/
  unit/                 node:test, pure modules + contrast + token linter
  integration/          node:test, store↔storage↔timeline, config↔server over HTTP
  e2e/                  Playwright specs (*.spec.js); production-build.js serves a build per test
  perf/                 budget.test.js (size) + vitals.spec.js (LCP/CLS)
DESIGN.md               design system: the source of truth for UI
perf-budget.json        performance budgets (city data has its own cityData budget)
playwright.config.js    e2e config;  playwright.perf.config.js: perf config
.github/workflows/ci.yml  runs npm run check on every push and PR
```

## Design and UI rules

**Read DESIGN.md before any UI change. Use the tokens and shared components;
don't add new ones without updating DESIGN.md.**

- Tokens live in `src/styles/tokens.css`. `npm run lint` fails on hard-coded
  colours, lengths or durations anywhere else in `src/`, on inline styles, and
  on `@media` widths that aren't documented breakpoints.
- New colour token pairs go into `tests/unit/contrast.test.js`.
- Every UI change needs E2E coverage. The axe check must stay clean in both
  themes.

## Working conventions

- Put logic in `src/lib/` (pure, unit-tested) and keep `src/ui/` thin.
- Add tests at the right layer: unit for logic, integration for wiring between
  modules, E2E for user-visible behaviour. No placeholder tests.
- Make tests deterministic. E2E fixes the clock (`page.clock.setFixedTime`),
  the time zone and the locale. Don't depend on the machine's time zone.
- Never use `innerHTML` with user input. Build DOM with `h()`.
- User-visible text goes in `src/ui/strings.js`, never inline.
- Keep a PR to one feature. Run `npm run check` before pushing.

## Software factory

`/factory run` builds open GitHub issues and Linear issues labeled `factory`,
and `/factory add <feature>` builds one described in conversation, through
intake → spec → spec review (medium/high risk) → build → gate → review →
approve, one PR per ticket. State is in `factory/jobs/` (gitignored);
`factory/bin/job` is its only writer. Checks: `factory/checks.sh`. Dashboard:
`cd factory && python3 -m http.server`, then open
http://localhost:8000/dashboard.html (`#history` for the table of finished
jobs).

Each job works in its own git worktree at `.worktrees/<job-id>` (gitignored).
A tool run from the repo root that doesn't read `.gitignore` sees those copies
too; exclude `.worktrees/` in its config.

In this repo only Linear (team `TZO`) is enabled as a ticket source; GitHub
issues and chat are off in `factory/config.json`. `factory/checks.sh` installs
dependencies and the headless browser if missing, picks free `E2E_PORT` /
`PERF_PORT` values so parallel gates don't collide, then runs `npm run check`
(every layer: lint, format, typecheck, unit, integration, build, e2e, perf).
ESLint and Prettier already ignore `.worktrees/` and `factory/`.
