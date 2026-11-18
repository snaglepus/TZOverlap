# TZ Overlap — Design System

This is the source of truth for how TZ Overlap looks and behaves. Read it before
any UI change. If you need something it does not cover, update this file in the
same PR as the code.

## 1. Aesthetic direction: "quiet instrument"

TZ Overlap should feel like a well-made railway timetable or a lab instrument:
calm, precise, legible at a glance, and trustworthy with numbers.

- **Paper and ink.** Warm off-white paper in light mode, deep graphite in dark
  mode. Text is ink, not pure black or white.
- **Colour means something.** Colour is reserved for _meaning_: the heat scale
  for hour suitability, the accent for the single primary action and focus, and
  red for errors. Chrome (borders, surfaces, headers) stays neutral.
- **Numbers are the hero.** Clock times use tabular numerals in a monospace
  stack so columns line up exactly across zones.
- **Flat, with structure from lines.** Hairline borders and spacing create
  structure; shadows are subtle and only lift cards off the page.
- **No decoration for its own sake.** No gradients, illustrations, glassmorphism
  or emoji in UI. Motion is short and functional.
- **Nothing third-party.** System fonts only; no web fonts, icon fonts, CDNs or
  analytics. Icons, if needed, are inline SVG using `currentColor`. The
  exception is the app/home-screen icons in `src/icons/`: PNGs generated from
  `--color-accent` and `--color-on-accent` by `scripts/make-icons.js`.
  Regenerate them (`node scripts/make-icons.js`) whenever those tokens change.

## 2. Where tokens live

All design tokens are CSS custom properties in **`src/styles/tokens.css`**.
That is the only file allowed to contain raw colours, lengths or durations.
`npm run lint` runs `scripts/lint-tokens.js`, which fails the build if any other
CSS, JS or HTML file under `src/` contains a hard-coded colour, length or
duration, an inline `style` attribute, or an `@media` width that is not a
documented breakpoint.

Stylesheet layout (`src/styles/main.css` imports them in this order):

| File             | Contains                                                       |
| ---------------- | -------------------------------------------------------------- |
| `tokens.css`     | Every token, light theme defaults and dark theme overrides     |
| `base.css`       | Reset, document typography, focus style, utility classes       |
| `components.css` | Shared components (§6). One block per component                |
| `app.css`        | Page-specific layout (timeline grid, legend). Uses tokens only |

## 3. Design tokens

### 3.1 Colour (semantic, themed)

Components use only these semantic names, never a raw value. Values are in
`tokens.css`; both themes define every name.

| Token                                   | Role                                            | Light                 | Dark                  |
| --------------------------------------- | ----------------------------------------------- | --------------------- | --------------------- |
| `--color-bg`                            | Page background ("paper")                       | `#F6F4EF`             | `#121316`             |
| `--color-surface`                       | Cards, inputs                                   | `#FFFFFF`             | `#1B1D22`             |
| `--color-surface-sunken`                | Wells: timeline track, row headers, empty state | `#EFECE5`             | `#0D0E10`             |
| `--color-border`                        | Hairlines, dividers                             | `#D9D4CA`             | `#34373F`             |
| `--color-border-strong`                 | Input borders (≥3:1 against surface)            | `#7D776C`             | `#7C808C`             |
| `--color-text`                          | Body text                                       | `#1D1B18`             | `#ECEAE6`             |
| `--color-text-muted`                    | Secondary text, help text, offsets              | `#5F5A52`             | `#A8A49C`             |
| `--color-accent`                        | Primary button fill, links, current-hour marker | `#2F45B5`             | `#9DB0FF`             |
| `--color-accent-hover`                  | Primary button hover                            | `#23369A`             | `#B9C7FF`             |
| `--color-on-accent`                     | Text on accent fill                             | `#FFFFFF`             | `#0E1440`             |
| `--color-focus`                         | Focus ring                                      | `#2F45B5`             | `#9DB0FF`             |
| `--color-danger`                        | Error text, error icon, invalid input border    | `#B42318`             | `#FF9C8F`             |
| `--color-danger-surface`                | Error state background                          | `#FDECEA`             | `#3A1512`             |
| `--color-danger-border`                 | Error state border                              | `#F1B5AE`             | `#7A2B22`             |
| `--color-heat-4` / `--color-heat-ink-4` | Ideal hours (09–17)                             | `#CDEBDD` / `#0F3D2E` | `#1F5A44` / `#D8F5E8` |
| `--color-heat-3` / `--color-heat-ink-3` | Near shoulder (08, 17)                          | `#F6E7B0` / `#4A3700` | `#5A4F1E` / `#FBEFC4` |
| `--color-heat-2` / `--color-heat-ink-2` | Shoulder (07, 18)                               | `#F5CB8E` / `#4A2600` | `#6B4316` / `#FFE2BD` |
| `--color-heat-1` / `--color-heat-ink-1` | Far shoulder (19–20)                            | `#EFA98A` / `#4A1606` | `#6E2E1C` / `#FFD9CB` |
| `--color-heat-0` / `--color-heat-ink-0` | Unacceptable (21–06)                            | `#E4E2EA` / `#3A3842` | `#24232A` / `#B9B6C4` |
| `--color-heat-hatch`                    | Diagonal hatch over unacceptable slots          | `#CBC8D3`             | `#34323C`             |

