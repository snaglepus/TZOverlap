# TZ Overlap

See which hours work across up to eight time zones. TZ Overlap lays out your
time zone and up to seven others as aligned, colour-coded timelines that show
ideal, shoulder and unacceptable hours in each zone and across all of them.

It runs entirely in your browser: static files only, no back end, no
third-party requests.

## Setup

Requires Node.js 22+.

```sh
npm ci
npm run setup:browsers   # headless Chromium for the end-to-end tests
```

## Run

```sh
npm run dev                  # http://127.0.0.1:5173
PORT=8080 npm run dev        # or: npm run dev -- --port 8080
npm run build                # production build in dist/
npm run preview              # build, then serve dist/
```

Settings are listed in [`.env.example`](.env.example).

## Check

```sh
npm run check   # lint, format, typecheck, unit, integration, build, e2e, perf
```

See [AGENTS.md](AGENTS.md) for every command and the project layout, and
[DESIGN.md](DESIGN.md) for the design system.
