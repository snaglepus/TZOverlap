import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHomeTracker } from '../../src/lib/home.js';
import { createStore } from '../../src/lib/store.js';

/**
 * A store with no Storage, a device zone the test can switch, and a count of
 * lastHomeTz writes.
 * @param {string | null} [lastHomeTz]
 */
function setup(lastHomeTz = null) {
  const store = createStore();
  if (lastHomeTz) store.updateMeta({ lastHomeTz });
  let device = 'Australia/Sydney';
  let writes = 0;
  const updateMeta = store.updateMeta;
  const counted = {
    getState: store.getState,
    /** @param {Parameters<typeof updateMeta>[0]} patch */
    updateMeta(patch) {
      writes += 1;
      return updateMeta(patch);
    },
  };
  const tracker = createHomeTracker({ store: counted, deviceZone: () => device });
  return {
    store,
    tracker,
    /** @param {string} zone */
    move(zone) {
      device = zone;
    },
    writes: () => writes,
  };
}

describe('createHomeTracker', () => {
  it('saves the device zone without a toast when lastHomeTz is null', () => {
    const t = setup();
    assert.equal(t.tracker.current(), 'UTC');
    assert.deepEqual(t.tracker.check(), {
      home: 'Australia/Sydney',
      changed: true,
      travelled: false,
    });
    assert.equal(t.writes(), 1);
    assert.equal(t.store.getState().meta.lastHomeTz, 'Australia/Sydney');
  });

  it('does not write or toast when the zone is unchanged', () => {
    const t = setup('Australia/Sydney');
    assert.equal(t.tracker.current(), 'Australia/Sydney');
    assert.deepEqual(t.tracker.check(), {
      home: 'Australia/Sydney',
      changed: false,
      travelled: false,
    });
    assert.equal(t.writes(), 0);
  });

  it('writes once and toasts once after travel', () => {
    const t = setup('Australia/Sydney');
    t.tracker.check();
    t.move('America/Los_Angeles');
    assert.deepEqual(t.tracker.check(), {
      home: 'America/Los_Angeles',
      changed: true,
      travelled: true,
    });
    assert.deepEqual(t.tracker.check(), {
      home: 'America/Los_Angeles',
      changed: false,
      travelled: false,
    });
    assert.equal(t.writes(), 1);
    assert.equal(t.store.getState().meta.lastHomeTz, 'America/Los_Angeles');
  });

  it('follows a zone another tab already saved, without a toast', () => {
    const t = setup('Australia/Sydney');
    t.tracker.check();
    t.store.updateMeta({ lastHomeTz: 'America/Los_Angeles' });
    t.move('America/Los_Angeles');
    assert.deepEqual(t.tracker.check(), {
      home: 'America/Los_Angeles',
      changed: true,
      travelled: false,
    });
    assert.equal(t.writes(), 0);
  });

  it('toasts again on the way back to an earlier zone', () => {
    const t = setup('Australia/Sydney');
    t.move('America/Los_Angeles');
    assert.equal(t.tracker.check().travelled, true);
    t.move('Australia/Sydney');
    assert.deepEqual(t.tracker.check(), {
      home: 'Australia/Sydney',
      changed: true,
      travelled: true,
    });
    assert.equal(t.writes(), 2);
  });

  it('ignores an invalid device zone and recovers', () => {
    const t = setup();
    t.tracker.check();
    assert.equal(t.writes(), 1);
    t.move('Bogus/Zone');
    assert.deepEqual(t.tracker.check(), {
      home: 'Australia/Sydney',
      changed: false,
      travelled: false,
    });
    assert.equal(t.tracker.current(), 'Australia/Sydney');
    assert.equal(t.store.getState().meta.lastHomeTz, 'Australia/Sydney');
    t.move('Australia/Sydney');
    assert.deepEqual(t.tracker.check(), {
      home: 'Australia/Sydney',
      changed: false,
      travelled: false,
    });
    assert.equal(t.writes(), 1);
    t.move('America/Los_Angeles');
    assert.deepEqual(t.tracker.check(), {
      home: 'America/Los_Angeles',
      changed: true,
      travelled: true,
    });
    assert.equal(t.writes(), 2);
  });

  it('shows UTC when the first read is invalid and nothing is stored', () => {
    const t = setup();
    t.move('Bogus/Zone');
    assert.deepEqual(t.tracker.check(), { home: 'UTC', changed: false, travelled: false });
    assert.equal(t.tracker.current(), 'UTC');
    assert.equal(t.writes(), 0);
    assert.equal(t.store.getState().meta.lastHomeTz, null);
  });

  it('ignores a lookup that throws or returns a non-string', () => {
    const store = createStore();
    store.updateMeta({ lastHomeTz: 'Asia/Tokyo' });
    /** @type {() => string} */
    let lookup = () => {
      throw new Error('no Intl');
    };
    const tracker = createHomeTracker({ store, deviceZone: () => lookup() });
    assert.deepEqual(tracker.check(), { home: 'Asia/Tokyo', changed: false, travelled: false });
    lookup = () => /** @type {string} */ (/** @type {unknown} */ (42));
    assert.deepEqual(tracker.check(), { home: 'Asia/Tokyo', changed: false, travelled: false });
  });
});
