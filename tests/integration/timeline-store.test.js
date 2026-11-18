// Integration: store + persistence (in-memory Storage double) + timeline engine
// + timezone primitives, wired together the way main.js wires them.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STORAGE_KEY, createStore } from '../../src/lib/store.js';
import { buildTimeline } from '../../src/lib/timeline.js';

/** Storage double with the same contract as window.localStorage. */
class MemoryStorage {
  /** @type {Map<string, string>} */
  #data = new Map();
  /** @param {string} key */
  getItem(key) {
    return this.#data.has(key) ? /** @type {string} */ (this.#data.get(key)) : null;
  }
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    this.#data.set(key, String(value));
  }
}

describe('store persistence across sessions', () => {
  it('restores zones written by a previous session', () => {
    const storage = new MemoryStorage();
    const first = createStore({ localZone: 'Europe/London', storage });
    first.addZone('Asia/Tokyo');
    first.addZone('America/New_York');

    const second = createStore({ localZone: 'Europe/London', storage });
    assert.deepEqual(second.allZones(), ['Europe/London', 'Asia/Tokyo', 'America/New_York']);
  });

  it('ignores corrupt or hostile stored data', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{"not":"an array"}');
    assert.deepEqual(createStore({ localZone: 'UTC', storage }).allZones(), ['UTC']);

    storage.setItem(STORAGE_KEY, JSON.stringify(['Asia/Tokyo', 'Bogus/Zone', 7, 'UTC']));
    assert.deepEqual(createStore({ localZone: 'UTC', storage }).allZones(), ['UTC', 'Asia/Tokyo']);
  });

  it('keeps working when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = createStore({ localZone: 'UTC', storage });
    assert.deepEqual(store.addZone('Asia/Tokyo'), { ok: true });
    assert.deepEqual(store.allZones(), ['UTC', 'Asia/Tokyo']);
  });
});

describe('store -> timeline', () => {
  const start = new Date('2026-06-15T13:20:00Z'); // summer: London BST, NY EDT

  it('aligns every row on the same instants, starting at the hour', () => {
    const store = createStore({ localZone: 'Europe/London', storage: new MemoryStorage() });
    store.addZone('America/New_York');
    store.addZone('Asia/Kolkata');
    const timeline = buildTimeline({ zones: store.allZones(), start, hours: 24 });

    assert.equal(timeline.start.toISOString(), '2026-06-15T13:00:00.000Z');
    assert.equal(timeline.rows.length, 3);
    for (const row of timeline.rows) {
      assert.equal(row.slots.length, 24);
      row.slots.forEach((slot, i) => {
        assert.equal(slot.instant.getTime(), timeline.start.getTime() + i * 3_600_000);
      });
    }
    const [london, ny, kolkata] = timeline.rows.map((r) => r.slots[0]?.label);
    assert.deepEqual([london, ny, kolkata], ['14:00', '09:00', '18:30']);
  });

  it('computes the cross-zone overlap from the worst zone in each column', () => {
    const store = createStore({ localZone: 'Europe/London' });
    store.addZone('America/New_York');
    const timeline = buildTimeline({ zones: store.allZones(), start, hours: 24 });

    // 13:00Z = 14:00 London (ideal), 09:00 New York (ideal)
    assert.equal(timeline.overlap[0]?.band, 'ideal');
    // 17:00Z = 18:00 London (score 2), 13:00 NY (ideal) -> acceptable
    assert.equal(timeline.overlap[4]?.score, 2);
    // 22:00Z = 23:00 London -> unacceptable whatever NY says
    assert.equal(timeline.overlap[9]?.band, 'unacceptable');

    const ideal = timeline.overlap.filter((o) => o.band === 'ideal').length;
    assert.equal(ideal, 3); // 13:00-15:59Z: London 14-16, NY 09-11
  });

  it('marks slots that fall on a different calendar day than the reference zone', () => {
    const timeline = buildTimeline({
      zones: ['America/Los_Angeles', 'Asia/Tokyo'],
      start: new Date('2026-06-15T16:00:00Z'), // 09:00 LA = 01:00 next day Tokyo
      hours: 1,
    });
    assert.equal(timeline.rows[0]?.slots[0]?.dayShift, 0);
    assert.equal(timeline.rows[1]?.slots[0]?.dayShift, 1);
  });
});
