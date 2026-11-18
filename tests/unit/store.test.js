import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BACKUP_KEY,
  MAX_EXTRA_ZONES,
  STATE_KEY,
  createStore,
  defaultState,
  validateState,
} from '../../src/lib/store.js';

const EXTRA = [
  'America/New_York',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Asia/Kolkata',
  'America/Los_Angeles',
  'Europe/Berlin',
  'America/Sao_Paulo',
  'Africa/Lagos',
  'Europe/Paris',
];

/** Storage double that records every setItem call. */
class MemoryStorage {
  /** @type {Map<string, string>} */
  data = new Map();
  /** @type {[string, string][]} */
  writes = [];
  /** @param {string} key */
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    this.writes.push([key, value]);
    this.data.set(key, String(value));
  }
  /** @param {string} key */
  removeItem(key) {
    this.data.delete(key);
  }
}

/** Fake timer: callbacks run only on run(). */
function fakeTimer() {
  /** @type {Map<number, () => void>} */
  const pending = new Map();
  let next = 1;
  return {
    /** @param {() => void} fn */
    setTimeout(fn) {
      pending.set(next, fn);
      return next++;
    },
    /** @param {number} handle */
    clearTimeout(handle) {
      pending.delete(handle);
    },
    run() {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    },
    get size() {
      return pending.size;
    },
  };
}

/** @param {string} tz @param {string} id */
const iana = (tz, id) => ({ id, kind: /** @type {const} */ ('iana'), tz, label: tz });

/** @param {MemoryStorage} [storage] */
const storeWith = (storage = new MemoryStorage()) => {
  const timer = fakeTimer();
  return { storage, timer, store: createStore({ storage, timer }) };
};

describe('store load: reset on a bad state', () => {
  const nineZones = { ...defaultState(), zones: EXTRA.map((tz, i) => iana(tz, `z_${i}`)) };
  /** @type {[string, string][]} */
  const cases = [
    ['corrupt JSON', '{"version":1,'],
    ['unknown version', JSON.stringify({ ...defaultState(), version: 2 })],
    ['invalid IANA ID', JSON.stringify({ ...defaultState(), zones: [iana('Bogus/Zone', 'z_a')] })],
    [
      'fixed zone out of range',
      JSON.stringify({
        ...defaultState(),
        zones: [{ id: 'z_a', kind: 'fixed', minutes: 900, label: 'Far' }],
      }),
    ],
    ['9 zones', JSON.stringify(nineZones)],
  ];
  for (const [name, text] of cases) {
    it(`resets on ${name}, backing up the original text`, () => {
      const storage = new MemoryStorage();
      storage.setItem(STATE_KEY, text);
      const { store } = storeWith(storage);
      assert.equal(storage.getItem(BACKUP_KEY), text);
      assert.deepEqual(store.getState(), defaultState());
      assert.equal(store.wasReset(), true);
      assert.deepEqual(JSON.parse(storage.getItem(STATE_KEY) ?? ''), defaultState());
    });
  }

  it('loads a valid state unchanged, with no backup and no reset', () => {
    const valid = {
      version: 1,
      zones: [
        { id: 'z_a', kind: 'iana', tz: 'Asia/Tokyo', label: 'Tokyo office', country: 'JP' },
        { id: 'z_b', kind: 'fixed', minutes: 330, label: 'UTC+5:30' },
      ],
      settings: {
        hourCycle: 'h23',
        theme: 'dark',
        filter: 'best',
        weekendsUnavailable: false,
        defaultDuration: 45,
      },
      meta: { installHintDismissed: true, lastHomeTz: 'Europe/London' },
    };
    const storage = new MemoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify(valid));
    storage.writes = [];
    const { store } = storeWith(storage);
    assert.deepEqual(store.getState(), valid);
    assert.equal(storage.getItem(BACKUP_KEY), null);
    assert.equal(store.wasReset(), false);
    assert.deepEqual(storage.writes, []);
  });

  it('drops unknown properties without failing', () => {
    const cleaned = validateState({ ...defaultState(), extra: 1 });
    assert.deepEqual(cleaned, defaultState());
  });

  it('starts from defaults and writes nothing when storage is empty', () => {
    const { store, storage } = storeWith();
    assert.deepEqual(store.getState(), defaultState());
    assert.equal(store.wasReset(), false);
    assert.deepEqual(storage.writes, []);
  });
});

