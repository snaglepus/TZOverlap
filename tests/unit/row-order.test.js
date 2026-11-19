import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canMove,
  deleteFocusTarget,
  dropIndex,
  dropTarget,
  moveTarget,
  pointerDropIndex,
  rowShift,
} from '../../src/lib/row-order.js';
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

  it('never moves the last row down, even past a hidden home copy after it', () => {
    // A, B, C, then a hidden copy of home: Everyone stays below C.
    const homeLast = [zone('a', 'Asia/Tokyo'), zone('b', 'Europe/London'), zone('c', 'UTC')];
    homeLast.push(zone('h', HOME));
    assert.equal(moveTarget(homeLast, HOME, 'c', 'down'), null);
    assert.equal(canMove(homeLast, HOME, 'c', 'down'), false);
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

// Rows of 40, 80, 40 and 60 px: midpoints 20, 80, 140 and 190.
const rects = [
  { top: 0, bottom: 40 },
  { top: 40, bottom: 120 },
  { top: 120, bottom: 160 },
  { top: 160, bottom: 220 },
];

describe('dropIndex', () => {
  it('is 0 above every row and the last index below every row', () => {
    assert.equal(dropIndex(rects, 2, -500), 0);
    assert.equal(dropIndex(rects, 0, -500), 0);
    assert.equal(dropIndex(rects, 1, 5000), 3);
    assert.equal(dropIndex(rects, 3, 5000), 3);
  });

  it('is the row itself at its own centre', () => {
    rects.forEach(({ top, bottom }, i) => assert.equal(dropIndex(rects, i, (top + bottom) / 2), i));
  });

  it('changes at a neighbour midpoint', () => {
    // Row 2 dragged up past row 1's midpoint (80), and row 0 down past it.
    assert.equal(dropIndex(rects, 2, 81), 2);
    assert.equal(dropIndex(rects, 2, 79), 1);
    assert.equal(dropIndex(rects, 0, 79), 0);
    assert.equal(dropIndex(rects, 0, 81), 1);
    // Row 1 dragged down past row 3's midpoint (190).
    assert.equal(dropIndex(rects, 1, 189), 2);
    assert.equal(dropIndex(rects, 1, 191), 3);
  });
});

describe('pointerDropIndex', () => {
  // The spec's fixture [0–40, 40–120, 120–140, 140–220] has a last midpoint of
  // 180, so the moved centre 186 already passes it (dropIndex gives 3, not 2).
  // With `rects` (last row 160–220, midpoint 190) the shape holds: row 1
  // (centre 80) picked up at y 119 and released at pointer y 225 moves its
  // centre by 106 to 186, short of 190, while the pointer is past the
  // Everyone top at 220.
  const drop = { rects, from: 1, homeBottom: 0, everyoneTop: 220 };

  it('lands last with the pointer over Everyone, whatever the pickup offset', () => {
    assert.equal(dropIndex(rects, 1, 186), 2);
    assert.equal(pointerDropIndex({ ...drop, centre: 186, pointerY: 225 }), 3);
    assert.equal(pointerDropIndex({ ...drop, centre: 186, pointerY: 220 }), 3);
  });

  it('lands first with the pointer over the home row', () => {
    const home = { ...drop, from: 3, homeBottom: 40, everyoneTop: 260 };
    assert.equal(dropIndex(rects, 3, 60), 1);
    assert.equal(pointerDropIndex({ ...home, centre: 60, pointerY: 39 }), 0);
  });

  it('is dropIndex between the home row and Everyone', () => {
    for (const centre of [-500, 21, 79, 81, 139, 141, 189, 191, 5000]) {
      for (let from = 0; from < rects.length; from += 1) {
        assert.equal(
          pointerDropIndex({ ...drop, from, centre, pointerY: 100 }),
          dropIndex(rects, from, centre),
          `from ${from} at ${centre}`,
        );
      }
    }
  });

  it('never puts a row past the last user row', () => {
    for (const pointerY of [219, 220, 5000]) {
      const index = pointerDropIndex({ ...drop, centre: 5000, pointerY });
      assert.equal(index, rects.length - 1);
    }
  });
});

describe('rowShift', () => {
  it('moves the rows passed going down up by one', () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => rowShift(0, 2, i)),
      [0, -1, -1, 0],
    );
  });

  it('moves the rows passed going up down by one', () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => rowShift(3, 1, i)),
      [0, 1, 1, 0],
    );
  });

  it('moves nothing in place', () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => rowShift(2, 2, i)),
      [0, 0, 0, 0],
    );
  });
});

