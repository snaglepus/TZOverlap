# PRD — TZ Overlap

Nov 16, 2026 · @Rob · Status: Draft v1.0 · Audience: Claude Code (implementation)

## 1. Overview

**App name:** TZ Overlap

**Problem.** Coordinating meetings across 3–8 time zones is slow and error-prone. Existing tools are either heavy (ads, accounts, server round-trips) or don't make the *mutually acceptable* window obvious at a glance, and most handle daylight saving changes silently — which is exactly when meetings get missed.

**Product.** TZ Overlap is a lightweight, client-side-only web app that lays out the user's current time zone plus up to seven others as horizontal, scrollable timelines aligned on the same moment in time. Colour coding, including a heat map for the shoulder hours, shows which hours are ideal, acceptable or unacceptable in each zone and across all of them. Selecting a slot shows the exact local time in every zone. Sharing a proposal link and calendar export are planned for the next release (v1.1).

**Goals**

1. Find a time that works for everyone in under 10 seconds, on any device.
2. Zero server dependency: no back end, no accounts, no tracking; works fully offline once loaded.
3. Feel native on iPhone, iPad and Mac (Apple HIG), and equally good on Android and Windows.
4. Be tiny and fast: app shell under 50 KB gzipped, interactive in under 1 second on a mid-range phone on 4G.
5. Never get daylight saving wrong, and warn the user when a DST change affects the gap between zones.

**Success measures**

- Lighthouse scores ≥ 95 for Performance, Accessibility, Best Practices and PWA checks.
- 100% pass rate on the time-engine test suite, including the DST and non-hour-offset edge cases in section 11.
- No runtime third-party dependencies.
- Installable to the home screen on iOS and Android and fully functional in airplane mode.

## 2. Users and use cases

**Primary user:** a professional who works with colleagues, clients and suppliers across several continents and travels often (e.g. an executive or consultant based in Sydney working with teams in the US, UK and Asia).

**Core use cases**

- **UC1 — Glance:** "What time is it for the London team right now, and are they still at work?"
- **UC2 — Find a slot:** "When this week can Sydney, Singapore, London and San Francisco all meet within acceptable hours?"
- **UC3 — Confirm a slot:** "Tap a slot and read off the exact local time in each zone to put in my email or invite."
- **UC4 — Plan ahead:** "Will the gap to London be the same in three weeks?" (DST changes between hemispheres.)
- **UC5 — Travel:** "I've landed in Los Angeles; my home row should now be LA without me doing anything."
- *Planned for v1.1:* send the group a proposal link, and drop the agreed slot straight into a calendar.

## 3. Scope

**In scope (v1)**

- Horizontal, scrollable multi-zone timeline with a live current-time indicator.
- Current-location row (automatic, not editable) plus up to 7 user-selected zones (8 rows maximum).
- Add zone by city (browse popular list or type to search) or by UTC/GMT offset (e.g. GMT+11, UTC-7, +5:30).
- Change, delete and drag-to-reorder user zones.
- Meeting-suitability colour coding with a heat map across the Good hours, an overlap row across all zones, and an All / Good / Best filter.
- Live local time, date, offset and abbreviation per zone.
- 12/24-hour toggle; light, dark and system themes.
- Phone-first text and layout (the phone is the most common device).
- Local persistence of settings and zones.
- Full DST awareness, including DST-change warnings.
- **Added from suggestions:** date picker with DST warnings; day-boundary and weekend markers.
- Installable PWA with offline support and in-app install guidance.

**Out of scope (v1) — candidates for later**

- **Planned for v1.1:** shareable meeting proposal (link plus copy as text) and calendar export (.ics). Requirement IDs FR-37 to FR-43 are reserved for these.
- Per-zone labels (e.g. person or team names) and custom working hours per zone.
- Public holidays (needs a maintained dataset).
- Calendar integration (reading free/busy) — would need OAuth and a server.
- Accounts, sync across devices, analytics or telemetry.
- Multiple saved zone sets (e.g. one per client).

## 4. Functional requirements

Priority: **M** = must for v1, **S** = should for v1.

### 4.1 Timeline

- **FR-1 (M)** Each zone is a horizontal row. All rows are aligned on absolute time (UTC), so a vertical line through the grid is the same instant in every zone.
- **FR-2 (M)** The grid scrolls horizontally with a finger or trackpad (native scrolling), mouse wheel (vertical wheel mapped to horizontal), click-and-drag on desktop, and arrow keys. All rows scroll together.
- **FR-3 (M)** Hour cells are labelled with that zone's local hour (e.g. `9`, `9:30` or `9:45` for non-hour offsets — see section 5).
- **FR-4 (M)** On load the grid is scrolled so the current time sits about one third in from the left edge.
- **FR-5 (M)** A vertical "now" line, in the system accent colour, crosses all rows and moves every minute. A **Now** button returns to it whenever it is off screen.
- **FR-6 (M)** The rendered range covers at least yesterday, today and tomorrow of the home zone, extending lazily as the user scrolls (up to ±14 days), with the date picker (FR-30) for anything further.
- **FR-7 (M)** Tapping or clicking a column selects that time slot (snapping to 15 minutes; 60-minute default duration). The selection is shown as a highlighted vertical band, and the selected local time appears in each row header.

### 4.2 Home zone (current location)

