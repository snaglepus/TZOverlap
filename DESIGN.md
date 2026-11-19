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
  The one illustration allowed is the Share icon in the iOS install sheet:
  `icon('share')`, an inline `currentColor` SVG sized to `--control-height`.

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
| `--color-heat-near`                             | Good, step 0 (08, 17): green tint, strongest    | `#DCF4E3`             | `#1A4430`             |
| `--color-heat-mid`                              | Good, step 1 (07, 18): paler green tint         | `#E6F7EA`             | `#1B3A2A`             |
| `--color-heat-far`                              | Good, step 2 (06, 19): palest green tint        | `#EFF9F2`             | `#1C3126`             |
| `--color-heat-ink`                              | Text on every Good step                         | `#1D3A28`             | `#D6F6E2`             |
| `--color-heat-hatch`                            | Diagonal hatch over Good cells and segments     | `#B8D4C0`             | `#29503B`             |
| `--color-unsuitable` / `--color-unsuitable-ink` | Unsuitable hours (20–06, weekends): dimmed grey | `#E4E2EA` / `#57555F` | `#24232A` / `#9F9CAA` |
| `--color-weekend`                               | Weekend Unsuitable hour cells: a deeper grey    | `#D2CFDB`             | `#34313F`             |
| `--color-weekend-band`                          | Solid top band on weekend hour cells (≥ 3:1)    | `#4A4656`             | `#D4D1DE`             |
| `--color-filtered`                              | Opaque fill of the filter's greying masks       | `#F4F3F6`             | `#131217`             |
| `--color-filtered-pattern`                      | Cross-hatch over the filter's greying masks     | `#CDCAD4`             | `#34323C`             |
| `--color-backdrop`                              | Translucent ink behind an open sheet            | `rgb(29 27 24 / 0.4)` | `rgb(0 0 0 / 0.6)`    |

**Heat scale.** Ratings come from `src/lib/suitability.js` (Best, Good,
Unsuitable, with a heat distance `d` for Good); `src/lib/grid.js` turns `d` into
a step, `⌊d / 60⌋`: 0 next to Best, 2 next to Unsuitable. Good backgrounds map
straight to `--color-heat-near` / `--color-heat-mid` / `--color-heat-far` for
steps 0 / 1 / 2. The Everyone row uses the farthest step among the zones that
are Good in each slot. Loudness follows usefulness: Best is the strongest
green, the Good steps are paler tints of the same green that fade as they near
Unsuitable, and Unsuitable recedes most. Red and orange are reserved for
errors. Styles key off
`data-rating` / `data-heat` on elements with the `.heat` class (cells, segments,
legend swatches). Colour is never the only cue (WCAG 1.4.1): every hour cell
shows its local hour as text, Good cells and segments carry a quiet diagonal
hatch (a single line, distinct from the filter mask's cross-hatch),
Best cells are bold, Everyone Best segments (which have no text) carry a solid
inner edge in `--color-best-ink` (`--best-edge-width`), Unsuitable cells are
dimmed with muted text and have neither, legend swatches have a
`--color-border-strong` outline (≥ 3:1 against the card, and against
`--color-bg` below `--bp-md`, where the Timelines card has no surface; the Good
swatch shows the near step), and every
cell and segment has an `aria-label` naming its rating. Weekend hour cells
(`data-weekend="true"`, per zone from `src/lib/weekends.js`) carry a solid top
band in `--color-weekend-band` (`--weekend-band-width`, ≥ 3:1 against every cell
background), Unsuitable ones use `--color-weekend` instead of
`--color-unsuitable`, and their `aria-label` ends with ", weekend". The
Everyone row gets no weekend styling; it shows weekends only through its
ratings.

**Greying (the All / Good / Best filter).** Good and Best grey out every
instant whose Everyone rating the filter excludes (`src/lib/filter.js`
`greyedSpans()`: Good keeps Good and Best, Best keeps Best). The greying is a
set of `.grid__mask` overlays placed by absolute time, identical in every track
(home, Everyone and each user row), so a :30 or :45 zone's hour cell that
straddles a qualifying edge is greyed only for the part outside it. A mask is
an opaque `--color-filtered` fill with a cross-hatch in
`--color-filtered-pattern` (two `--hairline` lines at 45° and 135°, every
`--hatch-size`), unlike Good's single 135° hatch: the pattern is the non-colour
cue. Hour labels stay above the masks in their normal ink (every ink is ≥ 4.5:1
against both filtered tokens), and an Everyone segment under a mask ends its
`aria-label` with ", greyed out by the filter". Hour cells keep their own
rating and label.

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
or the phone badge "+1") is `xs` medium in `--color-text`. The "DST" chip is
styled like the day badge, and the clock-change warning (the `alert` icon,
plus "29 Mar" from `--bp-md`) is `xs` medium in `--color-text`.

Phone minimums: body text 17px (`md`, 1.0625rem); hour labels and secondary
text at least 13px, so `xs` (0.8125rem) is the floor; nothing below 11px. All
sizes in rem.

### 3.3 Spacing (4px grid)

`--space-0` 0 · `--space-1` 0.25rem · `--space-2` 0.5rem · `--space-3` 0.75rem
· `--space-4` 1rem · `--space-5` 1.5rem · `--space-6` 2rem · `--space-7` 3rem ·
`--space-8` 4rem. Component padding uses 3–5; gaps between cards use 5; page
gutters use 4 on small screens and 6 above `--bp-md`.

### 3.4 Radius, borders, shadow

| Token                                        | Value         | Use                        |
| -------------------------------------------- | ------------- | -------------------------- |
| `--radius-sm`                                | `0.25rem`     | Legend swatches, badges    |
| `--radius-md`                                | `0.5rem`      | Buttons, inputs            |
| `--radius-lg`                                | `0.75rem`     | Cards, empty/error states  |
| `--radius-pill`                              | `999px`       | Legend swatches            |
| `--border-width`                             | `1px`         | All borders                |
| `--focus-ring-width` / `--focus-ring-offset` | `3px` / `2px` | Focus outline              |
| `--shadow-sm`                                | themed        | Cards                      |
| `--shadow-md`                                | themed        | Sheets, toasts, lifted row |

Under `prefers-contrast: more`, `tokens.css` sets `--color-border` to the
theme's `--color-border-strong` (light, explicit dark and system dark), so
every hairline border strengthens. No other token changes.

