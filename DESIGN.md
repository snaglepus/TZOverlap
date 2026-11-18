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

| Token                                           | Role                                            | Light                 | Dark                  |
| ----------------------------------------------- | ----------------------------------------------- | --------------------- | --------------------- |
| `--color-bg`                                    | Page background ("paper")                       | `#F6F4EF`             | `#121316`             |
| `--color-surface`                               | Cards, inputs                                   | `#FFFFFF`             | `#1B1D22`             |
| `--color-surface-sunken`                        | Wells: timeline track, row headers, empty state | `#EFECE5`             | `#0D0E10`             |
| `--color-border`                                | Hairlines, dividers                             | `#D9D4CA`             | `#34373F`             |
| `--color-border-strong`                         | Input borders (≥3:1 against surface)            | `#7D776C`             | `#7C808C`             |
| `--color-text`                                  | Body text                                       | `#1D1B18`             | `#ECEAE6`             |
| `--color-text-muted`                            | Secondary text, help text, offsets              | `#5F5A52`             | `#A8A49C`             |
| `--color-accent`                                | Primary button fill, links                      | `#2F45B5`             | `#9DB0FF`             |
| `--color-accent-hover`                          | Primary button hover                            | `#23369A`             | `#B9C7FF`             |
| `--color-on-accent`                             | Text on accent fill                             | `#FFFFFF`             | `#0E1440`             |
| `--color-focus`                                 | Focus ring                                      | `#2F45B5`             | `#9DB0FF`             |
| `--color-danger`                                | Error text, error icon, invalid input border    | `#B42318`             | `#FF9C8F`             |
| `--color-danger-surface`                        | Error state background                          | `#FDECEA`             | `#3A1512`             |
| `--color-danger-border`                         | Error state border                              | `#F1B5AE`             | `#7A2B22`             |
| `--color-best` / `--color-best-ink`             | Best hours (09–17), solid green, bold text      | `#B9E3C6` / `#0C3A22` | `#1E5C3C` / `#D6F6E2` |
| `--color-heat-near`                             | Good, step 0 (08, 17): yellow-green             | `#E0EB9C`             | `#4A5716`             |
| `--color-heat-mid`                              | Good, step 1 (07, 18): amber, fallback only     | `#F4C57D`             | `#674400`             |
| `--color-heat-far`                              | Good, step 2 (06, 19): red-orange               | `#F4A184`             | `#73301F`             |
| `--color-heat-ink`                              | Text on every Good step                         | `#3D2600`             | `#FFF1D8`             |
| `--color-heat-hatch`                            | Diagonal hatch over Good cells and segments     | `#C4AE7C`             | `#75653F`             |
| `--color-unsuitable` / `--color-unsuitable-ink` | Unsuitable hours (20–06, weekends): dimmed grey | `#E4E2EA` / `#57555F` | `#24232A` / `#9F9CAA` |
| `--color-backdrop`                              | Translucent ink behind an open sheet            | `rgb(29 27 24 / 0.4)` | `rgb(0 0 0 / 0.6)`    |

