# AGENTS.md

Guide for humans and coding agents working on TZ Overlap. Features land one PR
at a time through an automated pipeline, so every PR must leave
`npm run check` green.

## What this is and who it's for

TZ Overlap is a lightweight, client-side-only web app for people who schedule
across time zones: distributed teams, people with friends and family abroad,
and anyone booking a call with several regions. It shows the user's own time
zone plus up to seven others as horizontal, scrollable timelines aligned on the
same moment. The timelines open on yesterday to tomorrow of a chosen date
(today by default, picked in the toolbar) and load more days as you scroll, up
to 14 either side. A heat scale shows which hours are ideal, acceptable (the shoulder
hours) or unacceptable in each zone, and an Everyone row at the bottom shows the
overlap and says its answer ("Best 10:00–17:00", "No shared hours"). When the
date has no slot the filter allows (under All: no Best or Good slot), a
no-overlap message offers the next day that works.
Rows can be dragged into a new order by their grab handle (on phones it shows
in Edit mode only; a long press anywhere on the header works on touch), or
moved with Move up / Move down in the row's popover.
An Edit button in the Timelines card turns on Edit mode (in memory only): every
user row shows a Delete button and an enlarged grab handle for quick tidying.
Settings → Install, a one-time install hint and a one-time iOS sheet explain how
to install it as an app (`src/lib/install.js`, `src/ui/install.js`).

On phones (below 40rem) the title bar is a slim app bar (the name and a
Settings gear) and the toolbar is one row fixed to the bottom: a compact date
button ("Today · Wed 18 Nov", opening the native picker), Now and All / Good /
Best. From 40rem the toolbar sits in the title bar with Today, the 24-hour
toggle (from 64rem) and its own Settings gear.

Clicking, tapping or pressing Enter on a slot selects it (snapped to 15
minutes, `settings.defaultDuration` long): an outlined band crosses every row,
each row header shows that zone's selected time, and a selection bar gives the
date, home time range and rating, with × or Esc to clear. Selection state and
its derived per-zone times and ratings are pure lib modules
(`src/lib/selection.js`, `src/lib/selection-details.js`).

Planned next: share a proposal link for the selected slot, and export it to a
calendar.

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

**Deploying.** Pushes to `main` deploy to GitHub Pages once CI passes
(`.github/workflows/deploy.yml`); it can also be run by hand from the Actions
tab. One-off setup: in the repo's Settings → Pages, set Source to "GitHub
Actions". Any other static host works too: serve `dist/` over HTTPS.

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
| Performance              | `npm run test:perf`        | gzip size, LCP/CLS and clock-tick scripting budgets on a production build on `PERF_PORT` (4174) |
| **Everything, in order** | **`npm run check`**        | lint → format → typecheck → unit → integration → build → e2e → perf                             |

To fix formatting, run `npm run format`. This is the only script that writes
files. `npm test` runs just the four test layers.

