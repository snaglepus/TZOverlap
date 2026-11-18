// What a selection means in every zone: its end, each zone's local start and
// end times and rating, and the meeting's overall rating, plus the wording for
// the selection bar and a focused slot. Pure (no DOM): sharing and calendar
// export can reuse it.

import { strings } from '../ui/strings.js';
import { longDate, longWeekday, shortDate } from './row-header.js';
import { buildSlots, combineRatings, rateMeeting } from './suitability.js';
import { formatTime } from './time-format.js';
import { zoneLocalParts } from './zones.js';

/**
 * @typedef {import('./selection.js').Selection} Selection
 * @typedef {import('./grid.js').GridZone} GridZone
 * @typedef {import('./suitability.js').RatingResult} RatingResult
 * @typedef {import('./time-format.js').HourCycle} HourCycle
 * @typedef {ReturnType<typeof zoneLocalParts>} LocalTime
 * @typedef {{ zone: GridZone, start: LocalTime, end: LocalTime, rating: RatingResult }} ZoneDetails
 * @typedef {{ start: Date, end: Date, rating: RatingResult, zones: ZoneDetails[] }} SelectionDetails
 */

/**
 * Start, end and rating of `selection` overall and in each zone. `zones` has
 * home first. Rated over exactly [start, end), whatever the grid shows.
 * @param {Selection} selection
 * @param {readonly GridZone[]} zones
 * @param {{ weekendsUnavailable: boolean }} options
 * @returns {SelectionDetails}
 */
export function describeSelection(selection, zones, { weekendsUnavailable }) {
  const { start, duration } = selection;
  const end = new Date(start.getTime() + duration * 60000);
  const slots = buildSlots({
    start,
    end,
    zones: zones.map((zone) => ({ zone, country: zone.country })),
    weekendsUnavailable,
  });
  return {
    start,
    end,
    rating: rateMeeting(slots, start, duration),
    zones: zones.map((zone, i) => ({
      zone,
      start: zoneLocalParts(zone, start),
      end: zoneLocalParts(zone, end),
      rating: combineRatings(slots.map((slot) => /** @type {RatingResult} */ (slot.zones[i]))),
    })),
  };
}

/** @param {SelectionDetails} details */
function home(details) {
  const first = details.zones[0];
  if (!first) throw new RangeError('selection details need the home zone');
  return first;
}

/**
 * The selection bar's text: "Wed 18 Nov, 09:00–10:00 Sydney" and "Best for all".
 * @param {SelectionDetails} details
 * @param {string} homeName
 * @param {HourCycle} cycle
 */
export function selectionSummary(details, homeName, cycle) {
  const { zone, start, end } = home(details);
  return {
    when: strings.selection.when(
      shortDate(zone, details.start),
      formatTime(start, cycle, 'full'),
      formatTime(end, cycle, 'full'),
      homeName,
    ),
    rating: strings.selection.bar[details.rating.rating],
  };
}

/**
 * A focused slot's description: "Wednesday 18 November, 9:00 am Sydney. Best
 * for everyone. London 10:00 pm Tuesday, Good." `names` are the rows' full
 * names, home first.
 * @param {SelectionDetails} details
 * @param {readonly string[]} names
 * @param {HourCycle} cycle
 */
export function slotLabel(details, names, cycle) {
  const first = home(details);
  const homeDay = longDate(first.zone, details.start);
  const parts = [
    strings.selection.slotHome(homeDay, formatTime(first.start, cycle, 'full'), names[0] ?? ''),
    `${strings.selection.overall[details.rating.rating]}.`,
  ];
  details.zones.slice(1).forEach(({ zone, start, rating }, i) => {
    const sameDay =
      start.year === first.start.year &&
      start.month === first.start.month &&
      start.day === first.start.day;
    parts.push(
      strings.selection.slotZone(
        names[i + 1] ?? '',
        formatTime(start, cycle, 'full'),
        strings.ratings[rating.rating],
        sameDay ? undefined : longWeekday(zone, details.start),
      ),
    );
  });
  return parts.join(' ');
}
