import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayDifference,
  dayDifferenceLabel,
  fullDate,
  headerOffsetLabel,
  offsetLine,
  rowName,
  shortDate,
  zoneAbbreviationLabel,
} from '../../src/lib/row-header.js';

/** @typedef {import('../../src/lib/zones.js').Zone} Zone */
/** @typedef {import('../../src/data/cities.js').City} City */

/** @param {string} tz @returns {Zone} */
const iana = (tz) => ({ kind: 'iana', tz });
/** @param {number} minutes @returns {Zone} */
const fixed = (minutes) => ({ kind: 'fixed', minutes });

const SYDNEY = iana('Australia/Sydney');
/** Sydney 21:30 Tue 17 Nov 2026 (AEDT). */
const NOV = new Date('2026-11-17T10:30:00Z');

/**
 * @param {Partial<City> & { name: string, tz: string }} city
 * @returns {City}
 */
function city(city) {
  return {
    ascii: city.name,
    aliases: [],
    cc: 'XX',
    country: 'Somewhere',
    rank: 1,
    region: 'Asia',
    popular: true,
    ...city,
  };
}

describe('dayDifference', () => {
  it('is +1 / -1 for zones a day either side of home', () => {
    assert.equal(dayDifference(iana('Pacific/Kiritimati'), SYDNEY, NOV), 1);
    assert.equal(dayDifference(iana('Pacific/Pago_Pago'), SYDNEY, NOV), -1);
    // 20:00 UTC: Sydney Tue 06:00, London Mon 21:00.
    const june = new Date('2026-06-15T20:00:00Z');
    assert.equal(dayDifference(iana('Europe/London'), SYDNEY, june), -1);
    assert.equal(dayDifference(SYDNEY, iana('Europe/London'), june), 1);
  });

  it('is ±2 between Pago Pago and Kiritimati', () => {
    // 10:30 UTC: Kiritimati Wed 00:30, Pago Pago Mon 23:30.
    const kiritimati = iana('Pacific/Kiritimati');
    const pago = iana('Pacific/Pago_Pago');
    assert.equal(dayDifference(kiritimati, pago, NOV), 2);
    assert.equal(dayDifference(pago, kiritimati, NOV), -2);
  });

  it('is 0 on the same date', () => {
    assert.equal(dayDifference(iana('Asia/Tokyo'), SYDNEY, NOV), 0);
    assert.equal(dayDifference(SYDNEY, SYDNEY, NOV), 0);
  });

  it('works for fixed zones', () => {
    assert.equal(dayDifference(fixed(0), SYDNEY, NOV), 0); // 10:30 Tue
    assert.equal(dayDifference(fixed(-11 * 60), SYDNEY, NOV), -1); // 23:30 Mon
    assert.equal(dayDifference(fixed(14 * 60), fixed(-11 * 60), NOV), 2);
  });
});

describe('dayDifferenceLabel', () => {
  it('words -2 to 2, with U+2212 for minus', () => {
    assert.equal(dayDifferenceLabel(0), null);
    assert.deepEqual(dayDifferenceLabel(1), { long: 'Tomorrow', short: '+1' });
    assert.deepEqual(dayDifferenceLabel(-1), { long: 'Yesterday', short: '−1' });
    assert.deepEqual(dayDifferenceLabel(2), { long: '+2 days', short: '+2' });
    assert.deepEqual(dayDifferenceLabel(-2), { long: '−2 days', short: '−2' });
  });
});

describe('dates', () => {
  it('gives the zone-local short and full date', () => {
    assert.equal(shortDate(SYDNEY, NOV), 'Tue 17 Nov');
    assert.equal(fullDate(SYDNEY, NOV), 'Tuesday 17 November 2026');
    assert.equal(shortDate(iana('Pacific/Pago_Pago'), NOV), 'Mon 16 Nov');
    assert.equal(fullDate(iana('Pacific/Kiritimati'), NOV), 'Wednesday 18 November 2026');
  });

  it('works for fixed zones', () => {
    assert.equal(shortDate(fixed(14 * 60), NOV), 'Wed 18 Nov');
    assert.equal(fullDate(fixed(-11 * 60), NOV), 'Monday 16 November 2026');
  });
});