describe('store zone operations', () => {
  it('adds zones with an id and a default label', () => {
    const { store } = storeWith();
    const result = store.add({ kind: 'iana', tz: 'America/New_York' });
    assert.ok(result.ok);
    assert.match(result.zone.id, /^z_[0-9a-z]+$/);
    assert.equal(result.zone.label, 'New York');
    const fixed = store.add({ kind: 'fixed', minutes: 330 });
    assert.ok(fixed.ok);
    assert.equal(fixed.zone.label, 'UTC+5:30');
  });

  it('rejects duplicates, then an eighth zone, then invalid zones', () => {
    const { store } = storeWith();
    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    assert.deepEqual(store.add({ kind: 'iana', tz: 'Asia/Tokyo', label: 'Again' }), {
      ok: false,
      error: 'duplicate',
    });
    store.add({ kind: 'fixed', minutes: -420 });
    assert.deepEqual(store.add({ kind: 'fixed', minutes: -420 }), {
      ok: false,
      error: 'duplicate',
    });
    for (const tz of EXTRA.filter((tz) => tz !== 'Asia/Tokyo').slice(0, MAX_EXTRA_ZONES - 2)) {
      assert.equal(store.add({ kind: 'iana', tz }).ok, true);
    }
    assert.equal(store.getState().zones.length, MAX_EXTRA_ZONES);
    assert.deepEqual(store.add({ kind: 'iana', tz: 'Europe/Madrid' }), {
      ok: false,
      error: 'limit',
    });
    assert.deepEqual(store.add({ kind: 'iana', tz: 'Asia/Tokyo' }), {
      ok: false,
      error: 'duplicate',
    });
    assert.deepEqual(store.add({ kind: 'iana', tz: 'Bogus/Zone' }), {
      ok: false,
      error: 'invalid',
    });
    assert.deepEqual(store.add({ kind: 'fixed', minutes: 900 }), { ok: false, error: 'invalid' });
  });

  it('replace keeps the index and id', () => {
    const { store } = storeWith();
    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    const middle = store.add({ kind: 'iana', tz: 'Asia/Kolkata' });
    store.add({ kind: 'iana', tz: 'Europe/Berlin' });
    assert.ok(middle.ok);
    const result = store.replace(middle.zone.id, { kind: 'fixed', minutes: 60 });
    assert.ok(result.ok);
    const zones = store.getState().zones;
    assert.deepEqual(zones[1], { id: middle.zone.id, kind: 'fixed', minutes: 60, label: 'UTC+1' });
    assert.deepEqual(store.replace(middle.zone.id, { kind: 'iana', tz: 'Asia/Tokyo' }), {
      ok: false,
      error: 'duplicate',
    });
    assert.equal(store.replace(middle.zone.id, { kind: 'fixed', minutes: 60 }).ok, true);
    assert.deepEqual(store.replace('z_none', { kind: 'fixed', minutes: 0 }), {
      ok: false,
      error: 'missing',
    });
  });

  it('move reorders, and remove then restore round-trips', () => {
    const { store } = storeWith();
    const ids = ['Asia/Tokyo', 'Asia/Kolkata', 'Europe/Berlin'].map((tz) => {
      const r = store.add({ kind: 'iana', tz });
      assert.ok(r.ok);
      return r.zone.id;
    });
    const tzs = () => store.getState().zones.map((z) => (z.kind === 'iana' ? z.tz : z.minutes));
    assert.deepEqual(store.move(ids[0] ?? '', 2), { ok: true });
    assert.deepEqual(tzs(), ['Asia/Kolkata', 'Europe/Berlin', 'Asia/Tokyo']);

    const before = store.getState().zones;
    const removed = store.remove(ids[2] ?? '');
    assert.ok(removed.ok);
    assert.equal(removed.index, 1);
    assert.deepEqual(tzs(), ['Asia/Kolkata', 'Asia/Tokyo']);
    assert.deepEqual(store.restore(removed.zone, removed.index), { ok: true, zone: removed.zone });
    assert.deepEqual(store.getState().zones, before);
    assert.deepEqual(store.remove('z_none'), { ok: false, error: 'missing' });
  });

  it('a move to the same index notifies no one', () => {
    const { store } = storeWith();
    const r = store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    assert.ok(r.ok);
    let calls = 0;
    store.subscribe(() => calls++);
    assert.deepEqual(store.move(r.zone.id, 5), { ok: true });
    assert.equal(calls, 0);
  });

  it('updateSettings and updateMeta reject invalid patches', () => {
    const { store } = storeWith();
    let calls = 0;
    store.subscribe(() => calls++);
    for (const patch of [{ theme: 'blue' }, { defaultDuration: 20 }, { colour: 'red' }]) {
      assert.deepEqual(store.updateSettings(/** @type {any} */ (patch)), {
        ok: false,
        error: 'invalid',
      });
    }
    assert.deepEqual(store.updateMeta({ lastHomeTz: 'Bogus/Zone' }), {
      ok: false,
      error: 'invalid',
    });
    assert.equal(calls, 0);
    assert.deepEqual(store.getState(), defaultState());
    assert.deepEqual(store.updateSettings({ theme: 'dark', defaultDuration: 30 }), { ok: true });
    assert.equal(store.getState().settings.theme, 'dark');
    assert.equal(calls, 1);
    store.reset();
    assert.deepEqual(store.getState(), defaultState());
  });

  it('calls persist exactly once, after the first successful add', () => {
    let calls = 0;
    const persist = async () => {
      calls++;
    };
    const store = createStore({ storage: new MemoryStorage(), timer: fakeTimer(), persist });
    assert.equal(calls, 0);
    store.add({ kind: 'iana', tz: 'Bogus/Zone' });
    assert.equal(calls, 0);
    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    assert.equal(calls, 1);
    store.add({ kind: 'iana', tz: 'Asia/Kolkata' });
    assert.equal(calls, 1);
  });

  it('swallows a persist that throws or rejects', () => {
    for (const persist of [
      () => Promise.reject(new Error('denied')),
      () => {
        throw new Error('denied');
      },
    ]) {
      const store = createStore({ timer: fakeTimer(), persist });
      assert.equal(store.add({ kind: 'iana', tz: 'Asia/Tokyo' }).ok, true);
    }
  });
});