### 3.5 Motion

`--duration-fast` 120ms (hover, press), `--duration-base` 200ms (theme change,
state reveal), `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`. Only animate
colour, opacity and transform. Under `prefers-reduced-motion: reduce` both
durations become `0ms` (handled in `tokens.css`).

### 3.6 Layout sizes

`--content-max-width` 72rem · `--control-height` 2.75rem (44px touch target,
also the minimum of `sm` buttons) ·
`--slot-width` 48px · `--slot-height` 3.5rem (56px, phone rows) ·
`--slot-height-wide` 4rem (64px, rows from `--bp-md`) ·
`--row-header-width-compact` `min(7rem, 40vw)` (112px, phone: the name and the
"10:30 pm" clock line; the drag handle shows only in Edit mode below `--bp-md`,
where Delete and the enlarged handle take a second line (108px). A 390px phone
keeps 244px of hours, at least 6 columns; at 200% text the 40vw cap gives 128px
at 320px and 156px at 390px) ·
`--row-header-width` `min(11.25rem, 40vw)` (180px, from `--bp-md`) ·
`--row-header-width-wide` `min(13.75rem, 40vw)` (220px, from `--bp-lg`) ·
`--grid-header-width` (the current row header width). At large text the row
header column is never wider than 40% of the viewport (PRD 6.7); at default
text the cap never bites ·
`--icon-size` 1.25rem · `--row-header-trigger-basis` 4.5rem (a user row
header's trigger before it grows: room for "10:30 pm" at any text size; when
the trigger and the drag handle don't fit on one line, the handle wraps) ·
`--edit-handle-size` 3.25rem (52px: a user row's drag handle in Edit mode) ·
`--edit-handle-icon-size` 1.5rem (24px: its grip icon) ·
`--lift-scale` 1.02 (the dragged row's scale; `1` under reduced motion) ·
`--sheet-max-width` 32rem (sheets from `--bp-md`,
toasts) · `--toolbar-height` 53px (phone bottom toolbar before the safe-area
inset: one `--control-height` row, `--space-1` padding above and below, and
the top border) · `--min-viewport-height` 100dvh · `--hatch-size` 6px ·
`--best-edge-width` 3px (inner edge on Everyone Best segments) ·
`--weekend-band-width` 4px (top band on weekend hour cells) ·
`--day-divider-width` 2px (midnight divider line) ·
`--everyone-rule-width` 2px (the Everyone row's top rule, in
`--color-border-strong`: the total line above it) ·
`--now-line-width` 2px (the timeline now line, ≥ 3:1 against every cell fill) ·
`--selection-edge-width` 3px (the four sides of the selection band, in
`--color-accent`) ·
`--selection-bar-inset` 8px (the selection bar's inline padding below
`--bp-md`; px, not rem, so large text keeps the room for its words) ·
`--banner-inset-start` / `--banner-inset-end` `max(8px, 32px - var(--space-4))`
/ `max(8px, 24px - var(--space-3))` (the banner's inline padding below
`--bp-md`: 16px / 12px at default text, 8px at 200%, so a 320px phone keeps
room for a two-line message) · `--phone-gutter`
`max(8px, 32px - var(--space-4))` and `--segment-inset`
`max(4px, 20px - var(--space-2))` (below `--bp-md`: the page gutters of the
title bar, main and footer and the bottom toolbar's inline padding, and the
toolbar filter segments' inline padding: 16px and 12px at default text, 8px and
4px at 200%, so large text on a phone keeps room for its words) ·
`--hairline` 1px (sub-pixel geometry such as the visually-hidden utility and the
gap between grid cells).

`--slot-width` is the width of one home-zone hour (a grid column). It is a
fixed 48px, not rem, on purpose: columns don't widen with the text size, so
more hours stay in view at large text, and labels that no longer fit trigger
the alternate-label rule (§7).
`--slot-height` is the minimum height of a grid row below `--bp-md`, and on
short viewports (under `40rem` tall) at any width, and `--slot-height-wide`
from `--bp-md` on viewports at least `40rem` tall (§7). Row headers are `--grid-header-width` wide:
`--row-header-width-compact`, `--row-header-width` from `--bp-md` and
`--row-header-width-wide` from `--bp-lg` (switched in `tokens.css`, so the
headers and the now line read the same value). The grid sets unitless
runtime properties through `style.setProperty()` (CSSOM, allowed by the CSP):
`--grid-hours` on the grid (track width = hours × `--slot-width`), `--now-left`
on the grid (hours from the window start to now; the now line sits at
`--grid-header-width` + `--now-left` × `--slot-width`), `--selection-left` and
`--selection-width` on the selection band (hours from the window start to the
selection start, and the duration in hours clipped at the window end; placed
like the now line), and `--cell-left` / `--cell-width` on each cell, segment
and filter mask (in columns, multiplied by `--slot-width` in CSS). They are not
tokens and are never declared in a
stylesheet. The Popover sets `--popover-left` / `--popover-top` the same way,
in px, multiplied by `--hairline` in CSS, and so does drag to reorder:
`--reorder-y` on the lifted row and the rows it pushes aside, and
`--lift-origin` (the horizontal centre of the grid's visible area) on the
lifted row.

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
- Users choose in Settings → Appearance (gear button in the app bar on phones,
  in the toolbar from `--bp-md`): "System
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
- Settings → Install (after the weekends switch, before Reset all data) lists
  the install steps for iPhone or iPad, Android and desktop, plus an "Install
  app" button while the browser offers one. It is absent when the app runs
  installed.
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
`ghost` (no border: toolbar and in-row actions, e.g. Settings, row actions).
Size `sm` for in-row actions only: smaller type and padding, but the same
44px (`--control-height`) minimum width and height as every other button. Always a real `<button>` with a text label. `icon` adds an Icon
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
the button that holds it carries the name, the adjacent text does, or, where an
icon stands alone, a wrapper with `role="img"` and an `aria-label` from strings.
Icons: `gear` (Settings), `location` (a pin: the home row's symbol, wrapped as
`role="img"` "Your location" and sized `--space-4` in the row header) and
`share` (the iOS Share button: a tray with an up arrow, in the iOS install
sheet) and `alert` (a warning triangle: the row header's clock-change badge,
sized `--space-3`) and `grip` (three horizontal bars: a user row's drag
handle) and `remove` (a circle with a minus bar: a user row's Delete button in
Edit mode, in `--color-danger`). Add a name to the `IconName` union and its path data together.

### Input — `field()` · `.field`, `.input`

Text input with a visible `<label>`, optional help text and an error message
slot. Errors set `aria-invalid="true"` and are linked with `aria-describedby`;
the error text is in a polite live region. Use for every text entry. Supports a
`<datalist>` of suggestions.

### Date field — `dateField()` · `.date-field`, `.input`

A visible `<label>` and a native `<input type="date">` (value "YYYY-MM-DD",
optional `min` / `max`), styled with `.input`. `setLabel()` changes the label
word; `setShortDate(text, replacesLabel)` sets the short date inside the label,
shown only below `--bp-md`. From `--bp-md` the label word sits beside the input
in `--font-size-sm`; when both don't fit (large text) the input wraps under the
label and may shrink to the field's width.

Below `--bp-md` the field is one compact button: the label, at least 44×44px
with a `--color-border-strong` border, `--radius-md` and `--font-size-sm` text
centred, shows the short date. When the short date already says the label
("Today · Wed 18 Nov", `replacesLabel`) the word is left out; otherwise ("Wed
18 Nov") the word stays visually hidden, so the accessible name is "Date Wed 18
Nov". The date's spaces are no-break spaces, so in a narrow toolbar the text
wraps after "Today ·" and never inside the date, and the button is never
narrower than the date (`min-width: min-content`): if the row can't hold it,
the toolbar wraps instead of the text running out of the button. The native
input stays in the DOM with its value, `min` / `max` and handlers, laid over the
whole button at `opacity: 0`, so a tap focuses it; its click handler also calls
`showPicker()` (feature-checked, in `try`/`catch`) while the phone layout is
active, since desktop browsers open the picker only from its icon. The button
takes the standard focus ring while the input has `:focus-visible`. Use for the
toolbar's date control (labelled "Today" while the timelines show today, "Date"
otherwise; the short date comes from `anchorShortDate()` in
`src/lib/row-header.js`, en-AU, so "Wed 15 July").

### Card — `card()` · `.card`

Surface with `--radius-lg`, hairline border and `--shadow-sm`, padded
`--space-4` below `--bp-md` and `--space-5` from it (on a 320px phone at 200%
text the wider padding left too little room for a whole word in a wide font).
Has an `<h2>` title and a body. Use to group one task or one view (e.g. "Add a time zone",
"Timelines"). The one-time install hint ("Install TZ Overlap", with "Install
app" and "Not now") is a card placed first in `<main>`: non-modal, no timeout.
Do not nest cards.

The Timelines card has no card look below `--bp-md`, through a page-level
modifier (`.timelines`, added in `app.js`; `card()` is unchanged): no border,
radius, shadow, background or padding, so the grid's own single edge spans the
content width. Its `<h2>` is visually hidden there but still names the region
(`aria-labelledby`). Its header and body are `display: contents`, and flex
`order` places, with `--space-2` between them: Edit / Done alone on a line,
right-aligned; the no-overlap message; the grid; the legend; then the
popover, Add city (or the limit note or empty state) and the selection bar.
The DOM, reading and tab order don't change.

### App shell — `appShell()` · `.shell`

Page frame: skip link, title bar (`<header>`: app name as `<h1>` and tagline,
then the `barActions`), toolbar, `<main id="main">` constrained to
`--content-max-width` and opening with the page's one banner region (returned
as `banner`), footer, and the page's one toast region (returned as `toaster`).
The toolbar (`role="group"`, "Toolbar") holds the `actions` (on the timelines
page: the Date field, a ghost "Today" button that is hidden while the date
shown is today, the "24-hour" toggle (a ghost pressed-state Button, pressed
while 24-hour times show, `aria-keyshortcuts="T"`; shown only from `--bp-lg`,
where the toolbar is in the title bar), a ghost **Now** button, named "Go to
now", Settings, then the "Filter" Segmented control: All, Good, Best), comes
right after the brand and the `barActions` in DOM order, and is omitted when
there are none.

Below `--bp-md` the title bar is a slim app bar, at most 52px at default text
(`--space-1` above and below a 44px control): the `<h1>` in `--font-size-lg`,
no tagline (`display: none`), and the timelines page's `barActions`, a second
ghost Settings gear. The toolbar's own gear is hidden there and the app bar's
from `--bp-md`, so exactly one Settings button shows at any width; if the
layout changes while Settings is open (a phone rotating), closing it focuses
the gear that shows now. The toolbar is fixed to the bottom of the viewport on
a surface with a top hairline, one row at default text: the compact Date field
button (it takes the room left), Now (a ghost button with `--space-1` inline
padding, at least `--control-height` wide), then the
filter, all in `--font-size-sm` with `--space-1` gaps, stretched to the tallest
control. The Today button is not shown there (Now and the picker cover going
back) and the 24-hour toggle is hidden below `--bp-lg`. At large text it wraps
onto more rows. It is padded by the bottom, left and right safe-area insets,
and the shell pads its bottom to match. From `--bp-md` the title bar is as
before: `--font-size-2xl` name over the tagline, and the toolbar in it at the
end, with the filter on its own line under the other controls, right-aligned. The title bar pads its top by
`env(safe-area-inset-top)` and all gutters add the left and right insets
(`viewport-fit=cover`). Below `--bp-md` the shell's bottom padding is the
larger of `--toolbar-height` and the toolbar's measured height
(`--toolbar-room`, set by `appShell()`), so at large text the end of the
footer still scrolls clear of it. Toolbar controls are at least 44×44px. The
footer pads `--space-2` above and below in `--font-size-xs` below `--bp-md`
(`--space-4` and `--font-size-sm` from it). Every page renders inside exactly
one shell.

### Sheet — `sheet()` · `.sheet`

A native modal `<dialog>` (`showModal()`) labelled by its `<h2>` title, with a
ghost "Close" button in its header and a scrolling body. When the title and
Close don't fit one line (large text), Close wraps to the end of a second line
and the title wraps between words. Below `--bp-md` it is a
full-width bottom sheet with rounded top corners and a safe-area bottom pad;
from `--bp-md` a centred modal up to `--sheet-max-width`. Height is capped at
every width. Solid `--color-surface`, hairline border, `--shadow-md`;
`::backdrop` is `--color-backdrop`, never blurred. `open(opener)` focuses the
first control; Esc, a backdrop click, Close and `close()` all close it and
return focus to `opener`. Tab and Shift+Tab wrap inside it. Use for settings and
other short tasks that leave the page in place, e.g. Settings and the one-time
iOS install sheet ("Install TZ Overlap": the Share steps and icon).

### Popover — `popover()` · `.popover`

A small non-modal panel on the native `popover="auto"` attribute (top layer, no
backdrop), labelled by `label` (`role="group"`). Solid `--color-surface`,
hairline border, `--radius-md`, `--shadow-md`, `sm` text with an optional
`.popover__title` line. `open(anchor)` places it below the anchor (above when
there is no room) and keeps it inside the viewport and above the phone's fixed
bottom toolbar, following page scroll and resize; it is never taller than the
room above that toolbar (the viewport without one), and scrolls when its
content is; positions go in as `--popover-left` / `--popover-top`, the room as
`--popover-room`. At 320×568 with 200% text the phone toolbar wraps to two
rows (the date button and Now, then the filter), so the room above it is
smaller and a long popover scrolls rather than covering the toolbar. Esc closes it and
returns focus to the anchor; a click outside closes it. The anchor gets
`aria-expanded`; give it `aria-controls` with the popover's id, and in its click
handler `close()` when `isOpenFor(anchor)`, else fill `body` and `open()`. One
popover can serve many anchors. Use for details of one item, such as a row
header's full name, date and offset, plus that item's few actions: a user
row's popover shows its details, then `.popover__actions` (ghost `sm` buttons
above a hairline), and opening it moves focus to the first enabled action. The
home row's popover is details only. Not for tasks: use a Sheet.

### Toast — `createToaster()` · `.toast`

One short message at a time, at most two lines and never truncated, with an
optional ghost `sm` action. Shown in the shell's persistent
`role="status"` polite region, fixed above the phone toolbar or near the bottom
centre from `--bp-md`, so it never shifts layout. On phones the region is
anchored to the toolbar's real top (CSS anchor positioning, `anchor-name:
--toolbar`; without it, `--toolbar-height` above the bottom), so a toolbar that
large text wraps to more rows never sits under the toast. The region spans the
viewport above that line with `pointer-events: none`, and the toast sits at its
foot (`align-items: safe flex-end`): if it were ever taller than the room left
it would start at the top of the viewport instead and cover the toolbar's first
row while it shows. While the Everyone row is pinned to the bottom of the
screen, the region's foot rises to sit above it (`--everyone-pin-room`, at all
widths). It dismisses itself after 6s
(pausing while hovered or focused). Use to confirm something that happened
outside the user's view, e.g. "All data was reset." A toast with an Undo action (a deleted
row) passes `duration` 5000 and keeps only the latest deletion undoable.

### Banner — `createBanner()` · `.banner`

A persistent message with one action, e.g. "Update available" with "Reload"
when a new version of the app is waiting. It lives in the page flow as the first
child of `<main>`, above the cards, so it never covers controls and is never
modal; while empty it takes no space. It is a `role="status"` polite live
region, mounted empty by the shell. `show({ message, action })` renders the
message and a secondary `sm` button; there is no timer and toasts never replace
it, so it stays until the user acts. `hide()` empties it. Surface, strong
hairline border, `--radius-md`, `--shadow-sm`; inline padding
`--banner-inset-start` / `--banner-inset-end` below `--bp-md`, `--space-4` /
`--space-3` from it. Use for something the user must act on eventually but not
right now; for passing confirmations use a Toast.

`message` is a string ("Update available") or `{ long, short, compact? }`: the
`.banner__short` text shows below `--bp-md` and `.banner__long` from it. With
`compact`, the banner measures the short text as laid out, inside `show()` and
again on window resize, and swaps it for `compact` when it is taller than two
of its line heights, so a phone banner never takes more than two lines and
never truncates. No character counts are used. A `show()` whose action label
matches the button on screen replaces only the message and keeps the button,
so focus stays on it.

The timelines page adds a second Banner for date notes right after the shell's
update banner: the DST banner, shown while the picked date is later than today
and a clock change in any listed zone lies between now and then. One change
shows its sentence ("London: clocks go forward 29 Mar. Gap now 10 h." on
phone; the long form from `--bp-md`), falling back to "1 clock change on Sun
29 Mar." on phone; several show "2 clock changes before Fri 10 Apr.". Its
Details button opens the "Clock changes" Sheet with every change's full
sentence. The two banners stack, and neither shows, hides or replaces the
other.

### Radio group — `radioGroup()` · `.radio-group`

A `<fieldset>` with a `<legend>` and one native radio per option, each inside
its `<label>` row of at least `--control-height`, with `accent-color` from
`--color-accent`. `onChange` fires on user change; `setValue()` updates it
silently. Use for a choice of a few mutually exclusive settings, e.g.
Appearance and Time format.

### Segmented control — `segmentedControl()` · `.segmented`

A `<fieldset>` with a visually hidden `<legend>` and one native radio per
option, each visually hidden (but focusable) inside its segment's `<label>`.
The segments sit side by side in one strip; each has a
`--color-border-strong` border overlapping its neighbour's, `--radius-md` on
the outer corners, and is at least `--control-height` (44px) tall and wide,
with `--font-weight-medium` text on `--color-surface`. The checked segment gets
the `--color-surface-sunken` fill, a second inset `--color-border-strong`
border and `--font-weight-bold` text, like the pressed Button, so the state
never relies on colour alone. A focused radio puts the standard focus ring on
its segment (`:has(:focus-visible)`). Below `--bp-md` each segment takes its
label's width plus `--segment-inset` on each side, and at least
`--control-height` wide; in the toolbar the padding is `--space-1` and the text
`--font-size-sm`, so the filter shares the one toolbar row with the date button
and Now and leaves the date room for one line at 320px.
From `--bp-md` they size as a flex row with `--space-3` padding, and in the
toolbar the filter takes its own line. Arrow keys move the choice natively and
assistive tech gets a named group of radios. Options may set
`aria-keyshortcuts`. `onChange` fires on user change; `setValue()` updates it
silently. Use for a short, always-visible view mode switched often, e.g. the
toolbar's "Filter" (All / Good / Best, keys 1 / 2 / 3); for a setting inside a
sheet or a list of longer labels use Radio group.

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

### Selection bar — `selectionBar()` · `.selection-bar`

`src/ui/selection-bar.js`. The last child of the Timelines card, after the Add
city row, limit note or empty state; hidden while nothing is selected. A
`role="group"` labelled "Selected time" on `--color-surface` with a
`--color-border-strong` hairline and `--radius-md`: the date and home time
range in `--font-weight-medium` with tabular numerals (`.selection-bar__when`,
"Wed 18 Nov, 09:00–10:00 Sydney", en dash; not mono, so the city name reads as
text), a " · " separator (`aria-hidden`), the rating
in words (`.selection-bar__rating`: "Best for all", "Good for all" or
"Unsuitable for some") and a ghost `sm` "×" button named "Clear selection".
From `--bp-md` it is one line where it fits, in `--font-size-md`. Below it the
bar is `--font-size-sm` with `--selection-bar-inset` inline padding, the
separator is hidden, the time range takes the whole first line (one line at
390px in default text) and the rating the second, with the button at the end
of the rating line, or under it when the two don't fit. With large text on a
narrow phone the range and rating wrap between words, never inside one that
fits the bar's width. Every text container has `min-width: 0`,
`overflow-wrap: anywhere` and `hyphens: auto`, so it never scrolls the page
sideways. `show(summary)` fills and shows it, `hide()`
hides it.

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
numerals, so they line up down the list. Below `--bp-md` the name takes the
full first line and the Added marker, time and offset share a second line
under it (the time and offset at minimum widths, so they still line up); when
they don't fit (large text) the offset wraps to its own line at the end. A zone already on the board
(stored or home) shows a pill "Added" marker that is part of its accessible
name; choosing it changes nothing and a polite note says so. On desktop
(`(hover: hover) and (pointer: fine)`) the search field gets focus on open;
elsewhere focus stays on Close so no on-screen keyboard pops up. On close,
focus goes to the Add city button if rendered, else the grid.

## 7. Layout and breakpoints

Mobile first. Breakpoints are fixed values because `@media` cannot read custom
properties; `tokens.css` records them as `--bp-md` and `--bp-lg` for reference
and `scripts/lint-tokens.js` rejects any other width in a media query.

| Name      | Min width | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| base      | 0         | Single column, `--phone-gutter` gutters (16px; 8px at 200% text), slim app bar (name and Settings gear, no tagline), compact 112px row headers (a button: name, then time and day badge; details in a popover; a drag handle on user rows in Edit mode only), a cardless Timelines region (hidden heading, Edit above the grid, the legend after it), 56px rows, one-row toolbar fixed to the bottom (date button, Now, filter), shorter footer, sheets are full-width bottom sheets |
| `--bp-md` | `40rem`   | `--space-6` gutters, title bar with tagline, 180px row headers with every detail inline (a button on user rows, static on home), 64px rows, toolbar in the title bar (with Today and Settings), sheets are centred modals                                                                                                                                                                                                                                                            |
| `--bp-lg` | `64rem`   | Content capped at `--content-max-width` and centred, 220px row headers                                                                                                                                                                                                                                                                                                                                                                                                               |

Short viewports keep the phone row header. The wide row header (its inline
details, the 64px rows, the wider header padding) needs height as well as
width, so `app.css` applies it under `(min-width: 40rem) and (min-height:
40rem)`, reusing the `--bp-md` value as a height; `src/ui/grid.js` `WIDE`
matches the same query, so focus, the popover anchor and the close on a change
follow the visible trigger. A phone in landscape (844×390) is wider than
`--bp-md` but under `40rem` tall: it keeps the phone header button, the 56px
rows and the popover for details, and so shows more hours rather than taller
rows (PRD 6.3). Everything else from `--bp-md` (gutters, the toolbar in the
title bar, the 180px `--grid-header-width`, the one-line selection bar, centred
sheets) still follows width alone.

Large text (PRD 6.7): the row header column is at most 40% of the viewport
(the `--row-header-width*` tokens, §3.6), rows grow taller, and nothing clips.
A header time wider than the header (12-hour times at 200% in a 128px header)
wraps between words ("12:00 / pm"), never inside one; city names keep their
one-line ellipsis. The no-overlap message's button lets its label wrap rather
than widen the page, with its padding shrunk to `--phone-gutter`; the Popover
is never taller than the room above the phone toolbar (it scrolls); the Date
field, Sheet headers and Add city results wrap rather than run past the
screen edge. At 200% text the phone toolbar wraps onto more rows (at 320×568:
the date button and Now, then the filter), and the shell reserves its measured
height.

The timeline grid (`src/ui/grid.js`) is one horizontal scroll container
(`overflow-x: auto`, `role="grid"`, `tabindex="0"`) holding every row: home,
the added zones in order, then Everyone last as a total line under them, with
a `--everyone-rule-width` top rule in `--color-border-strong` on its header and
track (no bottom border: the grid's own border closes it). It opens on yesterday to tomorrow of
the anchor date in the home zone (today, or the date picked in the toolbar),
with the current instant (or the start of a picked date) a third of the way in.
Scrolling within 6 columns of either end adds a whole home-zone day on that
side (an IntersectionObserver on invisible `.grid__edge` markers), up to 14
days either side of the anchor, and adding days on the left keeps the content
still. Header clocks show the current time; offsets follow the date shown. Row headers stay sticky on the left; names truncate
with an ellipsis, and the full name is always in the accessible name. Each zone
header has the name (the home row is the plain city, "Sydney", after a
`location` symbol, with no actions), the live local time, the short date
("Tue 17 Nov"), the offset line ("AEDT · UTC+11", or "UTC+9" without a real
abbreviation), "No DST" for fixed offsets, and the day difference from home
("Tomorrow", "Yesterday", "+2 days") when it is not 0. At the offset line's
instant, a "DST" chip shows while the zone observes daylight saving time, and a
clock-change warning shows when its clocks change within 14 days; both can
show at once, and fixed zones get neither. All of it updates on the
minute tick without rebuilding cells. Below `--bp-md` the header is a button
with two lines (name; time plus a "+1" / "−1" badge); it opens the grid's one
details Popover with the full name, time, full date, offset line, day
difference and "No DST". On phone the "DST" and warning chips sit on line 2
after the day badge, `aria-hidden` with visually hidden "Daylight saving time"
and "Clocks change Sun 29 Mar"; the popover then adds "Daylight saving time"
and the change's full sentence. From `--bp-md` every detail is inline: on user
rows inside a wide trigger button with the same hover and expanded background,
opening the same Popover; on the home row as static text. The Everyone header
is plain text: the name, then on its own line a summary of the anchor date in
the home zone (`src/lib/everyone-summary.js`), in `--color-text` at
`--font-weight-medium`, wrapping rather than truncating. It names the longest
Best run ("Best 10:00–17:00"), else the longest Good run ("Good 6–9 am"), else
"No shared hours", and counts the other runs of that rating ("Best
10:00–17:00, +1 more"). Below the wide header query the short variant shows
("… +1", "None shared"), from it the long one; the other is `display: none`.
The summary ignores the filter, follows the 12/24-hour setting in place and
never changes on the minute tick. When a rebuild (zones, home, weekends, date)
changes it, the polite announcer says "Everyone: …" once, joined to that
action's own message ("Added Tokyo. Everyone: …"); a filter change says
"Filter: Good. Everyone: …". While the grid runs below the visible area, the
Everyone row is pinned to its bottom: just above the phone toolbar below
`--bp-md`, the viewport bottom from it. It is never raised over the home row,
and it settles back continuously, with no jump, as the grid's end scrolls into
view. `position: sticky` can't do this (the grid's `overflow-x: auto` makes it
the sticky container), so `src/ui/pin.js` positions it by script inside the
scroller: one rAF-coalesced read per frame (on page scroll, resize and size
changes of the grid, toolbar and body) gives the lift from `pinLift()`
(`src/lib/scroll.js`), set as `--everyone-lift` on the row, and its header and
track get a `translateY` by it (the row element itself never moves). It is the
same single row, so its segments, the band and the now line stay aligned at
every `scrollLeft`; there is no clone or second scroller, and no pinned-state
shadow. While pinned, `--everyone-pin-room` on `<html>` (the room from the
row's top to the viewport bottom) lifts toasts above it and sets the page's
`scroll-padding-block-end`, so focus scrolling leaves it clear; a row control
focused while it would sit under the row (on `focusin` in the grid, or in the
first frame after a rebuild) is scrolled clear. The grid root itself, focused
without scrolling by a track press or after clearing a selection, never is. From `--bp-md` "DST" is visible text in the meta line, and the
warning is a bordered chip ("29 Mar") with the alert icon. On user rows it sits
inside the wide trigger, named by visually hidden "Clocks change Sun 29 Mar",
and the trigger's Popover adds the change's sentence. On the home row it is a
button (named "Clocks change Sun 29 Mar", at least `--control-height`, 44×44 px)
that opens the
details popover with the full name and the change's sentence. Each row's track
is window hours × `--slot-width` wide and clips
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

Row actions: a user row's trigger, or a right-click anywhere in its header,
opens the Popover with Change, Move up, Move down and Delete. Change opens the
Add city sheet titled "Change Tokyo" and replaces the zone in place (a zone
already listed is blocked with the usual note); focus returns to the row.
Delete removes the row at once, with no confirmation, and shows a toast
"Removed Tokyo." with Undo for 5 s; Undo restores the row at its old position
and focuses it. Move up / Move down (disabled at the ends) move the row one
place among the user rows, keep focus on its trigger and announce "London
moved to position 2 of 5" in the polite live region. Crossing `--bp-md` with
the Popover open closes it and keeps focus on the row's visible trigger.

Reordering (`src/ui/reorder.js`, maths in `src/lib/row-order.js` and
`src/lib/scroll.js`): every user row's header ends with a `.grid__handle`
button holding the `grip` icon, from `--bp-md` wide (a phone in landscape
too); below it, only in Edit mode (the home and Everyone rows have none).
Outside Edit mode on phones, a long press on the header is the drag path, and
Move up / Move down stay in the Popover. Crossing `--bp-md` wide outside Edit
mode closes a Popover a now-hidden handle opened, and moves focus from a
now-hidden handle, to the row's visible trigger. It is at least
`--control-height` square, `--color-text-muted`, with the trigger's hover
background, the standard focus ring, `cursor: grab` (`grabbing` while lifted) and `touch-action: none`. User row headers wrap:
the trigger is `flex: 1 1 var(--row-header-trigger-basis)` and the handle
`flex: none`, so at default text the handle sits at the inline end of the
header's line, and at large text it wraps to a second line at the inline start,
under the trigger, which keeps it inside the visible grid even where the header
is wider than it. Activating the handle without a drag (click, tap, Enter or
Space) opens the row's details Popover like the trigger, and again closes it.
Pickup uses Pointer Events with pointer capture, never HTML5 drag and drop: a
mouse or pen press on the handle that moves more than `CLICK_SLOP_PX`; a touch
on the handle that moves that far or is held `LONG_PRESS_MS` (400ms) within
`LONG_PRESS_SLOP_PX`; or a touch held that long anywhere else in the header (a
shorter tap opens the Popover as before). A touch pickup calls
`navigator.vibrate(HAPTIC_MS)` where it exists. The lifted row
(`.grid__row--lifted`) follows the pointer vertically with `--shadow-md`, a
`--lift-scale` scale about the centre of the grid's visible area, and a
z-index above the other rows and their sticky headers; the rows it passes
slide aside by its height with `transform var(--duration-base)
var(--ease-standard)`. Only transforms change: the rows keep their DOM order
until the drop, and the grid (`data-reordering`) is `user-select: none`. The
timeline's `scrollLeft` is held and a long-press drag never pans. Rows are
measured once at pickup relative to the grid's top, so page scroll and content
inserted above the grid don't misplace the drop; only the Everyone row's top is
read live (its header's rect), since it moves while pinned. Near the top of the viewport,
or the top of the phone toolbar, the page auto-scrolls vertically, up to 16px a
frame within 48px of the edge. The drop position is the lifted row's centre
among the other rows' midpoints, except that a release with the pointer over
the home row lands first among the user rows and one over the Everyone row
lands last, whatever the pickup offset; no row ever goes below Everyone. Releasing inside the grid saves the order
through `store.move()` (nothing for a drop in place; no toast or
announcement). Esc (without clearing the selection), `pointercancel`, a release
outside the grid, a window resize and any height change in the home, Everyone
or user rows cancel: the rows go back and nothing is saved. The click or
`contextmenu` that ends a drag never opens the Popover. Under reduced motion the
rows jump into place and the lifted row keeps only its shadow (`--lift-scale`
is `1`).

Edit mode (`src/ui/app.js`, `src/ui/grid.js`): a ghost "Edit" button after the
legend in the Timelines card header (named "Edit time zones"; "Done", named
"Done editing time zones", while on) turns it on and off. It is `hidden` while
there are no user rows. Both labels sit in one grid cell (`.edit-toggle`, the
inactive one `visibility: hidden`) with `--space-2` inline padding, so its
width never changes and the card header doesn't reflow on a toggle; below
`--bp-md` it sits alone on a line above the grid, right-aligned, and never
wraps its label. The mode is held in memory only, survives grid
rebuilds (`data-editing` on the grid) and is off after a reload. In Edit mode
every user row header shows a Delete button (`.grid__delete`, an icon-only
ghost Button with the `remove` icon in `--color-danger`, named "Delete Tokyo",
between the trigger and the handle; `display: none` otherwise) and an enlarged
`--edit-handle-size` handle with an `--edit-handle-icon-size` grip, which drags
and opens the details exactly as before. The header becomes two lines at every
width: the visible trigger takes the first line, Delete and the handle follow
at the inline start, `--space-1` apart. Header widths don't change; the grid
is an inline-size container and the header's inline-end padding grows so its
content never passes the grid's visible width (at 320px with 200% text the
handle wraps under Delete). User rows grow taller while it is on (about 108px
on a phone at default text); the home and Everyone rows don't change. Delete
removes the row at once with the usual Undo toast, and focus moves to the
Delete button of the row now in its place, else the previous row's. When no
user row is left the mode ends and focus goes to Add city; Undo restores the
row with the mode as it is (focus on the row's trigger). Esc does one thing:
it cancels a drag, else closes an open sheet or popover, else clears the
selection, else leaves Edit mode (focus on a Delete button, or on a handle
that hides as the mode ends below `--bp-md`, then moves to the Edit button).

Scrolling: touch and trackpad scrolling are native; the grid sets
`overscroll-behavior-x: contain` and `touch-action: pan-x pan-y` so it never
takes over page scroll or swipe-back. A vertical mouse wheel over the grid
scrolls it sideways (at either end the wheel falls through to the page; a
horizontal or ctrl/pinch wheel is left to the browser). A mouse drag that
starts on the hour cells or Everyone segments scrolls it; tracks are
`user-select: none`, while header text stays selectable (and selecting it never
scrolls the timeline) and the header triggers work as before. With focus in the
grid, ←/→ scroll one column and Shift+←/→ six. The maths lives in
`src/lib/scroll.js`.

Selecting: a primary click, tap or pen tap on any track (a zone row or
Everyone) selects that instant, snapped to the nearest 15 minutes, for
`settings.defaultDuration` minutes (`src/lib/selection.js`; nothing is saved).
A press on a header selects nothing, and so does a mouse press that moves more
than `CLICK_SLOP_PX` (4px) before release (that is a drag-scroll) or a touch
that scrolls the grid. Pressing a track keeps focus on the grid root and never
scrolls it. A new selection replaces the old one and is announced politely
("Selected Wed 18 Nov, 09:00–10:00 Sydney, Best for all"). The rating is the
meeting's worst 15-minute slot over its whole duration
(`src/lib/selection-details.js`).

Band: one `aria-hidden` `.grid__selection` after the rows and before the now
line, so the line paints above it: a `--selection-edge-width` outline in
`--color-accent` on all four sides with no fill (cell text keeps its contrast),
`pointer-events: none`, crossing every row and passing under the sticky
headers. It carries `data-start` (ISO) and `data-duration` (minutes), shows
only while its start is inside the window, and is clipped at the window end.
The selection survives rebuilds, lazy extension, the date picker and Today.

Header selected times: while a slot is selected, every zone header shows that
zone's local time at the selection start, in the current 12/24-hour cycle.
From `--bp-md` it is a "Selected 03:30" line under the meta (`--font-size-xs`,
the time in `--font-mono` tabular numerals; it may wrap, never truncates), and
the live time stays; on user rows the line is inside the wide trigger, so it is
part of the button's name. Below `--bp-md` the header's second line shows the
selected time in place of the live time, with a `--border-width` outline in
`--color-accent` (shape, not colour alone) and the day badge hidden (the "DST"
and warning chips stay, as they describe now); a visually hidden "Selected " before it puts the word in the button's name, and
the details popover lists both times. The minute tick doesn't change them.

Keyboard slots: the home row's hour cells are a roving set. Exactly one has
`tabindex="0"` (the last one focused; at first the cell holding now, else the
first cell of the anchor date), so Tab goes grid → phone header button → slot
→ the user rows' header buttons and drag handles → the controls after it. On a slot, ←/→ move focus one home hour and
Shift+←/→ six, scrolling only as needed to keep the cell clear of the sticky
header (`scroll-padding-inline-start: var(--grid-header-width)`); near either
end lazy extension adds days as usual and focus stays on the same cell. Enter
or Space selects the slot's start and keeps focus. With focus on the grid root
or a header control, arrows still scroll. A slot's focus ring is an inset
`--focus-ring-width` outline in `--color-focus`, so the track can't clip it.

Clearing: the bar's × button (focus then goes to the grid) or Esc anywhere,
except that while a sheet or popover is open Esc closes that first and keeps
the selection. Clearing hides the band, the header selected times and the bar,
and announces "Selection cleared".

Now line: an `aria-hidden` `--now-line-width` line in `--color-accent`, the last
child of the grid, crossing every row. It is painted above the cells and below
the sticky headers, so it passes under the header column. The minute tick moves
it by updating `--now-left` only; cells are never rebuilt. On load the grid
scrolls so the line sits one third of the way across the visible track (the
part right of the headers). The toolbar's Now button, and N with focus in the
grid, bring it back; Now is disabled while the line is on screen. While another
date is shown and now is outside the window, the line is hidden and Now goes
back to today, like the Today button. Lazy extension moves the line with the
window. A rebuild (zone added or removed, weekend setting, another tab) keeps
the anchor date, the days loaded and the scroll position.

Hour cells show the compact time in a `.grid__label` element. After each build,
lazy extension, 12/24-hour switch and size change of the grid (a
`ResizeObserver`, which also catches root font-size changes), the grid measures
the widest label (with the repeat marker) plus `--space-1` on each side against
one column. If it doesn't fit, the grid gets `data-labels="alternate"` and
labels on odd hours get `visibility: hidden`: every second label shows. Text is
never shrunk to fit. Hidden labels stay in the cell's `aria-label`. Switching
the hour cycle rewrites every time in place, keeping the scroll position and
focus.
Filter: the toolbar's All / Good / Best control (`settings.filter`, saved and
followed across tabs; Reset all data returns to All) greys out, with masks
(§3.1), every instant whose Everyone rating it excludes. Layers in the grid,
bottom to top: cell fills (with the Good hatch, weekend band and Everyone Best
edge), the masks (after each track's cells), then hour labels, the repeat
marker, midnight dividers, then the Everyone track (opaque
`--color-surface-sunken`, after the zone rows, so the pinned row covers them),
then the selection band and the now line (all `z-index: 1`), then the sticky
row headers (`z-index: 2`, the Everyone header last, over the others), then
the lifted drag row (`z-index: 3`). The grid is `isolation: isolate`, so none of this
reaches the fixed toolbar. Changing the filter replaces only the masks and the
Everyone labels: no rebuild, and the scroll position, the date and the loaded
days stay. With All there are no masks. Lazy extension redraws them for the
new window.

No-overlap message: page pattern, not a shared component. A persistent
`.no-overlap` polite `role="status"` region sits in the Timelines card between
its header and the grid (below `--bp-md`, between the Edit button and the
grid), mounted empty and taking no space while empty. After
every build and filter change, under every filter, if the anchor date (the
date in the toolbar) has no qualifying slot (no Best under Best, no Best or
Good under Good and All), it shows "No time works for everyone
today" (`--font-weight-medium`) and a `secondary` "Show next day that works"
button, on `--color-surface-sunken` with a `--color-border-strong` hairline and
`--radius-md`. The button finds the first later date, up to 14 days on and not
past the last date the date control accepts, with a qualifying slot, and moves
there as picking that date does; if there is none, the date stays and the
button gives way to "No time works for everyone in the next 14 days either.".
Either way focus moves to the grid.

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
  timeline grid, ←/→ scroll one hour, Shift+←/→ six hours, N goes to now, T
  switches between 12-hour and 24-hour times (at every width), and 1, 2 and 3
  pick the All, Good and Best filter (announced as "Filter: Best" in the
  polite announcer); these keys work only while focus is inside the grid
  (WCAG 2.1.4: scoping them to the focused component needs no setting to turn
  them off), and are ignored with Alt, Ctrl or Meta held (N, T, 1, 2 and 3 also
  with Shift), so Alt+← stays browser Back. When the
  focused Now button disables itself, focus moves to the grid. The home row's
  hour cells are roving keyboard slots (one tab stop): on a slot, ←/→ move
  focus one hour and Shift+←/→ six, Enter or Space selects it, and N, T, 1, 2
  and 3 still work. Esc clears the selection unless a sheet or popover is open,
  which it closes instead. Each user row's drag handle is a button named
  "Reorder Tokyo" (the row's full name), the tab stop after the row's phone
  header button (or wide trigger) wherever it shows (below `--bp-md`, in Edit
  mode only); it opens the same details Popover, whose
  Move up / Move down are the keyboard alternative to dragging. A drag in
  progress cancels on Esc. The Timelines card's Edit button is named "Edit
  time zones", and "Done editing time zones" while Edit mode is on (the name
  changes instead of `aria-pressed`; both start with the visible text). In
  Edit mode each user row's Delete button is named "Delete Tokyo" and sits
  before its handle in the tab order. Esc cancels a drag, else closes a sheet
  or popover, else clears the selection, else leaves Edit mode; Shift, Ctrl,
  Meta or Alt with Esc leave the mode alone. The focused slot's name starts with its visible
  label, then the date, home time and name, the overall rating and each zone's
  time and rating for a `defaultDuration` meeting there ("9a, Wednesday 18
  November, 9:00 am Sydney. Best for everyone. London 10:00 pm Tuesday,
  Good.").
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
  "Update available" is announced when it appears. The DST banner is a third
  polite `role="status"` region after it; it is re-shown only when its text
  changes, so the minute tick never re-announces it. Entering Edit mode
  announces "Editing time zones. Each row has a Delete button and a reorder
  handle." and leaving it (Done, Esc or the automatic end) "Finished editing
  time zones." in the polite announcer.
- **Dialogs.** A sheet traps Tab and Shift+Tab inside itself, Esc closes it,
  and focus returns to the control that opened it.
- **Motion.** Respect `prefers-reduced-motion` (tokens collapse durations).
  Now, N and the arrow keys scroll smoothly only without reduced motion;
  wheel, drag, the first position and restores after a rebuild are instant.
- **Automated check.** E2E tests run axe-core against the page in both themes
  and fail on any WCAG A/AA violation.
  One documented exception: axe's Label in Name rule
  (`label-content-name-mismatch`, SC 2.5.3) is not applied to the hour cells
  that aren't the roving slot (`.grid__cell[data-hour]:not([tabindex="0"])`:
  user-row cells, which have no tabindex, and home cells with `tabindex="-1"`);
  it still runs on everything else, the roving slot included. A 12-hour cell
  shows the compact `9a` while its name is the full `9:00 am, Best`, which the
  rule's word match can't connect. Home hour cells are now focusable and
  activatable, but only as the roving slot, and the roving slot's name starts
  with its visible label ("9a, Wednesday 18 November, …"); the other cells
  can't be activated from the keyboard until they become the roving cell and
  take its name, and a click on them selects by position like any track. The
  name is a fuller form of the same time, so no user loses the visible label.
  `tests/e2e/helpers.js` applies the exclusion.