describe('zoneAbbreviationLabel', () => {
  it('finds a real abbreviation across English locales', () => {
    assert.equal(zoneAbbreviationLabel(SYDNEY, NOV), 'AEDT');
    assert.equal(
      zoneAbbreviationLabel(iana('Europe/London'), new Date('2026-06-15T12:00Z')),
      'BST',
    );
    assert.equal(
      zoneAbbreviationLabel(iana('Europe/London'), new Date('2026-01-15T12:00Z')),
      'GMT',
    );
    assert.equal(
      zoneAbbreviationLabel(iana('America/New_York'), new Date('2026-01-15T12:00Z')),
      'EST',
    );
    assert.equal(zoneAbbreviationLabel(iana('Asia/Kolkata'), NOV), 'IST');
  });

  it('is null without a real abbreviation and for fixed zones', () => {
    assert.equal(zoneAbbreviationLabel(iana('Asia/Tokyo'), NOV), null);
    assert.equal(zoneAbbreviationLabel(iana('UTC'), NOV), null);
    assert.equal(zoneAbbreviationLabel(fixed(330), NOV), null);
  });
});

describe('headerOffsetLabel', () => {
  it('reads UTC+0 for zero and keeps half hours', () => {
    assert.equal(headerOffsetLabel(fixed(0), NOV), 'UTC+0');
    assert.equal(headerOffsetLabel(iana('Europe/London'), NOV), 'UTC+0');
    assert.equal(headerOffsetLabel(iana('Asia/Kolkata'), NOV), 'UTC+5:30');
    assert.equal(headerOffsetLabel(fixed(-210), NOV), 'UTC-3:30');
  });
});

describe('offsetLine', () => {
  it('joins the abbreviation and the offset with a middle dot', () => {
    assert.equal(offsetLine(SYDNEY, NOV), 'AEDT · UTC+11');
    assert.equal(offsetLine(iana('Europe/London'), NOV), 'GMT · UTC+0');
  });

  it('is the offset alone without an abbreviation', () => {
    assert.equal(offsetLine(iana('Asia/Tokyo'), NOV), 'UTC+9');
    assert.equal(offsetLine(fixed(330), NOV), 'UTC+5:30');
  });
});

describe('rowName', () => {
  const cities = [
    city({ name: 'São Paulo', ascii: 'Sao Paulo', tz: 'America/Sao_Paulo' }),
    city({ name: 'Rio de Janeiro', short: 'Rio', tz: 'America/Sao_Paulo' }),
    city({ name: 'Ho Chi Minh City', short: 'Ho Chi Minh', tz: 'Asia/Ho_Chi_Minh' }),
  ];

  it('derives the home name from the IANA ID', () => {
    assert.deepEqual(rowName({ zone: SYDNEY }), { full: 'Sydney', display: 'Sydney' });
    assert.deepEqual(rowName({ zone: iana('America/New_York'), cities }), {
      full: 'New York',
      display: 'New York',
    });
  });

  it('lets a stored label win', () => {
    assert.deepEqual(rowName({ zone: SYDNEY, label: 'Home base', cities }), {
      full: 'Home base',
      display: 'Home base',
    });
    assert.deepEqual(rowName({ zone: iana('America/Sao_Paulo'), label: 'Head office', cities }), {
      full: 'Head office',
      display: 'Head office',
    });
  });

  it('uses a city-data name with accents', () => {
    assert.deepEqual(rowName({ zone: iana('America/Sao_Paulo'), cities }), {
      full: 'São Paulo',
      display: 'São Paulo',
    });
  });

  it('displays a short name and keeps the full one', () => {
    assert.deepEqual(
      rowName({ zone: iana('America/Sao_Paulo'), label: 'Rio de Janeiro', cities }),
      {
        full: 'Rio de Janeiro',
        display: 'Rio',
      },
    );
    assert.deepEqual(rowName({ zone: iana('Asia/Ho_Chi_Minh'), cities }), {
      full: 'Ho Chi Minh City',
      display: 'Ho Chi Minh',
    });
  });

  it('works with no cities given', () => {
    assert.deepEqual(rowName({ zone: iana('America/Sao_Paulo') }), {
      full: 'Sao Paulo',
      display: 'Sao Paulo',
    });
    assert.deepEqual(rowName({ zone: fixed(330), label: 'UTC+5:30' }), {
      full: 'UTC+5:30',
      display: 'UTC+5:30',
    });
  });
});
