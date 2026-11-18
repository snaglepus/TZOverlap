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
| `--color-accent`                                | Primary button fill, links, timeline now line   | `#2F45B5`             | `#9DB0FF`             |
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
| `--color-weekend`                               | Weekend Unsuitable hour cells: a deeper grey    | `#D2CFDB`             | `#34313F`             |
| `--color-weekend-band`                          | Solid top band on weekend hour cells (≥ 3:1)    | `#4A4656`             | `#D4D1DE`             |
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
Best cells are bold, Everyone Best segments (which have no text) carry a solid
inner edge in `--color-best-ink` (`--best-edge-width`), Unsuitable cells are
dimmed with muted text and have neither, legend swatches have a
`--color-border-strong` outline (≥ 3:1 against the card), and every
cell and segment has an `aria-label` naming its rating. Weekend hour cells
(`data-weekend="true"`, per zone from `src/lib/weekends.js`) carry a solid top
band in `--color-weekend-band` (`--weekend-band-width`, ≥ 3:1 against every cell
background), Unsuitable ones use `--color-weekend` instead of
`--color-unsuitable`, and their `aria-label` ends with ", weekend". The
Everyone row gets no weekend styling; it shows weekends only through its
ratings.

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
secondary annotations (grid header time, date, offset line and day badge, the
repeated-hour "2"). Sentence case everywhere.

Row headers: the name is `sm` bold on one line, cut off with an ellipsis; the
time is `xs` in `--font-mono` with tabular numerals; the date, offset line
("AEDT · UTC+11") and "No DST" are `xs` muted; the day difference ("Tomorrow",
or the phone badge "+1") is `xs` medium in `--color-text`.

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
`--slot-width` 48px · `--slot-height` 3.5rem (56px, phone rows) ·
`--slot-height-wide` 4rem (64px, rows from `--bp-md`) ·
`--row-header-width-compact` 7rem (112px, phone) · `--row-header-width`
11.25rem (180px, from `--bp-md`) · `--row-header-width-wide` 13.75rem (220px,
from `--bp-lg`) · `--grid-header-width` (the current row header width) ·
`--control-height-sm` 2rem ·
`--icon-size` 1.25rem · `--sheet-max-width` 32rem (sheets from `--bp-md`,
toasts) · `--toolbar-height` 3.75rem (phone bottom toolbar, before the
safe-area inset) · `--min-viewport-height` 100dvh · `--hatch-size` 6px ·
`--best-edge-width` 3px (inner edge on Everyone Best segments) ·
`--weekend-band-width` 4px (top band on weekend hour cells) ·
`--day-divider-width` 2px (midnight divider line) ·
`--now-line-width` 2px (the timeline now line, ≥ 3:1 against every cell fill) ·
`--hairline` 1px (sub-pixel geometry such as the visually-hidden utility and the
gap between grid cells).

