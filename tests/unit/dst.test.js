import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bannerMessage,
  changeSentence,
  changesBetween,
  describeChange,
  dstStatus,
  formatGap,
  formatShift,
} from '../../src/lib/dst.js';
import { zoneTransitions } from '../../src/lib/time-engine.js';

/** @typedef {import('../../src/lib/zones.js').Zone} Zone */
/** @typedef {import('../../src/lib/dst.js').NamedZone} NamedZone */

/** @param {string} tz @param {string} name @param {string} [display] @returns {NamedZone} */
const named = (tz, name, display = name) => ({ zone: { kind: 'iana', tz }, name, display });

const sydney = named('Australia/Sydney', 'Sydney');
const london = named('Europe/London', 'London');
const lordHowe = named('Australia/Lord_Howe', 'Lord Howe');
/** @type {NamedZone} */
const kolkata = { zone: { kind: 'fixed', minutes: 330 }, name: 'UTC+5:30', display: 'UTC+5:30' };

/**
 * The first transition of `zone` in the hour before `at`.
 * @param {NamedZone} zone
 * @param {string} at
 */
function transitionAt(zone, at) {
  const end = new Date(at);
  const t = zoneTransitions(zone.zone, new Date(end.getTime() - 3600000), end)[0];
  assert.ok(t, `no transition for ${zone.name} at ${at}`);
  assert.equal(t.at.toISOString(), end.toISOString());
  return t;
}

describe('formatGap', () => {
  it('gives absolute hours with at most two decimals', () => {
    assert.equal(formatGap(600), '10 h');
    assert.equal(formatGap(630), '10.5 h');
    assert.equal(formatGap(-540), '9 h');
    assert.equal(formatGap(345), '5.75 h');
    assert.equal(formatGap(0), '0 h');
  });
});

describe('formatShift', () => {
  it('gives hours, minutes or both', () => {
    assert.equal(formatShift(60), '1 h');
    assert.equal(formatShift(-60), '1 h');
    assert.equal(formatShift(30), '30 min');
    assert.equal(formatShift(-30), '30 min');
    assert.equal(formatShift(90), '1 h 30 min');
  });
});

describe('dstStatus', () => {
  const at = new Date('2026-03-20T01:00:00Z');

  it('finds London’s coming change while it is on standard time', () => {
    const status = dstStatus(london.zone, at);
    assert.equal(status.observing, false);
    assert.equal(status.change?.at.toISOString(), '2026-03-29T01:00:00.000Z');
  });

  it('reports Sydney observing with no change within 14 days', () => {
    assert.deepEqual(dstStatus(sydney.zone, at), { observing: true, change: null });
  });

  it('gives fixed zones neither', () => {
    assert.deepEqual(dstStatus(kolkata.zone, at), { observing: false, change: null });
  });
});

describe('changeSentence', () => {
  it('explains a forward change in a non-home zone with the gap to home', () => {
    const change = describeChange({
      zone: london,
      transition: transitionAt(london, '2026-03-29T01:00:00Z'),
      home: sydney,
      others: [],
    });
    assert.deepEqual(change.gap, { to: 'Sydney', before: 660, after: 600 });
    assert.deepEqual(changeSentence(change), {
      long: 'London moves to BST on Sun 29 Mar: clocks go forward 1 h. The gap to Sydney changes from 11 h to 10 h.',
      short: 'London: clocks go forward 29 Mar. Gap now 10 h.',
    });
  });

  it('explains a home change with its one changed gap', () => {
    const change = describeChange({
      zone: sydney,
      transition: transitionAt(sydney, '2026-04-04T16:00:00Z'),
      home: sydney,
      others: [london],
    });
    assert.deepEqual(changeSentence(change), {
      long: 'Sydney moves to AEST on Sun 5 Apr: clocks go back 1 h. The gap to London changes from 10 h to 9 h.',
      short: 'Sydney: clocks go back 5 Apr. Gap now 9 h.',
    });
  });

  it('gives the size of a 30-minute change', () => {
    const change = describeChange({
      zone: lordHowe,
      transition: transitionAt(lordHowe, '2026-04-04T15:00:00Z'),
      home: sydney,
      others: [],
    });
    const { long, short } = changeSentence(change);
    assert.match(long, /clocks go back 30 min/);
    assert.match(long, /from 0 h to 0\.5 h/);
    assert.equal(short, 'Lord Howe: clocks go back 30 min 5 Apr. Gap now 0.5 h.');
  });

  it('counts the gaps when home changes and two or more move', () => {
    const tokyo = named('Asia/Tokyo', 'Tokyo');
    const change = describeChange({
      zone: sydney,
      transition: transitionAt(sydney, '2026-04-04T16:00:00Z'),
      home: sydney,
      others: [london, tokyo],
    });
    assert.equal(change.gap, null);
    assert.equal(change.gaps, 2);
    assert.match(changeSentence(change).long, / Gaps to 2 zones change\.$/);
    assert.match(changeSentence(change).short, / 2 gaps change\.$/);
  });
});

