// Move up / Move down and drag to reorder for user rows. Rows show the stored
// zones minus a stored copy of the home zone, so moves skip that hidden copy;
// store.move() takes indices into the full stored list. deleteFocusTarget()
// picks the row an Edit-mode delete moves focus to.

/**
 * @typedef {import('./store.js').StoredZone} StoredZone
 * @typedef {'up' | 'down'} Direction
 * @typedef {{ toIndex: number, position: number, count: number }} Move
 */

/**
 * Indices into `zones` of the zones shown as rows.
 * @param {readonly StoredZone[]} zones
 * @param {string} homeTz
 */
function shownIndices(zones, homeTz) {
  /** @type {number[]} */
  const shown = [];
  zones.forEach((z, i) => {
    if (!(z.kind === 'iana' && z.tz === homeTz)) shown.push(i);
  });
  return shown;
}

/**
 * Where zone `id` goes when moved one shown row `direction`: the `toIndex` for
 * store.move(), and its new 1-based position among the `count` shown rows.
 * Null at either end, or when `id` is not a shown row.
 * @param {readonly StoredZone[]} zones
 * @param {string} homeTz
 * @param {string} id
 * @param {Direction} direction
 * @returns {Move | null}
 */
export function moveTarget(zones, homeTz, id, direction) {
  const shown = shownIndices(zones, homeTz);
  const at = shown.findIndex((i) => zones[i]?.id === id);
  if (at < 0) return null;
  const next = direction === 'up' ? at - 1 : at + 1;
  const neighbour = shown[next];
  if (neighbour === undefined) return null;
  // store.move() inserts into the list without the moved zone, so the
  // neighbour's index there is its index here (up) or one less (down), and
  // the zone goes before it (up) or after it (down).
  return { toIndex: neighbour, position: next + 1, count: shown.length };
}

/**
 * Whether zone `id` can move one shown row `direction`.
 * @param {readonly StoredZone[]} zones
 * @param {string} homeTz
 * @param {string} id
 * @param {Direction} direction
 */
export function canMove(zones, homeTz, id, direction) {
  return moveTarget(zones, homeTz, id, direction) !== null;
}

/**
 * Where a dragged row lands: its new 0-based position among the user rows.
 * `rects` are the rows' boxes in display order, measured before the drag;
 * `from` is the dragged row and `y` its current vertical centre, in the same
 * coordinates. Counts the other rows whose midpoint is above `y`, so the
 * result stays within 0 and `rects.length - 1`.
 * @param {readonly { top: number, bottom: number }[]} rects
 * @param {number} from
 * @param {number} y
 */
export function dropIndex(rects, from, y) {
  let index = 0;
  rects.forEach(({ top, bottom }, i) => {
    if (i !== from && (top + bottom) / 2 < y) index++;
  });
  return index;
}

/**
 * How many dragged-row heights row `index` moves while the row dragged from
 * `from` hovers at `to`: up (-1) or down (+1) to make room, else 0.
 * @param {number} from
 * @param {number} to
 * @param {number} index
 */
export function rowShift(from, to, index) {
  if (from < index && index <= to) return -1;
  if (to <= index && index < from) return 1;
  return 0;
}

/**
 * Where zone `id` goes when dropped at 0-based `position` among the shown
 * rows: the `toIndex` for store.move(), and its 1-based position among the
 * `count` shown rows (as moveTarget). Null when `id` is not a shown row, or
 * for a drop in place or outside the rows.
 * @param {readonly StoredZone[]} zones
 * @param {string} homeTz
 * @param {string} id
 * @param {number} position
 * @returns {Move | null}
 */
export function dropTarget(zones, homeTz, id, position) {
  const shown = shownIndices(zones, homeTz);
  const at = shown.findIndex((i) => zones[i]?.id === id);
  if (at < 0 || position === at || position < 0 || position >= shown.length) return null;
  const from = /** @type {number} */ (shown[at]);
  // Indices in the list without the dragged zone, which store.move() inserts into.
  const rest = shown.filter((i) => i !== from).map((i) => (i > from ? i - 1 : i));
  // Right after the shown row before it, or before the first shown row.
  const toIndex =
    position === 0
      ? /** @type {number} */ (rest[0])
      : /** @type {number} */ (rest[position - 1]) + 1;
  return { toIndex, position: position + 1, count: shown.length };
}

/**
 * The row to focus after zone `id` is deleted: the id of the next shown row
 * after it, else the previous one, else null (also when `id` is not shown).
 * @param {readonly StoredZone[]} zones
 * @param {string} homeTz
 * @param {string} id
 * @returns {string | null}
 */
export function deleteFocusTarget(zones, homeTz, id) {
  const shown = shownIndices(zones, homeTz);
  const at = shown.findIndex((i) => zones[i]?.id === id);
  if (at < 0) return null;
  const target = shown[at + 1] ?? shown[at - 1];
  return target === undefined ? null : (zones[target]?.id ?? null);
}