describe('dropTarget', () => {
  /**
   * The shown labels after dropping `label` at `position` with the real store,
   * with the hidden home copy at `homeAt` in the stored list.
   * @param {number} homeAt
   * @param {string} label
   * @param {number} position
   */
  function droppedAfter(homeAt, label, position) {
    const list = [
      { id: 'a', tz: 'Asia/Tokyo' },
      { id: 'b', tz: 'Europe/London' },
      { id: 'c', tz: 'America/New_York' },
    ];
    list.splice(homeAt, 0, { id: 'h', tz: HOME });
    const store = createStore();
    for (const { tz, id } of list) store.add({ kind: 'iana', tz, label: id });
    const stored = store.getState().zones;
    const target = stored.find((z) => z.label === label);
    assert.ok(target);
    const drop = dropTarget(stored, HOME, target.id, position);
    assert.ok(drop);
    assert.equal(drop.position, position + 1);
    assert.equal(drop.count, 3);
    store.move(target.id, drop.toIndex);
    const after = store.getState().zones;
    assert.equal(after.length, 4);
    return after.filter((z) => !(z.kind === 'iana' && z.tz === HOME)).map((z) => z.label);
  }

  for (const homeAt of [0, 1, 2, 3]) {
    it(`keeps the other rows in order with the home copy at ${homeAt}`, () => {
      assert.deepEqual(droppedAfter(homeAt, 'c', 0), ['c', 'a', 'b']);
      assert.deepEqual(droppedAfter(homeAt, 'c', 1), ['a', 'c', 'b']);
      assert.deepEqual(droppedAfter(homeAt, 'a', 2), ['b', 'c', 'a']);
      assert.deepEqual(droppedAfter(homeAt, 'a', 1), ['b', 'a', 'c']);
      assert.deepEqual(droppedAfter(homeAt, 'b', 0), ['b', 'a', 'c']);
      assert.deepEqual(droppedAfter(homeAt, 'b', 2), ['a', 'c', 'b']);
    });
  }

  it('returns null in place, out of range, for an unknown id or the hidden home copy', () => {
    assert.equal(dropTarget(zones, HOME, 'b', 1), null);
    assert.equal(dropTarget(zones, HOME, 'a', 0), null);
    assert.equal(dropTarget(zones, HOME, 'a', 3), null);
    assert.equal(dropTarget(zones, HOME, 'a', 4), null);
    assert.equal(dropTarget(zones, HOME, 'a', -1), null);
    assert.equal(dropTarget(zones, HOME, 'nope', 0), null);
    assert.equal(dropTarget(zones, HOME, 'h', 0), null);
  });
});

describe('deleteFocusTarget', () => {
  it('picks the next shown row after a middle row', () => {
    const four = [...zones, zone('d', 'Europe/Paris')];
    assert.equal(deleteFocusTarget(four, HOME, 'b'), 'c');
  });

  it('picks the previous shown row after the last row', () => {
    assert.equal(deleteFocusTarget(zones, HOME, 'c'), 'b');
  });

  it('returns null for the only row', () => {
    assert.equal(deleteFocusTarget([zone('a', 'Asia/Tokyo')], HOME, 'a'), null);
  });

  it('skips a hidden copy of the home zone', () => {
    assert.equal(deleteFocusTarget(zones, HOME, 'a'), 'b');
    assert.equal(deleteFocusTarget(zones, HOME, 'b'), 'c');
    assert.equal(deleteFocusTarget([zone('a', 'Asia/Tokyo'), zone('h', HOME)], HOME, 'a'), null);
  });

  it('returns null for an unknown id or the hidden home copy', () => {
    assert.equal(deleteFocusTarget(zones, HOME, 'x'), null);
    assert.equal(deleteFocusTarget(zones, HOME, 'h'), null);
  });
});