**Heat scale.** Scores come from `src/lib/hours.js` (4 = ideal … 0 =
unacceptable). Legend bands: _ideal_ = 4, _acceptable_ = 1–3 (the shoulder heat
map), _unacceptable_ = 0. Colour is never the only cue (WCAG 1.4.1): every slot
shows its local hour as text, unacceptable slots carry a diagonal hatch, ideal
slots are bold, and every slot has a text band name for assistive tech.

### 3.2 Typography

| Token                                                | Value                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `--font-sans`                                        | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--font-mono`                                        | `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`              |
| `--font-size-xs` / `sm` / `md` / `lg` / `xl` / `2xl` | `0.8125` / `0.875` / `1.0625` / `1.25` / `1.5` / `2rem`                             |
| `--line-height-tight` / `--line-height-base`         | `1.2` / `1.5`                                                                       |
| `--font-weight-regular` / `medium` / `bold`          | `400` / `500` / `650`                                                               |

Usage: page title `2xl` bold; card titles `lg` bold; body `md`; help text,
offsets and legend `sm` muted; slot hours `sm` in `--font-mono` with
`font-variant-numeric: tabular-nums`. Never go below `xs`, and only use `xs` for
non-essential annotations (day-shift markers). Sentence case everywhere.

Phone minimums: body text 17px (`md`, 1.0625rem); hour labels and secondary
text at least 13px, so `xs` (0.8125rem) is the floor; nothing below 11px. All
sizes in rem.

### 3.3 Spacing (4px grid)

`--space-0` 0 · `--space-1` 0.25rem · `--space-2` 0.5rem · `--space-3` 0.75rem
· `--space-4` 1rem · `--space-5` 1.5rem · `--space-6` 2rem · `--space-7` 3rem ·
`--space-8` 4rem. Component padding uses 3–5; gaps between cards use 5; page
gutters use 4 on small screens and 6 above `--bp-md`.

### 3.4 Radius, borders, shadow

| Token                                        | Value         | Use                          |
| -------------------------------------------- | ------------- | ---------------------------- |
| `--radius-sm`                                | `0.25rem`     | Timeline slots, badges       |
| `--radius-md`                                | `0.5rem`      | Buttons, inputs              |
| `--radius-lg`                                | `0.75rem`     | Cards, empty/error states    |
| `--radius-pill`                              | `999px`       | Legend swatches              |
| `--border-width`                             | `1px`         | All borders                  |
| `--focus-ring-width` / `--focus-ring-offset` | `3px` / `2px` | Focus outline                |
| `--shadow-sm`                                | themed        | Cards                        |
| `--shadow-md`                                | themed        | Reserved for future popovers |

### 3.5 Motion

`--duration-fast` 120ms (hover, press), `--duration-base` 200ms (theme change,
state reveal), `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`. Only animate
colour, opacity and transform. Under `prefers-reduced-motion: reduce` both
durations become `0ms` (handled in `tokens.css`).

### 3.6 Layout sizes

`--content-max-width` 72rem · `--control-height` 2.75rem (44px touch target) ·
`--slot-width` 3rem · `--slot-height` 2.75rem · `--row-header-width` 12rem ·
`--row-header-width-compact` 7.5rem · `--control-height-sm` 2rem ·
`--icon-size` 1.25rem · `--min-viewport-height` 100dvh · `--hatch-size` 6px ·
`--hairline` 1px (sub-pixel geometry such as the visually-hidden utility).

### 3.7 Other

`--letter-spacing-tight` -0.02em (page title only) · `--opacity-disabled` 0.55
(disabled buttons) · `--measure` 65ch (max prose line length).

## 4. Themes

- Light is the default. Dark is defined by overriding the colour and shadow
  tokens only; no component has theme-specific CSS.
- Selection order: saved preference (`localStorage["tz-overlap:theme"]`) →
  operating-system preference (`prefers-color-scheme`) → light.
- `src/theme-init.js` runs synchronously in `<head>` and sets
  `<html data-theme="light|dark">` before first paint so there is no flash.
  `tokens.css` also applies dark tokens via `prefers-color-scheme` when no
  `data-theme` is set (no-JS fallback).
- The theme toggle is a ghost button in the app shell header with
  `aria-pressed` reflecting "dark theme on". Choosing a theme saves it; without a
  saved choice the app follows OS changes live.
- `color-scheme` is set per theme so native controls and scrollbars match.

## 5. Typography rules

- System font stacks only (see §3.2). No `@font-face`.
- One `<h1>` per page (the app name in the shell). Card titles are `<h2>`.
- Clock times, offsets and hour numbers: `--font-mono` + tabular numerals.
- Max line length for prose: 65ch.
- All user-visible text lives in `src/ui/strings.js` (en-AU), never inline.

## 6. Shared components

Implemented as CSS classes in `src/styles/components.css` with DOM factory
functions in `src/ui/components.js`. Build UI from these; do not restyle them
ad hoc in `app.css`. Do not add a component without adding it here.

### Button — `button()` · `.btn`

Variants: `primary` (accent fill: the one main action in a view, e.g. "Add
zone"), `secondary` (bordered surface: other actions such as "Try again"),
`ghost` (no border: toolbar and in-row actions, e.g. theme toggle, remove zone).
Size `sm` for in-row actions only; `sm` buttons still meet a 24px minimum target
(WCAG 2.5.8). Always a real `<button>` with a text label; icon-only buttons need
`aria-label`. Disabled buttons use the `disabled` attribute, not just a class.

### Input — `field()` · `.field`, `.input`

Text input with a visible `<label>`, optional help text and an error message
slot. Errors set `aria-invalid="true"` and are linked with `aria-describedby`;
the error text is in a polite live region. Use for every text entry. Supports a
`<datalist>` of suggestions.

### Card — `card()` · `.card`

Surface with `--radius-lg`, hairline border and `--shadow-sm`. Has an `<h2>`
title and a body. Use to group one task or one view (e.g. "Add a time zone",
"Timelines"). Do not nest cards.

### App shell — `appShell()` · `.shell`

Page frame: skip link, header (app name as `<h1>`, tagline, actions slot for the
theme toggle), `<main id="main">` constrained to `--content-max-width`, footer.
Every page renders inside exactly one shell.

### Empty state — `emptyState()` · `.empty-state`

Sunken, dashed-border panel with a title, one sentence of guidance and an
optional action. Use when a view is valid but has nothing to show yet (e.g. no
zones added besides your own). Never use it for failures.

### Error state — `errorState()` · `.error-state`

Danger-tinted panel with `role="alert"`, a title saying what failed, one
sentence on what the user can do, and an optional "Try again" secondary button.
Use when a view or the whole app cannot render (e.g. the browser lacks time zone
support). For a single bad input value, use the Input error message instead.

## 7. Layout and breakpoints

Mobile first. Breakpoints are fixed values because `@media` cannot read custom
properties; `tokens.css` records them as `--bp-md` and `--bp-lg` for reference
and `scripts/lint-tokens.js` rejects any other width in a media query.

| Name      | Min width | Changes                                                                 |
| --------- | --------- | ----------------------------------------------------------------------- |
| base      | 0         | Single column, `--space-4` gutters, compact row headers                 |
| `--bp-md` | `40rem`   | `--space-6` gutters, full row headers, add-zone field and button inline |
| `--bp-lg` | `64rem`   | Content capped at `--content-max-width` and centred                     |

The timeline scrolls horizontally inside its own focusable region; the zone
row headers stay sticky on the left. The page itself never scrolls sideways.

## 8. Accessibility rules (WCAG 2.2 AA)

- **Contrast.** Text ≥ 4.5:1 against its background (≥ 3:1 for text ≥ 1.5rem
  or bold ≥ 1.2rem); UI component boundaries and the focus ring ≥ 3:1.
  `tests/unit/contrast.test.js` checks every token pair in both themes; add new
  pairs there when you add colour tokens.
- **Visible focus.** Every interactive element shows a `--focus-ring-width`
  outline in `--color-focus` with `--focus-ring-offset` on `:focus-visible`.
  Never remove outlines without this replacement.
- **Keyboard.** Everything is reachable and operable by keyboard in a logical
  order. The skip link is the first focusable element. Scrollable regions are
  focusable (`tabindex="0"`) and labelled. Forms submit with Enter.
- **Semantic HTML.** Landmarks (`header`, `main`, `footer`), one `h1`, real
  `button`/`label`/`input`/`table` elements. The timeline is a `<table>` with
  row headers; ARIA only where HTML has no equivalent.
- **Not colour alone.** See the heat scale rules in §3.1.
- **Announcements.** Field errors and zone additions/removals are announced
  through polite live regions; error states use `role="alert"`.
- **Motion.** Respect `prefers-reduced-motion` (tokens collapse durations).
- **Automated check.** E2E tests run axe-core against the page in both themes
  and fail on any WCAG A/AA violation.
