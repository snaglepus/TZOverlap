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
  /** The date control and the Today button in the toolbar. */
  date: {
    today: 'Today',
    other: 'Date',
    todayButton: 'Today',
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
  install: {
    heading: 'Install',
    title: 'Install TZ Overlap',
    hintBody: 'Add it to your device to open it like any other app.',
    installApp: 'Install app',
    notNow: 'Not now',
    ios: {
      heading: 'iPhone or iPad',
      // In order, as PRD 9.3.
      steps: {
        open: 'Open the app’s address in Safari.',
        share: 'Tap the Share button (square with an up arrow).',
        add: 'Scroll down and tap Add to Home Screen (you may need to tap “View More” first).',
        confirm: 'Check that “Open as Web App” is on if shown, then tap Add.',
        launch: 'Open it from the home screen. It runs full screen and works without a connection.',
      },
    },
    android: {
      heading: 'Android (Chrome)',
      steps: {
        open: 'Open the app’s address in Chrome.',
        install:
          'Tap Install app in the app’s Settings, or the browser’s ⋮ menu → Add to Home screen / Install app.',
        confirm: 'Confirm with Install.',
      },
    },
    desktop: {
      heading: 'Mac, Windows or Linux desktop',
      steps: {
        chromium:
          'Chrome or Edge: click the install icon in the address bar (or menu → Install TZ Overlap).',
        safari: 'Safari on Mac: File → Add to Dock.',
      },
    },
  },
  toasts: {
    dataReset: 'Your saved data could not be read and was reset',
    resetDone: 'All data was reset.',
    /** @param {string} city */
    travelled: (city) => `You're now in ${city} time`,
    undo: 'Undo',
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
    /** @param {string} city */
    restored: (city) => `Restored ${city}.`,
    /** @param {string} city */
    changeTitle: (city) => `Change ${city}`,
    /** @param {string} from @param {string} to */
    changed: (from, to) => `Changed ${from} to ${to}.`,
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
    /** Row actions in a user row's popover. */
    actions: {
      change: 'Change',
      moveUp: 'Move up',
      moveDown: 'Move down',
      delete: 'Delete',
    },
    /** @param {string} city @param {number} n @param {number} count */
    moved: (city, n, count) => `${city} moved to position ${n} of ${count}`,
    /** The drag handle's name; it opens the row's details. @param {string} name */
    reorder: (name) => `Reorder ${name}`,
    /** A user row's Delete button in Edit mode. @param {string} name */
    deleteZone: (name) => `Delete ${name}`,
    repeatMarker: '2',
    repeatTitle: 'Clocks go back — this hour repeats',
    /**
     * "00:00, Sat 13, Unsuitable, weekend" or "12:00 am, Sat 13, Unsuitable, weekend"
     * @param {string} time "9:00 am" or "09:00" @param {string} rating @param {boolean} [repeat]
     * @param {boolean} [weekend] @param {string} [day] "Sat 13", on a day's first hour
     */
    cell: (time, rating, repeat = false, weekend = false, day = '') =>
      `${time}${repeat ? ' (repeated)' : ''}${day ? `, ${day}` : ''}, ${rating}${weekend ? ', weekend' : ''}`,
    /**
     * @param {string} from "2:30 pm" or "14:30" @param {string} to @param {string} rating
     * @param {boolean} [greyed] covered by the filter's mask
     */
    segment: (from, to, rating, greyed = false) =>
      `${from} to ${to} your time, ${rating} for everyone${greyed ? ', greyed out by the filter' : ''}`,
  },
  /** The All / Good / Best filter and the no-overlap message. */
  /** Edit mode: the card header's Edit / Done button and its announcements. */
  edit: {
    edit: 'Edit',
    editLabel: 'Edit time zones',
    done: 'Done',
    doneLabel: 'Done editing time zones',
    on: 'Editing time zones. Each row has a Delete button and a reorder handle.',
    off: 'Finished editing time zones.',
  },
  filter: {
    label: 'Filter',
    options: {
      all: 'All',
      good: 'Good',
      best: 'Best',
    },
    /** @param {string} option */
    changed: (option) => `Filter: ${option}`,
    noOverlap: 'No time works for everyone today',
    nextDay: 'Show next day that works',
    /** @param {number} days */
    noneFound: (days) => `No time works for everyone in the next ${days} days either.`,
  },
  /** The selected slot: row headers, the selection bar and the focused-slot name. */
  selection: {
    /** @param {string} time "03:30" or "3:30 am" */
    header: (time) => `Selected ${time}`,
    /** Visually hidden before the phone header's selected time. */
    headerPrefix: 'Selected ',
    barLabel: 'Selected time',
    clearLabel: '×',
    clear: 'Clear selection',
    separator: ' · ',
    cleared: 'Selection cleared',
    /**
     * "Wed 18 Nov, 09:00–10:00 Sydney"
     * @param {string} date @param {string} from @param {string} to @param {string} home
     */
    when: (date, from, to, home) => `${date}, ${from}–${to} ${home}`,
    /** The bar's rating wording. */
    bar: {
      best: 'Best for all',
      good: 'Good for all',
      unsuitable: 'Unsuitable for some',
    },
    /** @param {{ when: string, rating: string }} summary */
    announce: (summary) => `Selected ${summary.when}, ${summary.rating}`,
    /** The overall rating in a focused slot's name. */
    overall: {
      best: 'Best for everyone',
      good: 'Good for everyone',
      unsuitable: 'Unsuitable for someone',
    },
    /**
     * "Wednesday 18 November, 9:00 am Sydney."
     * @param {string} date @param {string} time @param {string} home
     */
    slotHome: (date, time, home) => `${date}, ${time} ${home}.`,
    /**
     * "London 10:00 pm Tuesday, Good." (the weekday only when the date differs from home's)
     * @param {string} name @param {string} time @param {string} rating @param {string} [weekday]
     */
    slotZone: (name, time, rating, weekday = '') =>
      `${name} ${time}${weekday ? ` ${weekday}` : ''}, ${rating}.`,
    /**
     * The roving slot's name: its visible label first (WCAG 2.5.3), then the description.
     * @param {string} visible "9a" or "09" @param {string} description
     */
    slotName: (visible, description) => `${visible}, ${description}`,
  },
  /** DST badges on row headers, the clock-change banner and its sheet. */
  dst: {
    badge: 'DST',
    badgeLong: 'Daylight saving time',
    /** @param {string} date "Sun 29 Mar" */
    warning: (date) => `Clocks change ${date}`,
    forward: 'forward',
    back: 'back',
    /** @param {string} n "10.5" */
    hours: (n) => `${n} h`,
    /** @param {string} n "30" */
    minutes: (n) => `${n} min`,
    change: {
      /**
       * @param {string} name @param {string} label "BST" or "UTC+10:30"
       * @param {string} date "Sun 29 Mar" @param {string} direction @param {string} shift "1 h"
       */
      long: (name, label, date, direction, shift) =>
        `${name} moves to ${label} on ${date}: clocks go ${direction} ${shift}.`,
      /**
       * @param {string} name @param {string} direction @param {string} date "29 Mar"
       * @param {string} [shift] only when it isn't 1 h
       */
      short: (name, direction, date, shift = '') =>
        `${name}: clocks go ${direction} ${shift ? `${shift} ` : ''}${date}.`,
    },
    gap: {
      /** @param {string} to @param {string} before "11 h" @param {string} after */
      long: (to, before, after) => ` The gap to ${to} changes from ${before} to ${after}.`,
      /** @param {string} after "10 h" */
      short: (after) => ` Gap now ${after}.`,
    },
    gaps: {
      /** @param {number} n */
      long: (n) => ` Gaps to ${n} zones change.`,
      /** @param {number} n */
      short: (n) => ` ${n} gaps change.`,
    },
    /** @param {string} date "Sun 29 Mar", the changing zone's local day */
    compact: (date) => `1 clock change on ${date}.`,
    /** @param {number} n @param {string} date "Fri 10 Apr" */
    summary: (n, date) => `${n} clock changes before ${date}.`,
    /** @param {number} n @param {string} date */
    capped: (n, date) =>
      n === 1
        ? `1 clock change in the year before ${date}.`
        : `${n} clock changes in the year before ${date}.`,
    details: 'Details',
    sheetTitle: 'Clock changes',
    /** @param {string} date */
    cappedNote: (date) => `Only changes in the year before ${date} are listed.`,
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