describe('changesBetween', () => {
  const from = new Date('2026-03-01T01:00:00Z');

  it('lists London then Sydney before 10 April', () => {
    const { changes, capped } = changesBetween({
      home: sydney,
      others: [london],
      from,
      to: new Date('2026-04-10T02:00:00Z'),
    });
    assert.equal(capped, false);
    assert.deepEqual(
      changes.map((c) => [c.zone.name, c.gap?.before, c.gap?.after]),
      [
        ['London', 660, 600],
        ['Sydney', 600, 540],
      ],
    );
  });

  it('finds nothing before 20 March', () => {
    const list = changesBetween({
      home: sydney,
      others: [london],
      from,
      to: new Date('2026-03-20T01:00:00Z'),
    });
    assert.deepEqual(list, { changes: [], capped: false });
  });

  it('ignores fixed zones', () => {
    const { changes } = changesBetween({
      home: sydney,
      others: [kolkata],
      from,
      to: new Date('2026-04-10T02:00:00Z'),
    });
    assert.deepEqual(
      changes.map((c) => c.zone.name),
      ['Sydney'],
    );
  });

  it('returns nothing when the target is not later', () => {
    assert.deepEqual(changesBetween({ home: sydney, others: [london], from, to: from }), {
      changes: [],
      capped: false,
    });
  });

  it('caps the scan at the year before the target and says so', () => {
    const list = changesBetween({
      home: sydney,
      others: [london],
      from,
      to: new Date('2027-04-10T02:00:00Z'),
    });
    assert.equal(list.capped, true);
    assert.ok(list.changes.length > 0);
    assert.ok(
      list.changes.every((c) => c.transition.at.toISOString() !== '2026-03-29T01:00:00.000Z'),
    );
    const message = bannerMessage(list, 'Sat 10 Apr');
    assert.match(message.long, /in the year before Sat 10 Apr/);
    assert.match(message.short, /in the year before Sat 10 Apr/);
  });
});

describe('bannerMessage', () => {
  const from = new Date('2026-03-01T01:00:00Z');

  it('summarises several changes', () => {
    const list = changesBetween({
      home: sydney,
      others: [london],
      from,
      to: new Date('2026-04-10T02:00:00Z'),
    });
    assert.deepEqual(bannerMessage(list, 'Fri 10 Apr'), {
      long: '2 clock changes before Fri 10 Apr.',
      short: '2 clock changes before Fri 10 Apr.',
    });
  });

  it('gives one change its sentences and a compact form dated on the change', () => {
    const office = named(
      'Europe/London',
      'London office, Shoreditch engineering team',
      'London office, Shoreditch engineering team',
    );
    const list = changesBetween({
      home: sydney,
      others: [office],
      from,
      to: new Date('2026-04-01T01:00:00Z'),
    });
    const message = bannerMessage(list, 'Wed 1 Apr');
    assert.equal(message.compact, '1 clock change on Sun 29 Mar.');
    assert.equal(
      message.short,
      'London office, Shoreditch engineering team: clocks go forward 29 Mar. Gap now 10 h.',
    );
    assert.ok(message.long.startsWith('London office, Shoreditch engineering team moves to BST'));
  });

  it('uses the display name in the short form and the full name in the long form', () => {
    const nyc = named('America/New_York', 'New York City', 'NYC');
    const list = changesBetween({
      home: sydney,
      others: [nyc],
      from,
      to: new Date('2026-03-20T01:00:00Z'),
    });
    const message = bannerMessage(list, 'Fri 20 Mar');
    assert.ok(message.short.startsWith('NYC: clocks go forward 8 Mar.'));
    assert.ok(message.long.startsWith('New York City moves to EDT on Sun 8 Mar'));
  });
});