- **FR-8 (M)** The first row is always the device's current time zone, from `Intl.DateTimeFormat().resolvedOptions().timeZone`. No location permission is requested.
- **FR-9 (M)** The home row cannot be edited, deleted or moved, and is visually marked (location symbol).
- **FR-10 (M)** The app re-checks the device time zone on launch, on `visibilitychange`/`focus`, and every minute. If it has changed (travel), the home row updates automatically and a brief toast says so (e.g. "You're now in Los Angeles time").
- **FR-11 (S)** If the new home zone is also in the user's list, that duplicate row is hidden (not deleted) while it matches the home zone.
- **FR-12 (M)** The home row shows a friendly city name derived from the IANA ID (e.g. `Australia/Sydney` → Sydney), using the bundled city list where possible.

### 4.3 Adding zones

- **FR-13 (M)** An **Add City** button opens a sheet (bottom sheet on phone, popover/modal on tablet and desktop).
- **FR-14 (M)** The sheet shows a scrollable list of about 100 popular cities, grouped by region, with each city's current local time and offset.
- **FR-15 (M)** A search field (auto-focused on desktop) filters as the user types: by city, country, IANA ID (e.g. `Europe/Lisbon`) and common aliases (e.g. "NYC", "Bombay"). It searches a bundled list of about 500 cities.
- **FR-16 (M)** The user can type a fixed offset in flexible formats: `GMT+11`, `UTC-7`, `+5:30`, `GMT+05:45`, `-0330`. A parsed offset appears as the top result ("UTC+11:00 (fixed, no daylight saving)").
- **FR-17 (S)** Ambiguous abbreviations (e.g. IST, CST) show all matching options rather than guessing.
- **FR-18 (M)** Maximum 7 user zones. At 7, Add City is disabled with a note: "Maximum of 7 time zones. Remove one to add another."
- **FR-19 (M)** Adding a zone already in the list (same IANA ID or same fixed offset) is blocked with a note.

### 4.4 Editing zones

- **FR-20 (M)** Each user row has an actions menu (tap the header, or right-click) with **Change**, **Move up**, **Move down** and **Delete**.
- **FR-21 (M)** **Change** reopens the Add City sheet and replaces the zone in place, keeping its position.
- **FR-22 (M)** **Delete** removes the row immediately with an **Undo** toast (5 seconds) rather than a confirmation dialog.
- **FR-23 (M) Drag to reorder.** Every user row has a grab handle (≡) in its header, available at all times. Dragging the handle picks the row up (lifted shadow, slight scale); the other rows animate out of the way and the new order saves on drop. On touch, a long press (\~400 ms) anywhere on the row header also picks the row up, with a light haptic where supported.
- **FR-23a (M)** While dragging, the view auto-scrolls when the row nears the top or bottom edge. Pressing Esc or dropping outside the list cancels and returns the row to where it was. The home row and the Overlap row are fixed: user rows cannot be dropped above them.
- **FR-23b (M)** An **Edit** mode (iOS list pattern) shows larger handles and delete buttons on all rows at once, for quick tidying. **Move up / Move down** in the actions menu are the keyboard and screen-reader alternative, and the new position is announced ("London moved to position 2 of 5").
- **FR-23c (M)** Dragging must never conflict with horizontal timeline scrolling: a reorder only starts from the header column (handle or long press), never from the hour cells.

### 4.5 Zone row header

- **FR-24 (M)** Each row header shows: city or offset name, live local time (updates every minute), short date (e.g. "Tue 17 Nov"), UTC offset and abbreviation where available (e.g. "AEDT · UTC+11").
- **FR-25 (M)** The header shows the day difference relative to home when different: "Tomorrow", "Yesterday" or "+1 day" / "−1 day".
- **FR-26 (S)** A small DST badge appears when that zone is currently observing daylight saving, and a warning badge when a DST change occurs within the next 14 days (tapping it explains the change).
- **FR-27 (M)** When a slot is selected (FR-7), the header also shows the selected local time for that zone.

### 4.6 Meeting suitability

- **FR-28 (M)** Every cell is colour-coded by its local hour: **Best** (09:00–17:00) solid green; **Good** (06:00–09:00 and 17:00–20:00) shown as a heat map plus a diagonal hatch; **Unsuitable** (20:00–06:00) dimmed grey. See section 5.1.
- **FR-28a (M) Good-hours heat map.** Within the Good bands, colour shifts with distance from the Best window. Hours next to Best (08:00–09:00, 17:00–18:00) look yellow-green, the middle hours (07:00–08:00, 18:00–19:00) amber, and hours next to Unsuitable (06:00–07:00, 19:00–20:00) red-orange. The hatch stays on every Good cell so meaning never relies on colour alone.
- **FR-29 (M)** An **Overlap** row, pinned below the home row, shows for each slot the *worst* rating across all zones: Best only if every zone is Best, Good if every zone is at least Good, otherwise Unsuitable. For Good slots, the heat colour reflects the zone furthest from its Best window.
- **FR-29a (M)** A segmented control offers **All / Good / Best**. *All* shows the colour coding. *Good* highlights only slots where every zone is 06:00–20:00 and greys out everything else. *Best* does the same for 09:00–17:00 in every zone.
- **FR-29b (S)** When the filter is *Good* or *Best* and no qualifying slot exists in the visible day, show an inline message: "No time works for everyone today", with a button to jump to the next day that has one.

### 4.7 Date picker and DST warnings (added)