describe('store persistence', () => {
  it('debounces: three changes make one setItem', () => {
    const { store, storage, timer } = storeWith();
    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    store.add({ kind: 'iana', tz: 'Asia/Kolkata' });
    store.updateSettings({ theme: 'light' });
    assert.equal(storage.writes.length, 0);
    assert.equal(timer.size, 1);
    timer.run();
    assert.equal(storage.writes.length, 1);
    assert.equal(storage.writes[0]?.[0], STATE_KEY);
    assert.deepEqual(JSON.parse(storage.getItem(STATE_KEY) ?? ''), store.getState());
  });

  it('flush writes a pending change at once, and does nothing otherwise', () => {
    const { store, storage, timer } = storeWith();
    store.flush();
    assert.equal(storage.writes.length, 0);
    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    store.flush();
    assert.equal(storage.writes.length, 1);
    assert.equal(timer.size, 0);
    store.flush();
    assert.equal(storage.writes.length, 1);
  });

  it('keeps working when every storage call throws', () => {
    const fail = () => {
      throw new Error('QuotaExceededError');
    };
    const storage = { getItem: fail, setItem: fail, removeItem: fail };
    const store = createStore({ storage, timer: fakeTimer() });
    assert.equal(store.add({ kind: 'iana', tz: 'Asia/Tokyo' }).ok, true);
    store.flush();
    assert.equal(store.getState().zones.length, 1);
    store.handleStorageEvent({ key: STATE_KEY, newValue: null });
    assert.equal(store.getState().zones.length, 1);
  });

  it('keeps the original text until its backup is written', () => {
    const storage = new MemoryStorage();
    storage.setItem(STATE_KEY, 'not json');
    let backupFails = true;
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === BACKUP_KEY && backupFails) throw new Error('QuotaExceededError');
      setItem(key, value);
    };
    const { store } = storeWith(storage);
    assert.equal(store.wasReset(), true);
    assert.equal(storage.getItem(STATE_KEY), 'not json');

    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    store.flush();
    assert.equal(storage.getItem(STATE_KEY), 'not json');
    assert.equal(storage.getItem(BACKUP_KEY), null);

    backupFails = false;
    store.add({ kind: 'iana', tz: 'Asia/Kolkata' });
    store.flush();
    assert.equal(storage.getItem(BACKUP_KEY), 'not json');
    assert.deepEqual(JSON.parse(storage.getItem(STATE_KEY) ?? ''), store.getState());
  });
});