**Heat scale.** Ratings come from `src/lib/suitability.js` (Best, Good,
Unsuitable, with a heat distance `d` for Good); `src/lib/grid.js` turns `d` into
a step, `⌊d / 60⌋`: 0 next to Best, 2 next to Unsuitable. Good backgrounds are
`color-mix(in oklch, var(--color-heat-near), var(--color-heat-far) p%)` with
p = 0 / 50 / 100 for steps 0 / 1 / 2. Browsers without `color-mix()` get an
`@supports not (color: color-mix(…))` block that maps the steps to
`--color-heat-near` / `--color-heat-mid` / `--color-heat-far` (a declaration
using `var()` can't fall back on its own). The Everyone row uses the reddest
step among the zones that are Good in each slot. Styles key off
`data-rating` / `data-heat` on elements with the `.heat` class (cells, segments,
legend swatches). Colour is never the only cue (WCAG 1.4.1): every hour cell
shows its local hour as text, Good cells and segments carry a diagonal hatch,
Best cells are bold, Unsuitable cells are dimmed with muted text, and every
cell and segment has an `aria-label` naming its rating.

### 3.2 Typography

| Token                                                | Value                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `--font-sans`                                        | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--font-mono`                                        | `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`              |
| `--font-size-xs` / `sm` / `md` / `lg` / `xl` / `2xl` | `0.8125` / `0.875` / `1.0625` / `1.25` / `1.5` / `2rem`                             |
| `--line-height-tight` / `--line-height-base`         | `1.2` / `1.5`                                                                       |
| `--font-weight-regular` / `medium` / `bold`          | `400` / `500` / `650`                                                               |

Usage: page title `2xl` bold; card titles `lg` bold; body `md`; help text,
offsets and legend `sm` muted; hour cells `sm` in `--font-mono` with
`font-variant-numeric: tabular-nums`. Never go below `xs`, and only use `xs` for
secondary annotations (grid header time and offset, the repeated-hour "2").
Sentence case everywhere.

Phone minimums: body text 17px (`md`, 1.0625rem); hour labels and secondary
text at least 13px, so `xs` (0.8125rem) is the floor; nothing below 11px. All
sizes in rem.

### 3.3 Spacing (4px grid)

`--space-0` 0 · `--space-1` 0.25rem · `--space-2` 0.5rem · `--space-3` 0.75rem
· `--space-4` 1rem · `--space-5` 1.5rem · `--space-6` 2rem · `--space-7` 3rem ·
`--space-8` 4rem. Component padding uses 3–5; gaps between cards use 5; page
gutters use 4 on small screens and 6 above `--bp-md`.

### 3.4 Radius, borders, shadow

| Token                                        | Value         | Use                       |
| -------------------------------------------- | ------------- | ------------------------- |
| `--radius-sm`                                | `0.25rem`     | Legend swatches, badges   |
| `--radius-md`                                | `0.5rem`      | Buttons, inputs           |
| `--radius-lg`                                | `0.75rem`     | Cards, empty/error states |
| `--radius-pill`                              | `999px`       | Legend swatches           |
| `--border-width`                             | `1px`         | All borders               |
| `--focus-ring-width` / `--focus-ring-offset` | `3px` / `2px` | Focus outline             |
| `--shadow-sm`                                | themed        | Cards                     |
| `--shadow-md`                                | themed        | Sheets and toasts         |

### 3.5 Motion

`--duration-fast` 120ms (hover, press), `--duration-base` 200ms (theme change,
state reveal), `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`. Only animate
colour, opacity and transform. Under `prefers-reduced-motion: reduce` both
durations become `0ms` (handled in `tokens.css`).

### 3.6 Layout sizes

`--content-max-width` 72rem · `--control-height` 2.75rem (44px touch target) ·
`--slot-width` 3rem · `--slot-height` 2.75rem · `--row-header-width` 12rem ·
`--row-header-width-compact` 7.5rem · `--control-height-sm` 2rem ·
`--icon-size` 1.25rem · `--sheet-max-width` 32rem (sheets from `--bp-md`,
toasts) · `--toolbar-height` 3.75rem (phone bottom toolbar, before the
safe-area inset) · `--min-viewport-height` 100dvh · `--hatch-size` 6px ·
`--hairline` 1px (sub-pixel geometry such as the visually-hidden utility and the
gap between grid cells).

`--slot-width` is the width of one home-zone hour (a grid column) and
`--slot-height` the height of a grid row. Row headers are
`--row-header-width-compact` wide, `--row-header-width` above `--bp-md`. The
grid sets three unitless runtime properties through
`style.setProperty()` (CSSOM, allowed by the CSP): `--grid-hours` on the grid
(track width = hours × `--slot-width`), and `--cell-left` / `--cell-width` on
each cell and segment (in columns, multiplied by `--slot-width` in CSS). They
are not tokens and are never declared in a stylesheet.

### 3.7 Other

`--letter-spacing-tight` -0.02em (page title only) · `--opacity-disabled` 0.55
(disabled buttons) · `--measure` 65ch (max prose line length).

## 4. Themes

- Light is the default. Dark is defined by overriding the colour and shadow
  tokens only; no component has theme-specific CSS.
- Selection order: saved preference (`settings.theme` in
  `localStorage["tzoverlap.state"]`, where `'system'` means follow the OS) →
  operating-system preference (`prefers-color-scheme`) → light.
- `src/theme-init.js` runs synchronously in `<head>` and sets
  `<html data-theme="light|dark">` before first paint so there is no flash.
  `tokens.css` also applies dark tokens via `prefers-color-scheme` when no
  `data-theme` is set (no-JS fallback).
- Users choose in Settings → Appearance (gear button in the toolbar): "System
  default" follows the OS live, with no reload; "Light" and "Dark" are saved to
  `settings.theme` and hold under any OS setting. Reset all data returns to
  System default.
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
`ghost` (no border: toolbar and in-row actions, e.g. Settings, remove zone).
Size `sm` for in-row actions only; `sm` buttons still meet a 24px minimum target
(WCAG 2.5.8). Always a real `<button>` with a text label. `icon` adds an Icon
(below) before the label; with `iconOnly: true` the label
becomes the `aria-label`, no text shows, and `.btn--icon` makes the button at
least `--control-height` (44px) square. Disabled buttons use the `disabled`
attribute, not just a class.

### Icon — `icon()` · `.icon`

Inline SVG built with `createElementNS`, `fill="currentColor"`, sized by
`--icon-size`. Always decorative (`aria-hidden="true"`, `focusable="false"`):
the button that holds it carries the name. Only `gear` exists; add a name to
the `IconName` union and its path data together.

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

Page frame: skip link, title bar (`<header>`: app name as `<h1>` and tagline),
toolbar, `<main id="main">` constrained to `--content-max-width`, footer, and
the page's one toast region (returned as `toaster`). The toolbar
(`role="group"`, "Toolbar") holds the `actions`, comes right after the brand in
DOM order, and is omitted when there are none. Below `--bp-md` it is fixed to the
bottom of the viewport on a surface with a top hairline, padded by the bottom,
left and right safe-area insets, and the shell pads its bottom to match; from
`--bp-md` it sits in the title bar at the end. The title bar pads its top by
`env(safe-area-inset-top)` and all gutters add the left and right insets
(`viewport-fit=cover`). Toolbar controls are at least 44×44px. Every page
renders inside exactly one shell.

### Sheet — `sheet()` · `.sheet`

A native modal `<dialog>` (`showModal()`) labelled by its `<h2>` title, with a
ghost "Close" button in its header and a scrolling body. Below `--bp-md` it is a
full-width bottom sheet with rounded top corners and a safe-area bottom pad;
from `--bp-md` a centred modal up to `--sheet-max-width`. Height is capped at
every width. Solid `--color-surface`, hairline border, `--shadow-md`;
`::backdrop` is `--color-backdrop`, never blurred. `open(opener)` focuses the
first control; Esc, a backdrop click, Close and `close()` all close it and
return focus to `opener`. Tab and Shift+Tab wrap inside it. Use for settings and
other short tasks that leave the page in place.

### Toast — `createToaster()` · `.toast`

One short message at a time, at most two lines and never truncated, with an
optional ghost `sm` action. Shown in the shell's persistent
`role="status"` polite region, fixed above the phone toolbar or near the bottom
centre from `--bp-md`, so it never shifts layout. It dismisses itself after 6s
(pausing while hovered or focused). Use to confirm something that happened
outside the user's view, e.g. "All data was reset."

### Radio group — `radioGroup()` · `.radio-group`

A `<fieldset>` with a `<legend>` and one native radio per option, each inside
its `<label>` row of at least `--control-height`, with `accent-color` from
`--color-accent`. `onChange` fires on user change; `setValue()` updates it
silently. Use for a choice of a few mutually exclusive settings, e.g.
Appearance.

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

| Name      | Min width | Changes                                                                                                                      |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| base      | 0         | Single column, `--space-4` gutters, compact row headers, toolbar fixed to the bottom, sheets are full-width bottom sheets    |
| `--bp-md` | `40rem`   | `--space-6` gutters, full row headers, add-zone field and button inline, toolbar in the title bar, sheets are centred modals |
| `--bp-lg` | `64rem`   | Content capped at `--content-max-width` and centred                                                                          |

The timeline grid (`src/ui/grid.js`) is one horizontal scroll container
(`overflow-x: auto`, `role="grid"`, `tabindex="0"`) holding every row: home,
Everyone, then the added zones in order. It covers yesterday, today and
tomorrow in the home zone. Row headers (name, live local time, offset, and "No
DST" for fixed offsets) stay sticky on the left; names truncate with an
ellipsis. Each row's track is window hours × `--slot-width` wide and clips
cells that overhang the window. Hour cells are positioned by absolute time, so
a UTC+5:30 zone's cells sit half a column off the home columns. A repeated hour
(clocks going back) gets a second cell with a small "2" and a tooltip. The page
itself never scrolls sideways.
Chrome is solid: no translucent materials and no `backdrop-filter` or blur
anywhere, including behind sheets.

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
  `button`/`label`/`input` elements; ARIA only where HTML has no equivalent.
  The timeline is a labelled `role="grid"` with `role="row"`, `role="rowheader"`
  and `role="gridcell"` children: cells are absolutely positioned by time,
  which a `<table>` can't express. Every cell and Everyone segment has an
  `aria-label` with its time and rating.
- **Not colour alone.** See the heat scale rules in §3.1.
- **Announcements.** Field errors and zone additions/removals are announced
  through polite live regions; error states use `role="alert"`. Toasts are
  announced through the shell's polite `role="status"` region, which is mounted
  empty and filled in a later task.
- **Dialogs.** A sheet traps Tab and Shift+Tab inside itself, Esc closes it,
  and focus returns to the control that opened it.
- **Motion.** Respect `prefers-reduced-motion` (tokens collapse durations).
- **Automated check.** E2E tests run axe-core against the page in both themes
  and fail on any WCAG A/AA violation.
