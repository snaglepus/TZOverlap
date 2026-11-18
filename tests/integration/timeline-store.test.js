// Integration: store + persistence (in-memory Storage double) + grid model
// (time engine + suitability), wired together the way main.js wires them.

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
import { buildGrid } from '../../src/lib/grid.js';

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

describe('store -> grid', () => {
  const now = new Date('2026-06-15T13:20:00Z'); // Monday: London BST, New York EDT

  it('builds the home row first, then every stored zone in order, aligned in home columns', () => {
    const store = createStore({ storage: new MemoryStorage() });
    store.add({ kind: 'iana', tz: 'America/New_York' });
    store.add({ kind: 'fixed', minutes: 330 });
    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    store.flush();
    const { zones, settings } = store.getState();
    const grid = buildGrid({
      homeZone: { kind: 'iana', tz: 'Europe/London' },
      zones,
      now,
      weekendsUnavailable: settings.weekendsUnavailable,
    });

    assert.equal(grid.start.toISOString(), '2026-06-13T23:00:00.000Z'); // 14 Jun 00:00 BST
    assert.equal(grid.hours, 72);
    assert.deepEqual(
      grid.rows.map(({ zone }) => (zone.kind === 'iana' ? zone.tz : zone.minutes)),
      ['Europe/London', 'America/New_York', 330, 'Asia/Tokyo'],
    );
    const [london, ny, fixed, tokyo] = grid.rows;
    assert.ok(london && ny && fixed && tokyo);
    // Whole-hour zones share column edges; UTC+5:30 sits half a column off.
    for (const row of [london, ny, tokyo]) {
      assert.ok(row.cells.every((cell) => Number.isInteger(cell.left)));
    }
    assert.ok(fixed.cells.every((cell) => (cell.left + 1) % 1 === 0.5));
    // Same column = same moment: London 14:00 is New York 09:00 and Tokyo 22:00.
    const at = (/** @type {typeof london} */ row) =>
      row.cells.find((cell) => cell.start.toISOString() === '2026-06-15T13:00:00.000Z');
    assert.deepEqual(
      [london, ny, tokyo].map((row) => at(row)?.hour),
      [14, 9, 22],
    );
    assert.equal(at(london)?.left, at(ny)?.left);
  });

  it('follows the stored weekend setting', () => {
    const store = createStore({ storage: new MemoryStorage() });
    store.add({ kind: 'iana', tz: 'America/New_York' });
    const sunday = new Date('2026-06-14T13:00:00Z'); // 14:00 London, 09:00 New York
    /** @param {boolean} weekendsUnavailable */
    const rating = (weekendsUnavailable) =>
      buildGrid({
        homeZone: { kind: 'iana', tz: 'Europe/London' },
        zones: store.getState().zones,
        now,
        weekendsUnavailable,
      }).everyone.find((seg) => seg.start <= sunday && sunday < seg.end)?.rating;
    assert.equal(store.getState().settings.weekendsUnavailable, true);
    assert.equal(rating(true), 'unsuitable');
    assert.equal(rating(false), 'best');
  });
});