- **FR-30 (M)** A date control (native `<input type="date">`, labelled "Today" by default) jumps the timeline to any date. A **Today** button returns.
- **FR-31 (M)** When the selected date is on the other side of a DST change for any zone, a banner explains the effect, e.g. "London moves to BST on Sun 29 Mar. The gap to Sydney changes from 11 h to 10 h."
- **FR-32 (M)** All offsets, labels and colours on a future date reflect the rules that apply *on that date*, not today's.

### 4.8 Day-boundary and weekend markers (added)

- **FR-33 (M)** At local midnight in each row, a divider is drawn with that zone's date label (e.g. "Wed 18").
- **FR-34 (M)** Weekend hours are shaded in each row according to that zone's weekend days (Sat–Sun by default; Fri–Sat for, for example, Saudi Arabia, Israel and Egypt; Sun only where applicable). The country-to-weekend map ships with the city data.
- **FR-35 (M)** Weekend slots count as **Unsuitable** in the overlap row unless the user turns off "Treat weekends as unavailable" in Settings (on by default).
- **FR-36 (S)** Fixed-offset zones default to a Sat–Sun weekend.

### 4.9 Deferred to v1.1: sharing and calendar export

The shareable meeting proposal (link plus copy as text) and calendar export (.ics) are out of scope for v1 and planned for the next release. Requirement IDs FR-37 to FR-43 are reserved for them. v1 should keep slot selection (FR-7) and the per-zone selected times (FR-27) cleanly separated in code so these features can be added without rework.

### 4.10 Settings and preferences

- **FR-44 (M)** **12h / 24h** toggle. Default follows the locale's hour cycle (`Intl.DateTimeFormat().resolvedOptions().hourCycle`).
- **FR-45 (M)** **Appearance**: System (default), Light, Dark.
- **FR-46 (M)** **Treat weekends as unavailable** (on by default).
- **FR-47 (S)** **Reset** all data, with confirmation.
- **FR-48 (M)** All settings and zones persist across visits (section 8).

## 5. Meeting-time rules and overlap logic

### 5.1 Rating bands (local time in each zone)

| Rating | Local time | Colour (light and dark variants) | Non-colour cue |
| --- | --- | --- | --- |
| Best | 09:00 – 17:00 | Solid green | Solid fill |
| Good | 06:00 – 09:00 and 17:00 – 20:00 | Heat map: yellow-green next to Best → amber → red-orange next to Unsuitable | Diagonal hatch |
| Unsuitable | 20:00 – 06:00, and weekends if enabled | Grey, dimmed | No fill, muted text |

Intervals are half-open: 17:00 counts as Good, 09:00 counts as Best. The bands and heat-map colours are constants in one module so they can become user-configurable later.

### 5.1a Good-hours heat map

- Each Good 15-minute slot gets a distance *d* in minutes from the Best window: 0 for the slot touching Best (08:45 or 17:00), rising to 165 for the slot touching Unsuitable (06:00 or 19:45).
- Cell colour = `color-mix(in oklch, var(--heat-near), var(--heat-far) p%)` where *p* = *d* ÷ 165 × 100. `--heat-near` is a yellow-green and `--heat-far` a red-orange, each with light and dark values. Native CSS, no library.
- With 1-hour blocks this reads as three clear steps per Good band (08–09 / 17–18 greenest, 06–07 / 19–20 reddest), with smooth 15-minute steps where a zone has a :30 or :45 offset.
- Best stays one solid green and Unsuitable a dimmed grey, so the three bands stay easy to tell apart. The heat map only adds nuance inside Good.
- Overlap row: for slots rated Good overall, use the largest *d* across all zones (the person furthest from their working day).
- Text on every heat step must keep ≥ 4.5:1 contrast in both themes. Test the greenest and reddest steps explicitly.
- Fallback for browsers without `color-mix`: three fixed colours, one per hour step.

### 5.2 Internal resolution

- The engine works in **15-minute slots** on absolute UTC time. This handles every real-world offset: :00, :30 (India, parts of Australia, Iran, Newfoundland) and :45 (Nepal, Chatham Islands, Eucla).
- Each slot gets a rating per zone. The overlap rating for a slot is the minimum across all zones (Unsuitable < Good < Best).
- A selected meeting (start + duration) is rated as the worst slot it covers.

### 5.3 Rendering non-hour offsets with 1-hour blocks

- The visible grid uses **one column per hour of the home zone**.
- Each row draws its own hour cells, positioned by absolute time from the instant that zone's clock reads HH:00. For a zone offset by :30 from home, its cells straddle the home columns, shifted half a column. For :45 they shift three quarters of a column.
- Cell labels show the zone's local hour ("9", "10"), and the row header notes the offset (e.g. "+5:30") so the shift is understood.
- The overlap row is drawn in 15-minute segments so its edges are exact, e.g. a Best window that starts at 14:30 home time.
- When a slot is selected, it snaps to 15 minutes and every row header shows the exact local time (e.g. 03:30).

### 5.4 DST and offset calculation

