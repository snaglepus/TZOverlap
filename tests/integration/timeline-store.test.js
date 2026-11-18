// Integration: store + persistence (in-memory Storage double) + timeline engine
// + timezone primitives, wired together the way main.js wires them.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BACKUP_KEY,
  LEGACY_THEME_KEY,
  LEGACY_ZONES_KEY,
  STATE_KEY,
  createStore,
  defaultState,
} from '../../src/lib/store.js';
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
  /** @param {string} key */
  removeItem(key) {
    this.#data.delete(key);
  }
}

/** @param {ReturnType<typeof createStore>} store */
const tzs = (store) =>
  store.getState().zones.map((z) => (z.kind === 'iana' ? z.tz : String(z.minutes)));

describe('store persistence across sessions', () => {
  it('migrates the legacy zone and theme keys into the versioned state', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_ZONES_KEY, JSON.stringify(['Asia/Tokyo', 'America/New_York']));
    storage.setItem(LEGACY_THEME_KEY, 'dark');

    const store = createStore({ storage });
    const { zones, settings } = store.getState();
    assert.deepEqual(
      zones.map(({ kind, label, country }) => ({ kind, label, country })),
      [
        { kind: 'iana', label: 'Tokyo', country: undefined },
        { kind: 'iana', label: 'New York', country: undefined },
      ],
    );
    assert.deepEqual(tzs(store), ['Asia/Tokyo', 'America/New_York']);
    assert.ok(zones.every((z) => !('country' in z)));
    assert.equal(settings.theme, 'dark');
    assert.equal(store.wasReset(), false);
    assert.equal(JSON.parse(storage.getItem(STATE_KEY) ?? '').version, 1);
    assert.equal(storage.getItem(LEGACY_ZONES_KEY), null);
    assert.equal(storage.getItem(LEGACY_THEME_KEY), null);
  });

  it('restores zones written by a previous session', () => {
    const storage = new MemoryStorage();
    const first = createStore({ storage });
    first.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    first.add({ kind: 'iana', tz: 'America/New_York' });
    first.flush();

    const second = createStore({ storage });
    assert.deepEqual(second.getState(), first.getState());
    assert.deepEqual(tzs(second), ['Asia/Tokyo', 'America/New_York']);
  });

  it('drops bad legacy entries and resets a hostile versioned state', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_ZONES_KEY,
      JSON.stringify(['Asia/Tokyo', 'Bogus/Zone', 7, 'Asia/Tokyo']),
    );
    assert.deepEqual(tzs(createStore({ storage })), ['Asia/Tokyo']);

    const hostile = JSON.stringify({ ...defaultState(), zones: [{ kind: 'iana', tz: '<b>' }] });
    storage.setItem(STATE_KEY, hostile);
    const store = createStore({ storage });
    assert.equal(store.wasReset(), true);
    assert.deepEqual(store.getState(), defaultState());
    assert.equal(storage.getItem(BACKUP_KEY), hostile);
  });

  it('keeps working when storage throws', () => {
    const fail = () => {
      throw new Error('SecurityError');
    };
    const storage = { getItem: fail, setItem: fail, removeItem: fail };
    const store = createStore({ storage });
    assert.equal(store.add({ kind: 'iana', tz: 'Asia/Tokyo' }).ok, true);
    store.flush();
    assert.deepEqual(tzs(store), ['Asia/Tokyo']);
  });
});

describe('store -> timeline', () => {
  const start = new Date('2026-06-15T13:20:00Z'); // summer: London BST, NY EDT

  it('aligns every row on the same instants, starting at the hour', () => {
    const store = createStore({ storage: new MemoryStorage() });
    store.add({ kind: 'iana', tz: 'America/New_York' });
    store.add({ kind: 'iana', tz: 'Asia/Kolkata' });
    store.flush();
    const timeline = buildTimeline({ zones: ['Europe/London', ...tzs(store)], start, hours: 24 });

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
    const store = createStore();
    store.add({ kind: 'iana', tz: 'America/New_York' });
    store.flush();
    const timeline = buildTimeline({ zones: ['Europe/London', ...tzs(store)], start, hours: 24 });

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
