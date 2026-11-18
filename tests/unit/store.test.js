import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_EXTRA_ZONES, createStore } from '../../src/lib/store.js';

const EXTRA = [
  'America/New_York',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Asia/Kolkata',
  'America/Los_Angeles',
  'Europe/Berlin',
  'America/Sao_Paulo',
  'Africa/Lagos',
];

describe('store.addZone', () => {
  it('adds canonicalised zones after the local zone', () => {
    const store = createStore({ localZone: 'Europe/London' });
    assert.deepEqual(store.addZone('  asia/tokyo '), { ok: true });
    assert.deepEqual(store.allZones(), ['Europe/London', 'Asia/Tokyo']);
  });

  it('reports empty, invalid and duplicate input without changing state', () => {
    const store = createStore({ localZone: 'Europe/London' });
    store.addZone('Asia/Tokyo');
    assert.deepEqual(store.addZone('   '), { ok: false, error: 'empty' });
    assert.deepEqual(store.addZone('Nowhere/Atlantis'), { ok: false, error: 'invalid' });
    assert.deepEqual(store.addZone('Asia/Tokyo'), { ok: false, error: 'duplicate' });
    assert.deepEqual(store.addZone('Europe/London'), { ok: false, error: 'duplicate' });
    assert.deepEqual(store.getState().zones, ['Asia/Tokyo']);
  });

  it(`caps extra zones at ${MAX_EXTRA_ZONES}`, () => {
    const store = createStore({ localZone: 'Europe/London' });
    for (const zone of EXTRA.slice(0, MAX_EXTRA_ZONES)) assert.equal(store.addZone(zone).ok, true);
    assert.deepEqual(store.addZone(/** @type {string} */ (EXTRA[MAX_EXTRA_ZONES])), {
      ok: false,
      error: 'limit',
    });
    assert.equal(store.allZones().length, MAX_EXTRA_ZONES + 1);
  });
});

describe('store.subscribe / removeZone', () => {
  it('notifies listeners and stops after unsubscribe', () => {
    const store = createStore({ localZone: 'UTC' });
    /** @type {string[][]} */
    const seen = [];
    const off = store.subscribe((s) => seen.push(s.zones));
    store.addZone('Asia/Tokyo');
    store.removeZone('Asia/Tokyo');
    off();
    store.addZone('Europe/Paris');
    assert.deepEqual(seen, [['Asia/Tokyo'], []]);
  });
});