- Use the browser's built-in time zone database through `Intl.DateTimeFormat` with `timeZone`. No bundled tz data and no libraries.
- `offsetMinutes(zone, instant)`: format the instant with `formatToParts` (hourCycle `h23`) in the target zone, rebuild it as a UTC timestamp and subtract. Cache one formatter per zone.
- Precompute offsets for the visible window. Detect transitions by comparing hourly samples, then binary-search to the minute.
- Days with a transition have 23 or 25 local hours (Lord Howe Island: 23.5 or 24.5). The skipped hour simply doesn't appear. A repeated hour appears twice, the second labelled with a small "2" superscript and a tooltip ("Clocks go back — this hour repeats").
- **Fixed offsets** (GMT+11 etc.) are stored as `{kind: "fixed", minutes: 660}` and calculated directly. Do **not** map them to `Etc/GMT±N` IDs: those have inverted signs (`Etc/GMT-11` is UTC+11) and cannot represent :30 or :45. Fixed zones show a "No DST" note.
- `Temporal` may be used as a progressive enhancement where available, but the `Intl` path is the baseline and must pass all tests on its own.

### 5.5 Weekends

- Each slot is also tagged weekend/weekday per zone, using that zone's local date and its country's weekend days.
- With "Treat weekends as unavailable" on, weekend slots rate as Unsuitable regardless of hour.

## 6. UX and UI guidelines

The design follows Apple's Human Interface Guidelines: clarity, deference to content, and depth through layering. It should feel at home on iOS and macOS without looking out of place elsewhere.

### 6.1 Principles

- **Content first.** The timeline is the app. Chrome (toolbars, controls) is minimal, translucent and gets out of the way.
- **One primary action per screen.** On the main screen it's finding and selecting a time. Add City, the date picker and Settings are secondary.
- **Direct manipulation.** Scroll, tap a slot, drag to reorder. No modes beyond the iOS-style Edit mode.
- **Forgiving.** Undo instead of confirmation dialogs (except Reset).

### 6.2 Visual language

- **Typography:** system font stack (`-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif`), with tabular numerals (`font-variant-numeric: tabular-nums`) for all times. Sizes in `rem` so they respect the user's text size.
- **Colour:** semantic CSS custom properties modelled on Apple system colours (label, secondaryLabel, systemBackground, secondarySystemBackground, separator, systemGreen, systemOrange, systemGray, accent = systemBlue), each with light and dark values.
- **Materials:** translucent toolbars and sheets with `backdrop-filter: blur()` and a solid fallback.
- **Icons:** a handful of inline SVG symbols in the style of SF Symbols (plus, location, calendar, gear, line.3.horizontal, trash). No icon font.
- **Corners and spacing:** 8 pt grid; 10–12 pt corner radius on cards and sheets; hairline separators.
- **Motion:** short, physics-like transitions (200–300 ms ease-out); everything respects `prefers-reduced-motion`.

### 6.3 Layout by device

|  | Phone (< 600 px) | Tablet (600–1024 px) | Desktop (> 1024 px) |
| --- | --- | --- | --- |
| Row header | Sticky left column (\~112 px): city, time, day badge. Offset and abbreviation on tap. | Sticky left column (\~180 px) with all header details | Sticky left column (\~220 px) with all details |
| Hours visible | \~6 | \~12 | 24 or more |
| Toolbar | Bottom toolbar: Add, Filter, Today, Now, Settings | Top toolbar | Top toolbar plus keyboard shortcuts |
| Sheets | Bottom sheet, swipe to dismiss | Centred modal/popover | Popover anchored to its button |
| Row height | 56 px minimum | 64 px | 64 px |

- **Phone portrait is the primary design target.** Design and build mobile-first; the tablet and desktop layouts extend the phone layout. Every screen is reviewed on a phone first. Text rules are in section 6.7.
- Respect safe areas with `env(safe-area-inset-*)` and `viewport-fit=cover`.
- Touch targets of at least 44 × 44 pt.
- Portrait and landscape are both supported. In landscape on phone, more hours are shown rather than taller rows.

### 6.4 Main screen structure (top to bottom)

1. Title bar: "TZ Overlap", date control ("Today"), 12/24 toggle (desktop) and Settings.
2. Filter segmented control: **All · Good · Best**.
3. Home row (location symbol, not editable or movable).
4. Overlap row (pinned, labelled "Everyone").
5. User rows (1–7), each with a grab handle for drag-to-reorder.
6. Add City button as the last row (hidden at 7 zones, replaced by the limit note).
7. Selection bar (appears when a slot is selected): "Wed 18 Nov, 09:00–10:00 Sydney · Best for all", with a clear (×) button. Share and Add to Calendar buttons arrive in v1.1.

### 6.5 Empty and first-run states

- First run: home row only, with a friendly prompt ("Add the cities you work with") and the Add City button highlighted.
- One-time, dismissible install hint on mobile browsers that aren't yet installed (see section 9).

### 6.6 Keyboard (desktop)

- ← / → scroll by an hour; Shift + ← / → by six hours; **N** = now; **A** = add city; **T** = 12/24 toggle; **1 / 2 / 3** = All / Good / Best; **Esc** closes sheets and clears selection.

### 6.7 Text on phone (primary use)

Most use will be on a phone, so every piece of text must fit and stay readable at phone widths (320–430 px) and at large text sizes.

