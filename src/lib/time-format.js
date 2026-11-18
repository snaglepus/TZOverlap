// Time formatting for the 12/24-hour setting: compact cell labels ("9a", "09")
// and full times ("9:30 am", "09:30"). Pure (no DOM); the am/pm words come from
// strings, not Intl, so the output is the same on every machine.

import { strings } from '../ui/strings.js';

/**
 * @typedef {'h12' | 'h23'} HourCycle
 * @typedef {'auto' | HourCycle} HourCycleSetting
 * @typedef {'compact' | 'full'} TimeStyle
 */

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * The locale's hour cycle. An hour field must be requested: without one,
 * V8 resolves no hourCycle at all.
 * @param {string} [locale]
 * @returns {string | undefined}
 */
export function localeHourCycle(locale) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
}

/**
 * The cycle to show. `auto` follows the locale; an unknown locale cycle gives 24-hour.
 * @param {HourCycleSetting} setting
 * @param {string | undefined} localeCycle
 * @returns {HourCycle}
 */
export function resolveHourCycle(setting, localeCycle) {
  if (setting === 'h12' || setting === 'h23') return setting;
  return localeCycle === 'h11' || localeCycle === 'h12' ? 'h12' : 'h23';
}

/**
 * "9a" / "09" (compact, hour only) or "9:30 am" / "09:30" (full).
 * @param {{ hour: number, minute: number }} time
 * @param {HourCycle} cycle
 * @param {TimeStyle} style
 */
export function formatTime({ hour, minute }, cycle, style) {
  if (cycle === 'h23') return style === 'compact' ? pad(hour) : `${pad(hour)}:${pad(minute)}`;
  const h12 = hour % 12 || 12;
  const pm = hour >= 12;
  if (style === 'compact') return `${h12}${pm ? strings.time.pmShort : strings.time.amShort}`;
  return `${h12}:${pad(minute)} ${pm ? strings.time.pm : strings.time.am}`;
}
