// Move up / Move down for user rows. Rows show the stored zones minus a stored
// copy of the home zone, so moves skip that hidden copy; store.move() takes
// indices into the full stored list.

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