- **Minimum sizes:** body text 17 px (1.0625 rem); hour labels and secondary text no smaller than 13 px; nothing below 11 px (Apple's minimum). All sizes in `rem` so they scale with the user's text-size setting.
- **Row header on phone:** two lines at most. Line 1: city name (semibold). Line 2: local time (large, tabular numerals) plus a compact day badge ("+1", "−1"). Offset, abbreviation and full date appear in a popover on tap.
- **Long city names:** use a short display name from the city data where one exists (e.g. "Ho Chi Minh" for Ho Chi Minh City, "Rio" for Rio de Janeiro); otherwise truncate with an ellipsis. The full name is always in the accessible label and the popover.
- **Compact formats on phone:** dates as "Tue 17" rather than "Tuesday 17 November"; 12-hour cell labels as "9a" / "9p" ("12p" for noon); 24-hour cell labels as "09". Row headers use the full format ("9:30 am" / "09:30").
- **Labels that don't fit:** if a cell is too narrow for its label (large text, :45 offsets), show every second label rather than shrinking or overlapping text.
- **Banners, toasts and messages:** written short for phone first (e.g. "London: clocks go forward 29 Mar. Gap now 10 h."), wrapping to at most two lines and never truncated. Longer explanations open in a sheet on tap.
- **Selection bar:** two lines on phone (date and time on line 1, rating on line 2).
- **Large text:** at up to 200% text size the header column widens (to at most 40% of the screen), rows grow taller, and nothing clips or overlaps.
- **Overflow:** every text container sets `min-width: 0` and `overflow-wrap: anywhere`, so text can never cause horizontal page scrolling.
- **Test widths:** 320, 375, 390 and 430 px, at default and largest text size, in both themes.

## 7. Technical architecture and constraints

### 7.1 Hard constraints

- **Client-side only.** No API calls, no back end, no third-party requests at runtime (no fonts, CDNs or analytics). Everything is served as static files.
- **No runtime libraries or frameworks.** Vanilla HTML, CSS and JavaScript (ES2022 modules). Dev-only tools for testing are allowed (section 11). Claude Code must ask before adding any dependency, dev or otherwise.
- **No build step required to run.** The app must run straight from the source folder on any static server. An optional minify step (e.g. esbuild as a dev dependency) may produce `/dist` for deployment.
- **Size budget:** app shell (HTML + CSS + JS, excluding city data) ≤ 50 KB gzipped; city data ≤ 40 KB gzipped and lazy-loaded when the Add City sheet first opens (and pre-cached by the service worker).

### 7.2 Platform APIs used

| Need | Native API |
| --- | --- |
| Time zone maths, DST, formatting | `Intl.DateTimeFormat` (`timeZone`, `formatToParts`, `timeZoneName: "shortOffset" / "short"`) |
| List of valid IANA zones | `Intl.supportedValuesOf("timeZone")` (validation and search fallback) |
| Locale defaults (12/24h) | `Intl.DateTimeFormat().resolvedOptions()` |
| Persistence | `localStorage` (JSON, versioned) plus `navigator.storage.persist()` |
| Offline and install | Service Worker, Cache Storage, Web App Manifest |
| Theme | `prefers-color-scheme`, CSS custom properties, `color-scheme` |
| Heat-map colours | CSS `color-mix(in oklch, …)` with custom properties |
| Scrolling | Native `overflow-x: auto`, `scroll-snap` (optional) |
| Drag to reorder | Pointer Events with pointer capture; `navigator.vibrate` for the pickup haptic where supported (no HTML5 drag-and-drop, which is poor on touch) |
| Rendering efficiency | `IntersectionObserver` for lazy range extension; `requestAnimationFrame` |

### 7.3 Module structure

- `time-engine.js`: pure functions with no DOM: offsets, transitions, slot generation, ratings, heat distance, overlap, weekend tagging, fixed-offset parsing. 100% unit-tested.
- `zones.js`: zone model, validation, display names (including short names for phone), city search.
- `store.js`: load/save/migrate state; storage-event sync between tabs.
- `timeline.js`: renders the grid; scrolling, now line, selection.
- `reorder.js`: drag-to-reorder with Pointer Events, auto-scroll, cancel, and the keyboard alternative.
- `sheets.js`: Add/Change City sheet, Settings, install guidance.
- `strings.js`: all UI text, with short (phone) and long variants where needed.
- `app.js`: wiring, clock tick, home-zone checks.
- `sw.js`: service worker.

### 7.4 Rendering approach

- Plain DOM with `<template>` cloning and targeted updates. No virtual DOM.
- One shared horizontal scroll container for all rows (rows inside it, headers sticky with `position: sticky; left: 0`), so all rows stay in sync without JavaScript.
- Cells are absolutely positioned within each row (`left` = minutes from window start × pixels per minute). This is what makes :30 and :45 offsets and DST days render correctly.
- The clock tick runs once a minute, aligned to the minute boundary, and only updates the now line, header times and day badges.
- Target: about 1,000 DOM nodes at most for a 3-day window with 8 rows.

## 8. Data model and persistence

### 8.1 Stored state

Stored in `localStorage` under the key `tzoverlap.state` as JSON:

```json
{
  "version": 1,
  "zones": [
    { "id": "z_8f3a", "kind": "iana", "tz": "Europe/London", "label": "London", "country": "GB" },
    { "id": "z_19bc", "kind": "iana", "tz": "America/Los_Angeles", "label": "San Francisco", "country": "US" },
    { "id": "z_77d0", "kind": "fixed", "minutes": 330, "label": "UTC+5:30" }
  ],
  "settings": {
    "hourCycle": "auto",
    "theme": "system",
    "filter": "all",
    "weekendsUnavailable": true,
    "defaultDuration": 60
  },
  "meta": { "installHintDismissed": false, "lastHomeTz": "Australia/Sydney" }
}
```

- The home zone is **not** stored as a zone. It is always computed from the device. `lastHomeTz` is used only to detect a change and show the travel toast.
- `zones` holds at most 7 items. The order of the array is the display order.
- `label` keeps the city the user chose (e.g. "San Francisco" even though the zone ID is `America/Los_Angeles`).

### 8.2 Persistence rules

- Save on every change (debounced 250 ms), including each completed drag-reorder. Load synchronously at start-up before the first render to avoid a flash of empty state.
- `version` drives a simple migration function. Unknown or corrupt state is backed up to `tzoverlap.state.bak` and reset to defaults, with a toast.
- Call `navigator.storage.persist()` after the first zone is added.
- Listen for the `storage` event so two open tabs stay in sync.
- Note: Safari may clear storage for websites not visited in 7 days. Home-screen installed web apps are not subject to this, which is another reason to encourage installation (section 9).

### 8.3 Bundled city data (`cities.json`)

- About 500 cities: name, ASCII name, aliases, country code, IANA zone, population rank, and a `popular` flag (about 100).
- A country-to-weekend map (e.g. `{"SA": [5,6], "IL": [5,6], "default": [6,0]}`, where 0 = Sunday).
- A small abbreviation table for search (e.g. AEST, AEDT, GMT, BST, CET, EST, PST, IST→\[India, Ireland, Israel\]).
- Generated once by a dev script from a public-domain source (e.g. GeoNames cities15000) and committed. Never fetched at runtime.

## 9. PWA: home-screen install and offline

### 9.1 Requirements

- **PWA-1 (M)** `manifest.webmanifest` with `name: "TZ Overlap"`, `short_name: "TZ Overlap"`, `start_url: "."`, `scope: "."`, `display: "standalone"`, `theme_color` and `background_color` (light and dark via `media` on the `theme-color` meta tags), and icons at 192 and 512 px (standard and maskable).
- **PWA-2 (M)** iOS meta tags: `apple-touch-icon` (180 px), `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title: TZ Overlap`.
- **PWA-3 (M)** A service worker pre-caches the app shell and `cities.json` at install (cache-first). Cache names are versioned (e.g. `tzoverlap-v1.0.3`) and old caches are deleted on activate.
- **PWA-4 (M)** Every feature works fully offline after the first visit.
- **PWA-5 (M)** When a new version is waiting, show a non-blocking banner: "Update available — Reload". Never force-reload mid-use.
- **PWA-6 (M)** Must be served over HTTPS (required for service workers). Any static host works: GitHub Pages, Cloudflare Pages or Netlify.

### 9.2 In-app install guidance

- **PWA-7 (M)** Chrome, Edge and Samsung Internet (Android and desktop): capture `beforeinstallprompt` and show an **Install app** button in Settings (and in the one-time hint).
- **PWA-8 (M)** iOS and iPadOS (Safari, and other browsers using the Share menu): there is no install prompt API, so detect iOS when not running standalone (`navigator.standalone`, `display-mode: standalone`) and show a one-time, dismissible sheet with the steps below and a small illustration of the Share icon.
- **PWA-9 (S)** macOS Safari: show "File → Add to Dock" guidance in Settings.
- **PWA-10 (M)** Never show install guidance when already running as an installed app.

### 9.3 End-user install instructions (also shown in app under Settings → Install)

**iPhone or iPad**

1. Open the app's address in Safari.
2. Tap the **Share** button (square with an up arrow).
3. Scroll down and tap **Add to Home Screen** (you may need to tap "View More" first).
4. Check that "Open as Web App" is on if shown, then tap **Add**.
5. Open it from the home screen. It runs full screen and works without a connection.

**Android (Chrome)**

1. Open the app's address in Chrome.
2. Tap **Install app** in the app's Settings, or the browser's ⋮ menu → **Add to Home screen / Install app**.
3. Confirm with **Install**.

**Mac, Windows or Linux desktop**

- Chrome or Edge: click the install icon in the address bar (or menu → **Install TZ Overlap**).
- Safari on Mac: **File → Add to Dock**.

## 10. Non-functional requirements

### 10.1 Performance

- First contentful paint < 1.0 s and interactive < 1.5 s on a mid-range Android phone over 4G (Lighthouse mobile profile). Repeat visits from cache < 0.5 s.
- Scrolling at 60 fps on an iPhone 12-class device and above. No layout thrash: only `transform`/`opacity` animations.
- Main-thread work per clock tick < 4 ms.

### 10.2 Accessibility (WCAG 2.2 AA)

- Meaning never relies on colour alone: hatch patterns, plus text such as "Best for all" in the selection bar.
- Colour contrast ≥ 4.5:1 for text and ≥ 3:1 for meaningful graphics, in both themes.
- Full keyboard operation with visible focus rings.
- Screen readers: the timeline is a labelled `role="grid"`; each focused slot announces, for example, "Wednesday 18 November, 9 AM Sydney. Best for everyone. London 10 PM Tuesday, Good." Live region for toasts.
- Respect `prefers-reduced-motion`, `prefers-contrast` and text-size settings.

### 10.3 Privacy and security

- No data leaves the device. No cookies, analytics or third-party requests.
- Strict Content-Security-Policy via meta tag: `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'`.
- Stored state is validated on load (zone IDs checked against `Intl.supportedValuesOf`, offsets within ±14:00, at most 7 zones). User-typed text is never inserted with `innerHTML`.

### 10.4 Browser support

- Last two major versions of Safari (iOS, iPadOS, macOS), Chrome (Android, desktop), Edge and Firefox. Samsung Internet current.
- Graceful degradation: without a service worker → still works online; without `backdrop-filter` → solid toolbars; without `color-mix` → three fixed heat colours; without `navigator.vibrate` (e.g. iOS) → drag pickup without haptic.

### 10.5 Localisation

- v1 UI in English (en-AU spelling). Date and time formats follow the user's locale via `Intl`. Strings live in one module to allow translation later.

## 11. Acceptance criteria and test plan

### 11.1 Test layers

- **Unit (time engine, heat distance, store):** Node's built-in test runner (`node --test`). No test framework needed. Clock and home zone are injectable so tests are deterministic.
- **End-to-end:** Playwright (dev dependency only) across WebKit, Chromium and Firefox, at phone (390 × 844 and 320 × 568), tablet (820 × 1180) and desktop (1440 × 900) sizes. Phone is the primary test profile. Uses `timezoneId` and a mocked clock to simulate travel and DST dates, and touch emulation for drag-to-reorder.
- **Audits:** Lighthouse CI and axe-core (dev only) on every phase.
- **Manual:** install and offline checks, drag-to-reorder and text at the largest text size, on a real iPhone and a real Android phone.

### 11.2 Time-engine edge cases (must all pass)

| # | Case | Expected |
| --- | --- | --- |
| T1 | Sydney ↔ London, 1 Mar vs 6 Apr 2026 | Gap 11 h → 10 h after London's DST start (29 Mar) → 9 h after Sydney's DST end (5 Apr) |
| T2 | Mumbai (UTC+5:30) vs Sydney | Cells offset by half a column; overlap edges at :30 |
| T3 | Kathmandu (UTC+5:45), Chatham Islands (UTC+12:45 / +13:45) | Correct :45 positioning and labels |
| T4 | Lord Howe Island | 30-minute DST shift; 23.5 h and 24.5 h days render correctly |
| T5 | Kiritimati (UTC+14) and Pago Pago (UTC−11) | Same clock time, 25 h apart; dates and day badges correct |
| T6 | US fall-back day in New York | 1 AM hour shown twice, the second marked |
| T7 | Input "GMT+11", "UTC-7", "+5:30", "-0330", "gmt +11" | Parse to +660, −420, +330, −210, +660 minutes; "GMT+15" rejected |
| T8 | Fixed zone UTC+10 vs Australia/Sydney in January | 1 h difference (Sydney on DST, fixed is not) |
| T9 | Riyadh weekend | Fri–Sat shaded, not Sat–Sun |
| T10 | Overlap with 8 zones spanning > 16 h | Best: none; Good: correct windows or the "no time works" message |

### 11.3 Feature acceptance (Given / When / Then)

- **AC-1 Home zone:** Given the device zone is Australia/Sydney, when the app loads, then the first row shows Sydney with a location symbol and no edit or drag actions.
- **AC-2 Travel:** Given the app is open and the device zone changes to America/Los\_Angeles, when the app regains focus (or within 60 s), then the home row shows Los Angeles and a toast confirms the change. User zones are unchanged.
- **AC-3 Limit:** Given 7 user zones, then Add City is replaced by the limit note.
- **AC-4 Persistence:** Given the user adds, drags to reorder and deletes zones and switches to 24h and Dark, when the page is closed and reopened (online or offline), then everything is exactly as they left it.
- **AC-5 Now:** On load, the now line is visible about one third in from the left, and **Now** returns to it from any scroll position.
- **AC-6 Filters:** With Best selected, only slots where every zone is 09:00–17:00 on a weekday are highlighted; all other slots are greyed out in every row.
- **AC-7 Drag to reorder:** Given 4 user zones on a phone, when the user drags the third row's handle (or long-presses its header) and drops it at the top of the user rows, then it becomes the first user row below the Overlap row, the order persists after reload, and the timeline did not scroll horizontally during the drag. Esc or dropping outside the list restores the original order.
- **AC-8 Heat map:** In a single zone, the 08:00 and 17:00 cells are visibly greener than the 07:00 and 18:00 cells, which are greener than the 06:00 and 19:00 cells. All Good cells carry the hatch, and the Overlap row uses the reddest step among its zones.
- **AC-9 DST warning:** Given Sydney and London in the list, when the date picker is set to 10 Apr 2026, then a banner explains both DST changes and the new 9 h gap.
- **AC-10 Offline install:** After installing to the home screen and enabling airplane mode, the app launches and every feature works.
- **AC-11 Theme:** With Appearance set to System, switching the OS between light and dark updates the app immediately, with no reload.
- **AC-12 Responsive:** At 320 px width there is no horizontal page overflow (only the timeline scrolls), and every control is reachable.
- **AC-13 Phone text:** At 320 px and 390 px, at default and 200% text size, no text clips, overlaps or is truncated except city names (with ellipsis and full name on tap). Banners and toasts fit in two lines.

## 12. Build plan for Claude Code

### 12.1 Working rules for Claude Code

- Save this PRD in the repo as `docs/PRD.md` and treat it as the source of truth. Reference requirement IDs (FR-x, PWA-x, AC-x, Tx) in commits and tests.
- Add a short `CLAUDE.md` restating the hard constraints: no runtime dependencies, no network calls, size budget, vanilla ES modules, ask before adding any dev dependency.
- Build the time engine test-first. No UI work until T1–T10 pass.
- Each phase ends with: all tests green, Lighthouse and axe run, size budget checked by a script (`npm run size`), and a short changelog entry.
- Keep files small and modules pure where possible. No global state outside `store.js`.

### 12.2 Suggested repository structure

```text
/
├─ index.html
├─ manifest.webmanifest
├─ sw.js
├─ css/app.css
├─ js/
│  ├─ app.js  time-engine.js  zones.js  store.js
│  ├─ timeline.js  reorder.js  sheets.js  strings.js
├─ data/cities.json
├─ icons/ (192, 512, maskable, apple-touch-icon, SVG symbols)
├─ scripts/ (build-cities.mjs, size-check.mjs, minify.mjs)
├─ tests/unit/  tests/e2e/
├─ docs/PRD.md
└─ CLAUDE.md
```

### 12.3 Phases

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| P0 Foundations | Repo, CLAUDE.md, CSP, design tokens (light/dark, heat colours), phone-first type scale, test harness | `node --test` and Playwright run; blank app shell under budget |
| P1 Time engine | Offsets, transitions, slots, ratings, heat distance, overlap, weekends, fixed-offset parser | T1–T10 pass |
| P2 Timeline | Home row, grid, scrolling (touch, wheel, drag, keys), now line, Now button, 12/24, theme, phone text rules | AC-1, AC-5, AC-11, AC-12, AC-13 |
| P3 Zone management | City data script, Add City sheet (list + search + offsets), change, delete with undo, drag-to-reorder and Edit mode, limit, persistence, travel detection | AC-2, AC-3, AC-4, AC-7 |
| P4 Meeting suitability | Colour coding, Good-hours heat map, overlap row, All/Good/Best filter, selection and selection bar | AC-6, AC-8 |
| P5 Date and markers | Date picker, DST banners and badges, midnight dividers, weekend shading | AC-9, T9 |
| P6 PWA | Manifest, icons, service worker, update banner, install guidance | AC-10; Lighthouse PWA checks pass |
| P7 Polish | Accessibility pass, performance tuning, motion, empty states, copy review on phone | All AC pass; Lighthouse ≥ 95 across the board |
| v1.1 (later) | Share proposal link and copy as text; calendar export (.ics) | Separate PRD update |

### 12.4 Deployment

- Static hosting over HTTPS (GitHub Pages recommended for simplicity). A GitHub Action runs unit tests, e2e tests and the size check, then publishes `/dist`.
- Bump the service-worker cache version on every release.

## 13. Risks, decisions and open questions

### 13.1 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Browser tz data out of date on old devices (governments change DST rules at short notice) | Wrong offset for some zones | Accept: browsers update tz data with OS updates. Show offsets explicitly so errors are visible. |
| Safari storage eviction for websites not visited in 7 days | Saved zones lost | Encourage install (exempt); `storage.persist()` |
| Horizontal timeline scroll conflicting with vertical page scroll and swipe-back on mobile | Frustrating gestures | Single scroll container, `overscroll-behavior-x: contain`, `touch-action: pan-x pan-y`; test on real devices |
| Drag-to-reorder conflicting with scrolling, or fiddly on small screens | Accidental moves or failed drags | Drag only from the header column (handle or long press); large handles in Edit mode; Move up/down fallback; test on real phones |
| Heat-map colours hard to distinguish (colour vision, bright sunlight) | Misread suitability | Keep the hatch on all Good cells; check contrast in both themes; the Overlap row and selection bar state the rating in words |
| Ambiguous city and abbreviation searches (e.g. "Portland", "IST") | Wrong zone added | Always show country and current time in results; list all matches for abbreviations |
| Fixed offsets misunderstood as "the time in that place" | Missed meetings after DST | Label fixed zones "No DST"; suggest a city when one obviously matches |

### 13.2 Decisions made

- App name: **TZ Overlap**.
- Home zone comes from the browser time zone (no geolocation) and follows the user when they travel.
- Current zone plus up to 7 user zones (8 rows).
- 1-hour visual blocks; 15-minute engine resolution for :30 and :45 offsets.
- The overlap rating is the worst across all zones; filters apply to everyone, not per row.
- Good hours use a heat map (green near Best, red near Unsuitable) as well as the hatch.
- User zones can be dragged to reorder at any time, plus an Edit mode and keyboard alternative.
- The phone is the primary device; text and layout are designed for it first.
- Date picker with DST warnings and day/weekend markers are in v1. Share link and calendar export are deferred to v1.1. Labels and custom hours are deferred.
- Built by Claude Code, with in-app and documented home-screen install and full offline support.
- `localStorage` over IndexedDB: the data is tiny and loads synchronously, which avoids a flash on start-up.

### 13.3 Open questions

1. Domain for TZ Overlap, and hosting choice (GitHub Pages vs Cloudflare Pages).
2. Default selection length: 60 minutes assumed.
3. Should weekends count as unavailable by default? Assumed yes.
4. For v1.1 sharing: should the link include the sender's name or an optional note?
5. Should per-zone labels and custom hours come in v1.1 alongside sharing and calendar export, or later?
