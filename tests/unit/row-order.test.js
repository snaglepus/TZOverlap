import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canMove, moveTarget } from '../../src/lib/row-order.js';
import { createStore } from '../../src/lib/store.js';

/** @typedef {import('../../src/lib/store.js').StoredZone} StoredZone */

const HOME = 'Australia/Sydney';

/** @param {string} id @param {string} tz @returns {StoredZone} */
const zone = (id, tz) => ({ id, kind: 'iana', tz, label: id });

// A, a hidden stored copy of home, B, C.
const entries = [
  { id: 'a', tz: 'Asia/Tokyo' },
  { id: 'h', tz: HOME },
  { id: 'b', tz: 'Europe/London' },
  { id: 'c', tz: 'America/New_York' },
];
const zones = entries.map(({ id, tz }) => zone(id, tz));

/**
 * The shown ids after applying a move with the real store.
 * @param {string} id
 * @param {import('../../src/lib/row-order.js').Direction} direction
 */
function shownAfter(id, direction) {
  const store = createStore();
  for (const { tz, id: label } of entries) store.add({ kind: 'iana', tz, label });
  const stored = store.getState().zones;
  const target = stored.find((z) => z.label === id);
  assert.ok(target);
  const move = moveTarget(stored, HOME, target.id, direction);
  assert.ok(move);
  store.move(target.id, move.toIndex);
  return store
    .getState()
    .zones.filter((z) => !(z.kind === 'iana' && z.tz === HOME))
    .map((z) => z.label);
}

describe('moveTarget', () => {
  it('skips a hidden copy of the home zone moving down', () => {
    assert.deepEqual(moveTarget(zones, HOME, 'a', 'down'), { toIndex: 2, position: 2, count: 3 });
    assert.deepEqual(shownAfter('a', 'down'), ['b', 'a', 'c']);
  });

  it('skips a hidden copy of the home zone moving up', () => {
    assert.deepEqual(moveTarget(zones, HOME, 'b', 'up'), { toIndex: 0, position: 1, count: 3 });
    assert.deepEqual(shownAfter('b', 'up'), ['b', 'a', 'c']);
  });

  it('moves between neighbouring rows', () => {
    assert.deepEqual(moveTarget(zones, HOME, 'b', 'down'), { toIndex: 3, position: 3, count: 3 });
    assert.deepEqual(shownAfter('b', 'down'), ['a', 'c', 'b']);
    assert.deepEqual(shownAfter('c', 'up'), ['a', 'c', 'b']);
  });

  it('returns null at both ends', () => {
    assert.equal(moveTarget(zones, HOME, 'a', 'up'), null);
    assert.equal(moveTarget(zones, HOME, 'c', 'down'), null);
  });

  it('returns null for an unknown id or the hidden home copy', () => {
    assert.equal(moveTarget(zones, HOME, 'nope', 'down'), null);
    assert.equal(moveTarget(zones, HOME, 'h', 'down'), null);
  });
});

describe('canMove', () => {
  it('is false only at the ends and for unknown ids', () => {
    assert.equal(canMove(zones, HOME, 'a', 'up'), false);
    assert.equal(canMove(zones, HOME, 'a', 'down'), true);
    assert.equal(canMove(zones, HOME, 'b', 'up'), true);
    assert.equal(canMove(zones, HOME, 'c', 'up'), true);
    assert.equal(canMove(zones, HOME, 'c', 'down'), false);
    assert.equal(canMove(zones, HOME, 'nope', 'up'), false);
  });
});
