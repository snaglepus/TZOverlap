// Scores a local wall-clock hour for meeting suitability.
//
// Score  Band           Local hours
//   4    ideal          09:00-16:59
//   3    acceptable     08:00-08:59, 17:00-17:59   (near shoulder)
//   2    acceptable     07:00-07:59, 18:00-18:59   (shoulder)
//   1    acceptable     19:00-20:59                 (far shoulder)
//   0    unacceptable   21:00-06:59
//
// Scores 1-3 drive the shoulder-hour heat map; the band drives the legend.

/** @typedef {'ideal' | 'acceptable' | 'unacceptable'} Band */
/** @typedef {0 | 1 | 2 | 3 | 4} Score */

/** @type {readonly Score[]} index = local hour 0-23 */
const SCORE_BY_HOUR = Object.freeze([
  0, 0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 1, 1, 0, 0, 0,
]);

/**
 * @param {number} hour local hour, 0-23
 * @returns {Score}
 */
export function scoreHour(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be an integer 0-23, got ${hour}`);
  }
  return /** @type {Score} */ (SCORE_BY_HOUR[hour]);
}

/**
 * @param {Score} score
 * @returns {Band}
 */
export function bandForScore(score) {
  if (score === 4) return 'ideal';
  if (score === 0) return 'unacceptable';
  return 'acceptable';
}

/**
 * Combined score for one moment across several zones: a slot is only as good
 * as its worst zone.
 * @param {readonly Score[]} scores
 * @returns {Score}
 */
export function combineScores(scores) {
  if (scores.length === 0) return 0;
  return /** @type {Score} */ (Math.min(...scores));
}