describe('store storage events', () => {
  it('applies a valid different state from storage without writing', () => {
    const { store, storage, timer } = storeWith();
    store.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    const other = { ...defaultState(), zones: [iana('Europe/Berlin', 'z_other')] };
    storage.setItem(STATE_KEY, JSON.stringify(other));
    storage.writes = [];
    /** @type {unknown[]} */
    const seen = [];
    store.subscribe((state) => seen.push(state));
    store.handleStorageEvent({ key: STATE_KEY, newValue: 'ignored' });
    assert.deepEqual(store.getState(), other);
    assert.deepEqual(seen, [other]);
    timer.run();
    assert.deepEqual(storage.writes, []);
  });

  it('ignores other keys, invalid values and equal states', () => {
    const { store, storage } = storeWith();
    let calls = 0;
    store.subscribe(() => calls++);
    storage.setItem(STATE_KEY, '{"version":9}');
    store.handleStorageEvent({ key: STATE_KEY, newValue: '{"version":9}' });
    storage.setItem(STATE_KEY, JSON.stringify(defaultState()));
    store.handleStorageEvent({ key: STATE_KEY, newValue: null });
    storage.setItem(STATE_KEY, JSON.stringify({ ...defaultState(), zones: [iana('UTC', 'z_u')] }));
    store.handleStorageEvent({ key: 'other', newValue: null });
    assert.equal(calls, 0);
    assert.deepEqual(store.getState(), defaultState());
    assert.equal(storage.getItem(BACKUP_KEY), null);
  });

  it('converges when both events arrive after both writes', () => {
    const storage = new MemoryStorage();
    const a = createStore({ storage, timer: fakeTimer() });
    const b = createStore({ storage, timer: fakeTimer() });
    a.add({ kind: 'iana', tz: 'Asia/Tokyo' });
    a.flush();
    const aValue = storage.getItem(STATE_KEY);
    b.add({ kind: 'iana', tz: 'Europe/Berlin' });
    b.flush();
    const bValue = storage.getItem(STATE_KEY);
    b.handleStorageEvent({ key: STATE_KEY, newValue: aValue });
    a.handleStorageEvent({ key: STATE_KEY, newValue: bValue });
    const stored = JSON.parse(storage.getItem(STATE_KEY) ?? '');
    assert.deepEqual(a.getState(), stored);
    assert.deepEqual(b.getState(), stored);
    assert.equal(storage.getItem(STATE_KEY), bValue);
  });
});
