// All user-visible text (en-AU). UI modules import from here; never write copy inline.
// No DOM access and no imports, so the unit test can load it on its own.

/**
 * @typedef {string | ((...args: any[]) => string)} Text
 * `short` is the phone variant; callers use `long` when `short` is absent.
 * @typedef {Text | { long: Text, short?: Text }} Entry
 * @typedef {{ [key: string]: Entry | Strings }} Strings
 */

export const strings = /** @satisfies {Strings} */ ({
  app: {
    title: 'TZ Overlap',
    tagline: 'Find the hours that work in every time zone.',
    footer: 'Runs entirely in your browser. Nothing you enter leaves this device.',
    skipLink: 'Skip to content',
    themeToggle: 'Dark theme',
  },
  addZone: {
    cardTitle: 'Add a time zone',
    label: 'Time zone',
    placeholder: 'e.g. Asia/Tokyo',
    submit: 'Add zone',
    /** @param {number} remaining */
    help: (remaining) => `Use an IANA name. You can add ${remaining} more.`,
    full: 'All eight slots are in use.',
    /** @param {string} city */
    added: (city) => `Added ${city}.`,
    /** @param {string} city */
    removed: (city) => `Removed ${city}.`,
  },
  errors: {
    empty: 'Enter a time zone, for example Asia/Tokyo.',
    /** @param {string} input */
    invalid: (input) =>
      `“${input}” isn’t a time zone this browser recognises. Use a name like America/New_York.`,
    duplicate: 'That time zone is already on the board.',
    /** @param {number} total */
    limit: (total) => `You can compare up to ${total} zones. Remove one to add another.`,
  },
  empty: {
    title: 'Only your time zone so far',
    /** @param {number} count */
    body: (count) => `Add up to ${count} more to see which hours work for everyone.`,
    action: 'Add a time zone',
  },
  timelines: {
    cardTitle: 'Timelines',
    legend: 'Legend',
    caption:
      'Today’s hours in each time zone, aligned on the same moment. Scroll sideways for more.',
    zoneHeader: 'Zone',
    /** @param {string} label */
    slotHeader: (label) => `Your ${label}`,
    /** @param {string} city */
    you: (city) => `${city} (you)`,
    removeLabel: '×',
    /** @param {string} city */
    remove: (city) => `Remove ${city}`,
    /** @param {string} label @param {string} band */
    slotDetail: (label, band) => ` ${label}, ${band}`,
    /** @param {number} shift */
    dayShift: (shift) => (shift > 0 ? `+${shift}d` : `${shift}d`),
    overlapTitle: 'All zones',
    overlapMeta: 'overlap',
    /** @param {string} band */
    overlapDetail: (band) => `, ${band} for everyone`,
  },
  /** Legend labels, by band. */
  bands: {
    ideal: 'Ideal',
    acceptable: 'Acceptable',
    unacceptable: 'Unacceptable',
  },
  /** Visible text in the "All zones" row, by band. */
  overlap: { ideal: 'best', acceptable: 'ok', unacceptable: 'no' },
  fatal: {
    retry: 'Try again',
    noTimeZones: {
      title: 'Time zones aren’t available',
      body: 'This browser can’t convert between time zones, so TZ Overlap can’t draw timelines. Try a current version of Firefox, Chrome, Safari or Edge.',
    },
    startFailed: {
      title: 'Something went wrong',
      body: 'TZ Overlap couldn’t start. Reload the page to try again.',
    },
  },
});

export default strings;