`--slot-width` is the width of one home-zone hour (a grid column). It is a
fixed 48px, not rem, on purpose: columns don't widen with the text size, so
more hours stay in view at large text, and labels that no longer fit trigger
the alternate-label rule (§7).
`--slot-height` is the minimum height of a grid row below `--bp-md` and
`--slot-height-wide` from it. Row headers are `--grid-header-width` wide:
`--row-header-width-compact`, `--row-header-width` from `--bp-md` and
`--row-header-width-wide` from `--bp-lg` (switched in `tokens.css`, so the
headers and the now line read the same value). The grid sets four unitless
runtime properties through `style.setProperty()` (CSSOM, allowed by the CSP):
`--grid-hours` on the grid (track width = hours × `--slot-width`), `--now-left`
on the grid (hours from the window start to now; the now line sits at
`--grid-header-width` + `--now-left` × `--slot-width`), and `--cell-left` /
`--cell-width` on each cell and segment (in columns, multiplied by
`--slot-width` in CSS). They are not tokens and are never declared in a
stylesheet. The Popover sets `--popover-left` / `--popover-top` the same way,
in px, multiplied by `--hairline` in CSS.

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
- Settings → Time format, right after Appearance, is a second Radio group:
  "Automatic" (follows the locale's hour cycle), "12-hour" and "24-hour",
  saved to `settings.hourCycle`. It follows the title bar toggle, the T key,
  Reset all data (back to Automatic) and other tabs.
- Settings also holds the "Treat weekends as unavailable" switch
  (`settings.weekendsUnavailable`, on by default). Off, weekend cells keep
  their band but are rated by hour only. Reset all data turns it back on.
- `color-scheme` is set per theme so native controls and scrollbars match.

## 5. Typography rules

- System font stacks only (see §3.2). No `@font-face`.
- One `<h1>` per page (the app name in the shell). Card titles are `<h2>`.
- Clock times, offsets and hour numbers: `--font-mono` + tabular numerals.
- Times go through `formatTime()` in `src/lib/time-format.js`, in the cycle
  from `settings.hourCycle` (`auto` follows the locale). Compact style for
  hour cells, hour only: `9a`, `12p` (12-hour) or `09` (24-hour). Full style
  for row header times, the details popover and every accessible label:
  `9:30 am`, `12:00 pm` (12-hour) or `09:30` (24-hour). The am/pm words come
  from `strings.time`. Header times never wrap or truncate.
- Max line length for prose: 65ch.
- All user-visible text lives in `src/ui/strings.js` (en-AU), never inline.

## 6. Shared components

Implemented as CSS classes in `src/styles/components.css` with DOM factory
functions in `src/ui/components.js`. Build UI from these; do not restyle them
ad hoc in `app.css`. Do not add a component without adding it here.

### Button — `button()` · `.btn`

Variants: `primary` (accent fill: the one main action in a view, e.g. "Add
city"), `secondary` (bordered surface: other actions such as "Try again"),
`ghost` (no border: toolbar and in-row actions, e.g. Settings, remove zone).
Size `sm` for in-row actions only; `sm` buttons still meet a 24px minimum target
(WCAG 2.5.8). Always a real `<button>` with a text label. `icon` adds an Icon
(below) before the label; with `iconOnly: true` the label
becomes the `aria-label`, no text shows, and `.btn--icon` makes the button at
least `--control-height` (44px) square. Disabled buttons use the `disabled`
attribute, not just a class. `pressed` makes a toggle button
(`aria-pressed`); while pressed it gets a `--color-border-strong` border and the
`--color-surface-sunken` fill, so the state shows without relying on colour
alone. Example: the title bar "24-hour" toggle.

### Icon — `icon()` · `.icon`

Inline SVG built with `createElementNS`, `fill="currentColor"`, sized by
`--icon-size`. Always decorative (`aria-hidden="true"`, `focusable="false"`):
the button that holds it carries the name, or, where an icon stands alone, a
wrapper with `role="img"` and an `aria-label` from strings. Icons: `gear`
(Settings) and `location` (a pin: the home row's symbol, wrapped as
`role="img"` "Your location" and sized `--space-4` in the row header). Add a
name to the `IconName` union and its path data together.

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
toolbar, `<main id="main">` constrained to `--content-max-width` and opening
with the page's one banner region (returned as `banner`), footer, and the
page's one toast region (returned as `toaster`). The toolbar
(`role="group"`, "Toolbar") holds the `actions` (on the timelines page: a ghost
**Now** button, named "Go to now", then Settings), comes right after the brand in
DOM order, and is omitted when there are none. Below `--bp-md` it is fixed to the
bottom of the viewport on a surface with a top hairline, padded by the bottom,
left and right safe-area insets, and the shell pads its bottom to match; from
`--bp-md` it sits in the title bar at the end. On the timelines page the
actions are the "24-hour" toggle (a ghost pressed-state Button, pressed while
24-hour times show, `aria-keyshortcuts="T"`; shown only from `--bp-lg`, where
the toolbar is in the title bar) and the Settings gear. The title bar pads its top by
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

### Popover — `popover()` · `.popover`

A small non-modal panel on the native `popover="auto"` attribute (top layer, no
backdrop), labelled by `label` (`role="group"`). Solid `--color-surface`,
hairline border, `--radius-md`, `--shadow-md`, `sm` text with an optional
`.popover__title` line. `open(anchor)` places it below the anchor (above when
there is no room) and keeps it inside the viewport, following page scroll and
resize; positions go in as `--popover-left` / `--popover-top`. Esc closes it and
returns focus to the anchor; a click outside closes it. The anchor gets
`aria-expanded`; give it `aria-controls` with the popover's id, and in its click
handler `close()` when `isOpenFor(anchor)`, else fill `body` and `open()`. One
popover can serve many anchors. Use for read-only details of one item, such as
a phone row header's full name, date and offset; later row actions add to
`body`. Not for tasks: use a Sheet.

### Toast — `createToaster()` · `.toast`

One short message at a time, at most two lines and never truncated, with an
optional ghost `sm` action. Shown in the shell's persistent
`role="status"` polite region, fixed above the phone toolbar or near the bottom
centre from `--bp-md`, so it never shifts layout. It dismisses itself after 6s
(pausing while hovered or focused). Use to confirm something that happened
outside the user's view, e.g. "All data was reset."

### Banner — `createBanner()` · `.banner`

A persistent message with one action, e.g. "Update available" with "Reload"
when a new version of the app is waiting. It lives in the page flow as the first
child of `<main>`, above the cards, so it never covers controls and is never
modal; while empty it takes no space. It is a `role="status"` polite live
region, mounted empty by the shell. `show({ message, action })` renders the
message and a secondary `sm` button; there is no timer and toasts never replace
it, so it stays until the user acts. `hide()` empties it. Surface, strong
hairline border, `--radius-md`, `--shadow-sm`. Use for something the user must
act on eventually but not right now; for passing confirmations use a Toast.

### Radio group — `radioGroup()` · `.radio-group`

A `<fieldset>` with a `<legend>` and one native radio per option, each inside
its `<label>` row of at least `--control-height`, with `accent-color` from
`--color-accent`. `onChange` fires on user change; `setValue()` updates it
silently. Use for a choice of a few mutually exclusive settings, e.g.
Appearance and Time format.

### Switch — `switchControl()` · `.switch`

A native `<input type="checkbox" role="switch">` inside its `<label>` row of at
least `--control-height`, with `accent-color` from `--color-accent` and the
standard focus ring. `onChange(checked)` fires on user change; `setChecked()`
updates it silently. Use for a single on/off setting, e.g. "Treat weekends as
unavailable".

### Empty state — `emptyState()` · `.empty-state`

Sunken, dashed-border panel with a title, one sentence of guidance and an
optional action. Use when a view is valid but has nothing to show yet (e.g. no
zones added besides your own). Never use it for failures.

### Error state — `errorState()` · `.error-state`

Danger-tinted panel with `role="alert"`, a title saying what failed, one
sentence on what the user can do, and an optional "Try again" secondary button.
Use when a view or the whole app cannot render (e.g. the browser lacks time zone
support). For a single bad input value, use the Input error message instead.

### Add city — `addCitySheet()` (`src/ui/add-city.js`) · `.add-city*`

Page pattern, not a shared component. The Timelines card ends with an "Add
city" row directly after the grid (outside `role="grid"`): a `secondary`
button. With no user zones the row is the first-run Empty state ("Add the
cities you work with", one sentence on the 7-zone limit) with the button as its
`primary` action. At 7 stored zones the button gives way to a muted
`--font-size-sm` limit note ("Maximum of 7 time zones. Remove one to add
another."). The button and the **A** key (outside text fields and open
dialogs) open the Add city Sheet.

The sheet loads the city data on its first open only, showing "Loading
cities…" meanwhile and an Error state with no action if the load fails. A
search field (Input) sits on top; with an empty query the popular cities are
listed under one `<h3>` per region (alphabetical), by population rank. Each
result is a full-width plain `<button>` at least `--control-height` tall: name
over a muted secondary line (country or full abbreviation name), then local
time and offset in fixed-width, end-aligned columns of `--font-mono` tabular
numerals, so they line up down the list. A zone already on the board
(stored or home) shows a pill "Added" marker that is part of its accessible
name; choosing it changes nothing and a polite note says so. On desktop
(`(hover: hover) and (pointer: fine)`) the search field gets focus on open;
elsewhere focus stays on Close so no on-screen keyboard pops up. On close,
focus goes to the Add city button if rendered, else the grid.

## 7. Layout and breakpoints

Mobile first. Breakpoints are fixed values because `@media` cannot read custom
properties; `tokens.css` records them as `--bp-md` and `--bp-lg` for reference
and `scripts/lint-tokens.js` rejects any other width in a media query.

| Name      | Min width | Changes                                                                                                                                                                                              |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| base      | 0         | Single column, `--space-4` gutters, compact row headers (a button: name, then time and day badge; details in a popover), 56px rows, toolbar fixed to the bottom, sheets are full-width bottom sheets |
| `--bp-md` | `40rem`   | `--space-6` gutters, 180px row headers with every detail inline and no button, 64px rows, toolbar in the title bar, sheets are centred modals                                                        |
| `--bp-lg` | `64rem`   | Content capped at `--content-max-width` and centred, 220px row headers                                                                                                                               |

The timeline grid (`src/ui/grid.js`) is one horizontal scroll container
(`overflow-x: auto`, `role="grid"`, `tabindex="0"`) holding every row: home,
Everyone, then the added zones in order. It covers yesterday, today and
tomorrow in the home zone. Row headers stay sticky on the left; names truncate
with an ellipsis, and the full name is always in the accessible name. Each zone
header has the name (the home row is the plain city, "Sydney", after a
`location` symbol, with no remove control), the live local time, the short date
("Tue 17 Nov"), the offset line ("AEDT · UTC+11", or "UTC+9" without a real
abbreviation), "No DST" for fixed offsets, and the day difference from home
("Tomorrow", "Yesterday", "+2 days") when it is not 0. All of it updates on the
minute tick without rebuilding cells. Below `--bp-md` the header is a button
with two lines (name; time plus a "+1" / "−1" badge) beside the remove button;
it opens the grid's one details Popover with the full name, time, full date,
offset line, day difference and "No DST". From `--bp-md` every detail is
inline and there is no button. Each row's track is window hours × `--slot-width` wide and clips
cells that overhang the window. Hour cells are positioned by absolute time, so
a UTC+5:30 zone's cells sit half a column off the home columns. A repeated hour
(clocks going back) gets a second cell with a small "2" and a tooltip. Each zone
row (not Everyone) draws a divider at every local midnight in the window: a
full-height `--day-divider-width` line in `--color-text`, placed by absolute
time like cells, with a "Wed 18" chip (`--font-size-xs`, `--color-text` on
`--color-surface`) at its top-right. Dividers are `aria-hidden` and paint over
cells but under the sticky row header; the day's first cell names the date
instead ("00:00, Wed 18, Unsuitable"). Weekend cells are shaded as in §3.1. The
page itself never scrolls sideways.

Scrolling: touch and trackpad scrolling are native; the grid sets
`overscroll-behavior-x: contain` and `touch-action: pan-x pan-y` so it never
takes over page scroll or swipe-back. A vertical mouse wheel over the grid
scrolls it sideways (at either end the wheel falls through to the page; a
horizontal or ctrl/pinch wheel is left to the browser). A mouse drag that
starts on the hour cells or Everyone segments scrolls it; tracks are
`user-select: none`, while header text stays selectable (and selecting it never
scrolls the timeline) and the Remove buttons work as before. With focus in the
grid, ←/→ scroll one column and Shift+←/→ six. The maths lives in
`src/lib/scroll.js`.

Now line: an `aria-hidden` `--now-line-width` line in `--color-accent`, the last
child of the grid, crossing every row. It is painted above the cells and below
the sticky headers, so it passes under the header column. The minute tick moves
it by updating `--now-left` only; cells are never rebuilt. On load the grid
scrolls so the line sits one third of the way across the visible track (the
part right of the headers). The toolbar's Now button, and N with focus in the
grid, bring it back; Now is disabled while the line is on screen. A rebuild
(zone added or removed, weekend setting, another tab) keeps the window and the
instant at the left of the visible track.

Hour cells show the compact time in a `.grid__label` element. After each build,
12/24-hour switch and size change of the grid (a `ResizeObserver`, which also
catches root font-size changes), the grid measures the widest label (with the
repeat marker) plus `--space-1` on each side against one column. If it doesn't
fit, the grid gets `data-labels="alternate"` and labels on odd hours get
`visibility: hidden`: every second label shows. Text is never shrunk to fit.
Hidden labels stay in the cell's `aria-label`. Switching the hour cycle
rewrites every time in place, keeping the scroll position and focus.
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
  focusable (`tabindex="0"`) and labelled. Forms submit with Enter. In the
  timeline grid, ←/→ scroll one hour, Shift+←/→ six hours, N goes to now and T
  switches between 12-hour and 24-hour times (at every width); these keys work
  only while focus is inside the grid (WCAG 2.1.4: scoping them to the focused
  component needs no setting to turn them off), and are ignored with Alt, Ctrl
  or Meta held (N and T also with Shift), so Alt+← stays browser Back. When the
  focused Now button disables itself, focus moves to the grid.
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
  empty and filled in a later task. The banner is a second polite
  `role="status"` region at the top of `<main>`, also mounted empty, so
  "Update available" is announced when it appears.
- **Dialogs.** A sheet traps Tab and Shift+Tab inside itself, Esc closes it,
  and focus returns to the control that opened it.
- **Motion.** Respect `prefers-reduced-motion` (tokens collapse durations).
  Now, N and the arrow keys scroll smoothly only without reduced motion;
  wheel, drag, the first position and restores after a rebuild are instant.
- **Automated check.** E2E tests run axe-core against the page in both themes
  and fail on any WCAG A/AA violation.
  One documented exception: axe's Label in Name rule
  (`label-content-name-mismatch`, SC 2.5.3) is not applied to hour cells
  (`.grid__cell[data-hour]`); it still runs on everything else. A 12-hour cell
  shows the compact `9a` while its name is the full `9:00 am, Best`, which the
  rule's word match can't connect. The cells can't be focused or activated
  (dragging them only scrolls), and the name is a fuller form of the same time, so
  no user loses the visible label. `tests/e2e/helpers.js` applies the
  exclusion.