Budgets live in `perf-budget.json`. If a PR has to raise one, say why in the PR.
`clockTick.scriptMs` (4) caps the median scripting time of one minute tick with
8 rows (PRD 10.1), measured by `tests/perf/tick.spec.js`.
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
    grid.js             grid model: anchor-date window (a day either side, extended up to 14),
                        anchor and extension helpers, positioned hour cells, Everyone segments
    time-format.js      formatTime() compact/full in 12- or 24-hour; resolves `auto` from the locale
    suitability.js      bands and heat constants; 15-minute slot ratings, heat distance, overlap, meeting rating, weekend rule
    filter.js           All / Good / Best filter: qualifies(), greyedSpans() (masks by instant),
                        daySlots() (a date's rated slots), dayQualifies() (under All: any Best
                        or Good slot) and nextQualifyingDay() (the no-overlap message's search)
    everyone-summary.js everyoneSummary(), summariseSlots(), summaryText(): the Everyone row's
                        summary line (longest Best, else Good, run of the anchor date)
    weekends.js         country-to-weekend map
    store.js            versioned state (zones, settings, meta): validated load, legacy-key
                        migration, debounced save via injected Storage, cross-tab sync
    updates.js          registerServiceWorker(): registration and the update-ready handshake
    city-data.js        loadCityData(): cached dynamic import() of data/cities.js;
                        cityDataIfLoaded(): the data once loaded, else null
    row-header.js       row header text: names, day difference, dates, abbreviation and offset line;
                        anchorShortDate() (the phone date button's "Wed 18 Nov")
    search.js           zone search: fixed offsets, abbreviations, cities, IANA IDs
    dst.js              DST badges status, clock changes between dates, banner sentences
    home.js             device-zone tracker: decides home changes, lastHomeTz saves and the travel toast
    row-order.js        Move up / Move down and drag to reorder: store.move index and position
                        among shown user rows; dropIndex() (drop position), rowShift() (rows
                        pushed aside), dropTarget() (store.move index for a drop);
                        deleteFocusTarget() (the row focused after an Edit-mode delete)
    scroll.js           timeline scroll maths: now-line position, Now target, wheel and arrow-key steps,
                        instantAt() and CLICK_SLOP_PX for click-to-select; edgeScrollStep() (page
                        auto-scroll while dragging a row) and the gesture constants (LONG_PRESS_MS,
                        LONG_PRESS_SLOP_PX, HAPTIC_MS)
    selection.js        selection state: snapToSlot(), createSelection(), createSelectionState()
    selection-details.js
                        describeSelection(): per-zone local times and ratings of a selection;
                        selectionSummary() (bar text) and slotLabel() (focused-slot name)
    install.js          installGuidance(): user agent + standalone flags → install guidance kind
  ui/
    dom.js              h() element builder (textContent only, never innerHTML)
    components.js       shared components: button, icon, field, dateField, card, appShell,
                        emptyState, errorState, sheet, popover, createToaster (toast), createBanner,
                        radioGroup, segmentedControl, switchControl
    theme.js            light/dark controller
    app.js              the timelines page: grid, Add city button, first-run prompt, limit note,
                        the toolbar, the date control and its short date, the two Settings gears
                        (app bar below 40rem, toolbar from it) and focus after a layout change;
                        the All / Good / Best filter (toolbar, keys 1/2/3) and the no-overlap message;
                        the selection state, selection bar and Esc to clear; announce(), the
                        one writer of the polite live region (one batched write per action,
                        with the Everyone summary when it or the filter changed);
                        Edit mode (Edit / Done button, delete and handle focus, auto end, Esc order);
                        re-checks the home zone on launch, focus, visibility and each minute
    add-city.js         the Add city sheet: lazy city data, popular list, search, duplicates
    grid.js             timeline grid DOM (role="grid"), header clocks, scrolling inputs, now line,
                        lazy extension (IntersectionObserver), row actions popover
                        (Change, Move up, Move down, Delete); click/tap selection, the selection
                        band, header selected times, roving home-cell keyboard slots,
                        user rows' drag handles; the Everyone row last, with its summary line
                        (setSummary()); Edit mode (data-editing, setEditing()):
                        each user row's Delete button, focusDelete()
    reorder.js          drag to reorder user rows: Pointer Events with pointer capture, handle
                        drag and touch long press, lifted row and shifts, edge auto-scroll, cancel
    settings.js         the Settings sheet: Appearance, Time format (settings.hourCycle),
                        Treat weekends as unavailable, Install and Reset all data
    install.js          install guidance: beforeinstallprompt capture, hint card, iOS sheet,
                        Settings → Install section
    selection-bar.js    selectionBar(): the selected time range, rating in words and clear button
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
  e2e/                  Playwright specs (*.spec.js); production-build.js serves a build per test;
                        responsive.spec.js: the viewport, text size, theme and preference matrix;
                        persistence.spec.js: the AC-4 reload journey
  perf/                 budget.test.js (size) + vitals.spec.js (LCP/CLS) + tick.spec.js (clock tick)
DESIGN.md               design system: the source of truth for UI
perf-budget.json        performance budgets (city data has its own cityData budget; clockTick for the minute tick)
playwright.config.js    e2e config;  playwright.perf.config.js: perf config
.github/workflows/ci.yml  runs npm run check on every push and PR
.github/workflows/deploy.yml
                        builds dist/ and deploys it to GitHub Pages after CI passes on main
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
