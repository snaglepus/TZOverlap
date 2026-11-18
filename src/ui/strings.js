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
    settings: 'Settings',
    now: 'Now',
    nowLabel: 'Go to now',
    toolbar: 'Toolbar',
    /** The title bar 12/24 toggle; pressed while 24-hour times show. */
    hourToggle: '24-hour',
  },
  sheet: {
    close: 'Close',
  },
  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    themes: {
      system: 'System default',
      light: 'Light',
      dark: 'Dark',
    },
    timeFormat: 'Time format',
    hourCycles: {
      auto: 'Automatic',
      h12: '12-hour',
      h23: '24-hour',
    },
    weekends: 'Treat weekends as unavailable',
    resetHelp: 'Remove your time zones and settings from this device.',
    reset: 'Reset all data',
    resetConfirm: 'This removes your time zones and settings from this device. It can’t be undone.',
    resetConfirmAction: 'Reset everything',
    cancel: 'Cancel',
  },
  toasts: {
    dataReset: 'Your saved data could not be read and was reset',
    resetDone: 'All data was reset.',
    /** @param {string} city */
    travelled: (city) => `You're now in ${city} time`,
  },
  update: {
    available: 'Update available',
    reload: 'Reload',
  },
  addCity: {
    button: 'Add city',
    title: 'Add city',
    promptTitle: 'Add the cities you work with',
    /** @param {number} count */
    promptBody: (count) => `Add up to ${count} to see which hours work for everyone.`,
    /** @param {number} count */
    limit: (count) => `Maximum of ${count} time zones. Remove one to add another.`,
    search: 'Search cities, countries or offsets',
    loading: 'Loading cities…',
    loadFailedTitle: 'Couldn’t load the city list',
    loadFailedBody: 'Reload the page to try again.',
    noResults: 'No matching cities or time zones.',
    addedMarker: 'Added',
    alreadyAdded: 'That time zone is already in your list.',
    /** @param {string} city */
    added: (city) => `Added ${city}.`,
    /** @param {string} city */
    removed: (city) => `Removed ${city}.`,
  },
  timelines: {
    cardTitle: 'Timelines',
    legend: 'Legend',
    gridLabel: 'Hours in each time zone, aligned on the same moment. Scroll sideways for more.',
    everyone: 'Everyone',
    location: 'Your location',
    /** Day difference from home: `long` inline and in details, `short` as the phone badge. */
    days: {
      tomorrow: { long: 'Tomorrow', short: '+1' },
      yesterday: { long: 'Yesterday', short: '−1' },
      ahead: {
        /** @param {number} n */
        long: (n) => `+${n} days`,
        /** @param {number} n */
        short: (n) => `+${n}`,
      },
      behind: {
        /** @param {number} n */
        long: (n) => `−${n} days`,
        /** @param {number} n */
        short: (n) => `−${n}`,
      },
    },
    details: 'Time zone details',
    noDst: 'No DST',
    removeLabel: '×',
    /** @param {string} city */
    remove: (city) => `Remove ${city}`,
    repeatMarker: '2',
    repeatTitle: 'Clocks go back — this hour repeats',
    /**
     * "00:00, Sat 13, Unsuitable, weekend" or "12:00 am, Sat 13, Unsuitable, weekend"
     * @param {string} time "9:00 am" or "09:00" @param {string} rating @param {boolean} [repeat]
     * @param {boolean} [weekend] @param {string} [day] "Sat 13", on a day's first hour
     */
    cell: (time, rating, repeat = false, weekend = false, day = '') =>
      `${time}${repeat ? ' (repeated)' : ''}${day ? `, ${day}` : ''}, ${rating}${weekend ? ', weekend' : ''}`,
    /** @param {string} from "2:30 pm" or "14:30" @param {string} to @param {string} rating */
    segment: (from, to, rating) => `${from} to ${to} your time, ${rating} for everyone`,
  },
  /** am/pm words for 12-hour times: full ("9:30 am") and compact ("9a"). */
  time: {
    am: 'am',
    pm: 'pm',
    amShort: 'a',
    pmShort: 'p',
  },
  /** Rating names: legend, cell and segment labels. */
  ratings: {
    best: 'Best',
    good: 'Good',
    unsuitable: 'Unsuitable',
  },
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
