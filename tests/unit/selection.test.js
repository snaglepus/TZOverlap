import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSelection, createSelectionState, snapToSlot } from '../../src/lib/selection.js';

/** @param {string} iso */
const at = (iso) => new Date(iso);

describe('snapToSlot', () => {
  it('rounds to the nearest 15-minute boundary', () => {
    assert.equal(snapToSlot(at('2026-11-17T23:00:00Z')).toISOString(), '2026-11-17T23:00:00.000Z');
    assert.equal(snapToSlot(at('2026-11-17T23:07:29Z')).toISOString(), '2026-11-17T23:00:00.000Z');
    assert.equal(snapToSlot(at('2026-11-17T23:24:00Z')).toISOString(), '2026-11-17T23:30:00.000Z');
    assert.equal(snapToSlot(at('2026-11-17T23:53:00Z')).toISOString(), '2026-11-18T00:00:00.000Z');
  });

  it('rounds a tie at exactly 7.5 minutes up', () => {
    assert.equal(snapToSlot(at('2026-11-17T23:07:30Z')).toISOString(), '2026-11-17T23:15:00.000Z');
    assert.equal(snapToSlot(at('2026-11-17T23:22:30Z')).toISOString(), '2026-11-17T23:30:00.000Z');
  });
});

describe('createSelection', () => {
  it('returns a frozen start and duration', () => {
    const selection = createSelection(at('2026-11-17T22:00:00Z'), 60);
    assert.equal(selection.start.toISOString(), '2026-11-17T22:00:00.000Z');
    assert.equal(selection.duration, 60);
    assert.ok(Object.isFrozen(selection));
  });

  it('accepts any positive multiple of 15', () => {
    assert.equal(createSelection(at('2026-11-17T22:45:00Z'), 15).duration, 15);
    assert.equal(createSelection(at('2026-11-17T22:45:00Z'), 1440).duration, 1440);
  });

  it('rejects a start off a 15-minute boundary', () => {
    assert.throws(() => createSelection(at('2026-11-17T22:05:00Z'), 60), RangeError);
    assert.throws(() => createSelection(at('2026-11-17T22:00:01Z'), 60), RangeError);
    assert.throws(() => createSelection(new Date(Number.NaN), 60), RangeError);
  });

  it('rejects durations that are not positive multiples of 15', () => {
    const start = at('2026-11-17T22:00:00Z');
    for (const duration of [0, -15, 10, 22.5, Number.NaN]) {
      assert.throws(() => createSelection(start, duration), RangeError, String(duration));
    }
  });
});

describe('createSelectionState', () => {
  it('starts empty', () => {
    assert.equal(createSelectionState().get(), null);
  });

  it('select snaps the instant and replaces the current selection', () => {
    const state = createSelectionState();
    const first = state.select(at('2026-11-17T23:24:00Z'), 60);
    assert.equal(first.start.toISOString(), '2026-11-17T23:30:00.000Z');
    assert.equal(state.get(), first);
    const second = state.select(at('2026-11-18T01:00:00Z'), 120);
    assert.equal(state.get(), second);
    assert.equal(second.duration, 120);
  });

  it('select throws on a bad duration and keeps the current selection', () => {
    const state = createSelectionState();
    const first = state.select(at('2026-11-17T23:00:00Z'), 60);
    assert.throws(() => state.select(at('2026-11-17T23:00:00Z'), 7), RangeError);
    assert.equal(state.get(), first);
  });

  it('clear empties it', () => {
    const state = createSelectionState();
    state.select(at('2026-11-17T23:00:00Z'), 60);
    state.clear();
    assert.equal(state.get(), null);
  });

  it('notifies subscribers after every change, but not for clearing nothing', () => {
    const state = createSelectionState();
    /** @type {(string | null)[]} */
    const seen = [];
    const unsubscribe = state.subscribe(() => seen.push(state.get()?.start.toISOString() ?? null));
    state.clear();
    assert.deepEqual(seen, []);
    state.select(at('2026-11-17T23:00:00Z'), 60);
    state.select(at('2026-11-17T23:00:00Z'), 60);
    state.clear();
    state.clear();
    assert.deepEqual(seen, ['2026-11-17T23:00:00.000Z', '2026-11-17T23:00:00.000Z', null]);
    unsubscribe();
    state.select(at('2026-11-17T23:00:00Z'), 60);
    assert.equal(seen.length, 3);
  });
});
