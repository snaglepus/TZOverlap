// E2E: the main page — app shell, add-zone card (input + button), timelines
// card (empty state + timeline grid), theme switching and the error state.

import { expect, test } from '@playwright/test';
import { NOW, addZone, chooseAppearance, expectNoA11yViolations, openSettings } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/** @param {import('@playwright/test').Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {import('@playwright/test').Page} page */
const rowZones = (page) =>
  page
    .locator('[role="row"]')
    .evaluateAll((rows) => rows.map((el) => el.getAttribute('data-zone')));

test('first visit: shows your zone, an empty state, and loads nothing third-party', async ({
  page,
  baseURL,
}) => {
  /** @type {string[]} */
  const foreign = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(/** @type {string} */ (baseURL)) && !url.startsWith('data:')) {
      foreign.push(url);
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'TZ Overlap' })).toBeVisible();
  await expect(page.getByRole('row', { name: /London \(you\)/ })).toBeVisible();
  // Home and Everyone rows only; the header shows the live time and offset.
  expect(await rowZones(page)).toEqual(['Europe/London', 'everyone']);
  await expect(row(page, 'Europe/London').getByRole('rowheader')).toContainText('14:30');
  await expect(row(page, 'Europe/London').getByRole('rowheader')).toContainText('UTC+1');
  await expect(row(page, 'everyone').getByRole('rowheader')).toHaveText('Everyone');
  const empty = page.locator('[data-component="empty-state"]');
  await expect(empty).toContainText('Only your time zone so far');
  await expect(page.getByText('You can add 7 more.')).toBeVisible();
  expect(foreign).toEqual([]);
});

test('user flow: add zones, see the overlap, fix a mistake, remove a zone', async ({ page }) => {
  await page.goto('/');

  // Invalid input -> inline error on the field, nothing added.
  await addZone(page, 'Mars/Olympus');
  const input = page.getByLabel('Time zone', { exact: true });
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/isn’t a time zone this browser recognises/)).toBeVisible();
  await expect(input).toBeFocused();

  // Valid input (any casing) -> row added, error cleared, empty state gone.
  await addZone(page, 'america/new_york');
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('announcer')).toHaveText('Added New York.');
  await expect(page.locator('[data-component="empty-state"]')).toHaveCount(0);

  const ny = row(page, 'America/New_York');
  await expect(ny.getByRole('rowheader')).toContainText('UTC-4');
  // Same instant: 14:00 London is 09:00 New York, both Best.
  const instant = '[data-start="2026-06-15T13:00:00.000Z"]';
  await expect(ny.locator(instant)).toHaveText('09');
  await expect(ny.locator(instant)).toHaveAttribute('data-rating', 'best');
  await expect(row(page, 'Europe/London').locator(instant)).toHaveText('14');

  // Everyone: London 14-16 == New York 09-11 are Best for both on Monday and
  // Tuesday; Sunday is a weekend.
  const best = row(page, 'everyone').locator('[data-rating="best"]');
  expect(await best.evaluateAll((els) => els.map((el) => el.getAttribute('data-start')))).toEqual([
    '2026-06-15T13:00:00.000Z',
    '2026-06-16T13:00:00.000Z',
  ]);
  await expect(best.first()).toHaveAttribute(
    'aria-label',
    '14:00 to 17:00 your time, Best for everyone',
  );

  // Duplicate -> error.
  await addZone(page, 'America/New_York');
  await expect(page.getByText('That time zone is already on the board.')).toBeVisible();

  // Zones persist across a reload.
  await addZone(page, 'Asia/Tokyo');
  await page.reload();
  await expect(grid(page).getByRole('row')).toHaveCount(4); // you + everyone + 2
  expect(await rowZones(page)).toEqual([
    'Europe/London',
    'everyone',
    'America/New_York',
    'Asia/Tokyo',
  ]);

  // Remove -> focus returns to the input, announcement made.
  await page.getByRole('button', { name: 'Remove New York' }).click();
  await expect(page.getByTestId('announcer')).toHaveText('Removed New York.');
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Remove Tokyo' }).click();
  await expect(page.locator('[data-component="empty-state"]')).toBeVisible();
});

test('theme: follows the OS, switches in Settings, and remembers the choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('radio', { name: 'System default' })).toBeChecked();

  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await dialog.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Escape');
  // Background transitions over --duration-base; poll until it settles.
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe('rgb(246, 244, 239)');
  expect(darkBg).toBe('rgb(18, 19, 22)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`accessibility: no WCAG A/AA violations in ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expectNoA11yViolations(page); // empty state
    await addZone(page, 'Asia/Kolkata');
    // Keeps the modern name, not Chromium's legacy "Asia/Calcutta" alias.
    await expect(page.getByRole('rowheader', { name: /Kolkata/ })).toContainText('UTC+5:30');
    await expect(row(page, 'Asia/Kolkata').locator('[data-rating="good"]').first()).toBeVisible();
    await addZone(page, 'Nope/Nope'); // field error visible
    await expectNoA11yViolations(page);
  });
}

test('keyboard: skip link first, everything reachable, focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
  await page.keyboard.press('Tab');
  const input = page.getByLabel('Time zone', { exact: true });
  await expect(input).toBeFocused();
  const outline = await input.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');

  await page.keyboard.type('Asia/Tokyo');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add zone' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, 'Asia/Tokyo')).toBeVisible();

  // The scrollable grid is itself focusable, then the row's remove button.
  await page.keyboard.press('Tab');
  await expect(grid(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Remove Tokyo' })).toBeFocused();
});

test('storage: migrates the legacy keys once and keeps changes across reloads', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  // Seed the pre-versioned keys before the first load only.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tz-overlap:zones:v1', JSON.stringify(['Asia/Tokyo', 'America/New_York']));
    localStorage.setItem('tz-overlap:theme', 'dark');
  });
  const html = page.locator('html');
  const zoneRows = async () => (await rowZones(page)).filter((zone) => zone !== 'everyone');

  // theme-init.js alone reads the legacy theme before first paint.
  await page.route('**/main.js', (route) => route.abort());
  await page.goto('/');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.unroute('**/main.js');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect.poll(zoneRows).toEqual(['Europe/London', 'Asia/Tokyo', 'America/New_York']);
  const legacy = await page.evaluate(() => [
    localStorage.getItem('tz-overlap:zones:v1'),
    localStorage.getItem('tz-overlap:theme'),
  ]);
  expect(legacy).toEqual([null, null]);

  await addZone(page, 'Europe/Berlin');
  await expect(page.getByTestId('announcer')).toHaveText('Added Berlin.');
  await page.getByRole('button', { name: 'Remove Tokyo' }).click();
  await expect(page.getByTestId('announcer')).toHaveText('Removed Tokyo.');
  await page.reload();
  await expect.poll(zoneRows).toEqual(['Europe/London', 'America/New_York', 'Europe/Berlin']);
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('storage: a theme change in either tab keeps the timeline scroll and focus', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await addZone(page, 'Asia/Tokyo');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('tzoverlap.state')))
    .toContain('Asia/Tokyo');

  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto('/');
  await expect(row(other, 'Asia/Tokyo')).toBeVisible();

  const region = grid(page);
  await region.focus();
  await region.evaluate((el) => {
    el.scrollLeft = 200;
  });
  const scrollLeft = () => region.evaluate((el) => el.scrollLeft);
  const before = await scrollLeft();
  expect(before).toBeGreaterThan(0);

  await chooseAppearance(other, 'Dark');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await scrollLeft()).toBe(before);
  await expect(region).toBeFocused();

  await chooseAppearance(page, 'Light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await scrollLeft()).toBe(before);
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('layout: no sideways page scroll at 320px; the grid scrolls inside itself', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await addZone(page, 'Asia/Tokyo');
  await expect(row(page, 'Asia/Tokyo')).toBeVisible();
  const { page: pageOverflow, region } = await page.evaluate(() => {
    const el = /** @type {HTMLElement} */ (document.querySelector('[role="grid"]'));
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      region: el.scrollWidth - el.clientWidth,
    };
  });
  expect(pageOverflow).toBe(0);
  expect(region).toBeGreaterThan(0);
});

test('type scale: phone-first sizes at 390px (17px body, 13px secondary, 11px floor)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await addZone(page, 'Asia/Tokyo');
  await expect(row(page, 'Asia/Tokyo')).toBeVisible();

  const sizes = await page.evaluate(() => {
    /** @param {string} selector */
    const sizesOf = (selector) =>
      [...document.querySelectorAll(selector)].map((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      );
    const visibleText = [...document.querySelectorAll('body *')]
      .filter(
        (el) =>
          !el.closest('.visually-hidden') &&
          [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()),
      )
      .map((el) => parseFloat(getComputedStyle(el).fontSize));
    return {
      body: getComputedStyle(document.body).fontSize,
      slots: sizesOf('[role="row"]:not([data-zone="everyone"]) [role="gridcell"]'),
      secondary: sizesOf('.grid__meta'),
      visibleText,
    };
  });

  expect(sizes.body).toBe('17px');
  expect(sizes.slots.length).toBeGreaterThan(0);
  expect(Math.min(...sizes.slots)).toBeGreaterThanOrEqual(13);
  expect(Math.min(...sizes.secondary)).toBeGreaterThanOrEqual(13);
  expect(Math.min(...sizes.visibleText)).toBeGreaterThanOrEqual(11);
});

test('error state: browsers without time zone data get a clear failure message', async ({
  page,
}) => {
  // Simulate a minimal-ICU runtime that only knows UTC.
  await page.addInitScript(() => {
    const Original = Intl.DateTimeFormat;
    /** @param {any} locales @param {Intl.DateTimeFormatOptions} [options] */
    function UtcOnly(locales, options) {
      if (options?.timeZone && options.timeZone !== 'UTC') {
        throw new RangeError(`Invalid time zone: ${options.timeZone}`);
      }
      return new Original(locales, options);
    }
    UtcOnly.prototype = Original.prototype;
    UtcOnly.supportedLocalesOf = Original.supportedLocalesOf;
    // @ts-expect-error replacing a built-in for the test
    Intl.DateTimeFormat = UtcOnly;
  });

  await page.goto('/');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Time zones aren’t available');
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByLabel('Time zone', { exact: true })).toHaveCount(0);
  await expectNoA11yViolations(page);
});

// --- Grid (TZO-8): device in Sydney, clock fixed on a Wednesday -----------------

/** Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-11-18T01:00:00Z');

/**
 * Seed `tzoverlap.state` with `zones` before the first load only.
 * @param {import('@playwright/test').Page} page
 * @param {object[]} zones
 */
async function seedZones(page, zones) {
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'tzoverlap.state',
      JSON.stringify({
        version: 1,
        zones: list,
        settings: {
          hourCycle: 'auto',
          theme: 'system',
          filter: 'all',
          weekendsUnavailable: true,
          defaultDuration: 60,
        },
        meta: { installHintDismissed: false, lastHomeTz: null },
      }),
    );
  }, zones);
}

/**
 * Left edge and width of every matching element, in CSS px.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 */
const boxes = (page, selector) =>
  page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, width: rect.width, start: el.getAttribute('data-start') };
    }),
  );

/** @param {number} x */
const frac = (x) => ((x % 1) + 1) % 1;

test.describe('grid', () => {
  test.use({ timezoneId: 'Australia/Sydney' });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(SYDNEY_NOON);
  });

  test('cells sit at their absolute time: Kolkata half a column, Kathmandu a quarter', async ({
    page,
  }) => {
    await page.goto('/');
    await addZone(page, 'Asia/Kolkata');
    await addZone(page, 'Asia/Kathmandu');
    await expect(row(page, 'Asia/Kathmandu')).toBeVisible();

    const home = await boxes(page, '[data-zone="Australia/Sydney"] [role="gridcell"]');
    const first = /** @type {{ left: number, width: number }} */ (home[0]);
    const column = first.width;
    expect(column).toBeGreaterThan(0);
    for (const [zone, expected] of /** @type {const} */ ([
      ['Asia/Kolkata', 0.5],
      ['Asia/Kathmandu', 0.25],
    ])) {
      const cells = await boxes(page, `[data-zone="${zone}"] [role="gridcell"]`);
      expect(cells.length).toBeGreaterThanOrEqual(72);
      for (const cell of cells) {
        const offset = frac((cell.left - first.left) / column);
        expect(Math.abs(offset - expected) * column, `${zone} ${cell.start}`).toBeLessThanOrEqual(
          1,
        );
      }
    }

    // Same data-start, same left edge, in every row.
    const all = await boxes(page, '[role="gridcell"][data-start]');
    /** @type {Map<string, number>} */
    const lefts = new Map();
    let shared = 0;
    for (const { start, left } of all) {
      const seen = lefts.get(/** @type {string} */ (start));
      if (seen === undefined) lefts.set(/** @type {string} */ (start), left);
      else {
        shared += 1;
        expect(Math.abs(seen - left), /** @type {string} */ (start)).toBeLessThanOrEqual(1);
      }
    }
    expect(shared).toBeGreaterThan(0);
  });

  test('heat: three Good steps, hatch on Good only, one Best colour', async ({ page }) => {
    await page.goto('/');
    const homeRow = '[data-zone="Australia/Sydney"]';
    /** @param {number[]} hours */
    const colours = (hours) =>
      page
        .locator(hours.map((hour) => `${homeRow} [data-hour="${hour}"]`).join(', '))
        .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).backgroundColor))]);
    const near = await colours([8, 17]);
    const mid = await colours([7, 18]);
    const far = await colours([6, 19]);
    for (const set of [near, mid, far]) expect(set).toHaveLength(1);
    expect(near[0]).not.toBe(mid[0]);
    expect(mid[0]).not.toBe(far[0]);
    expect(near[0]).not.toBe(far[0]);

    const styles = await page.locator('[role="grid"] [data-rating]').evaluateAll((els) =>
      els.map((el) => ({
        rating: el.getAttribute('data-rating'),
        image: getComputedStyle(el).backgroundImage,
        colour: getComputedStyle(el).backgroundColor,
      })),
    );
    const good = styles.filter((s) => s.rating === 'good');
    const others = styles.filter((s) => s.rating !== 'good');
    expect(good.length).toBeGreaterThan(0);
    expect(good.every((s) => s.image.includes('repeating-linear-gradient'))).toBe(true);
    expect(others.every((s) => s.image === 'none')).toBe(true);
    const best = new Set(styles.filter((s) => s.rating === 'best').map((s) => s.colour));
    expect(best.size).toBe(1);
  });

  test('Everyone takes the reddest step among the zones', async ({ page }) => {
    await page.goto('/');
    await addZone(page, 'Asia/Tokyo');
    const everyone = row(page, 'everyone');
    const bg = (/** @type {import('@playwright/test').Locator} */ el) =>
      el.evaluate((node) => getComputedStyle(node).backgroundColor);

    // Sydney 19:00 = Tokyo 17:00: Sydney's far step wins.
    const evening = '[data-start="2026-11-18T08:00:00.000Z"]';
    const segment = everyone.locator(evening);
    await expect(segment).toHaveAttribute('data-rating', 'good');
    await expect(segment).toHaveAttribute('data-heat', '2');
    const sydney19 = row(page, 'Australia/Sydney').locator(evening);
    await expect(sydney19).toHaveText('19');
    expect(await bg(segment)).toBe(await bg(sydney19));

    // Sydney 08:00 = Tokyo 06:00: Tokyo's far step wins.
    const morning = '[data-start="2026-11-17T21:00:00.000Z"]';
    await expect(everyone.locator(morning)).toHaveAttribute('data-heat', '2');
    const tokyo06 = row(page, 'Asia/Tokyo').locator(morning);
    await expect(tokyo06).toHaveText('06');
    expect(await bg(everyone.locator(morning))).toBe(await bg(tokyo06));
  });

  test('rows: home, then Everyone directly below, then zones in store order', async ({ page }) => {
    await page.goto('/');
    await addZone(page, 'Asia/Kolkata');
    await addZone(page, 'Asia/Tokyo');
    await expect(row(page, 'Asia/Tokyo')).toBeVisible();
    expect(await rowZones(page)).toEqual([
      'Australia/Sydney',
      'everyone',
      'Asia/Kolkata',
      'Asia/Tokyo',
    ]);
    const homeBox = await row(page, 'Australia/Sydney').boundingBox();
    const everyoneBox = await row(page, 'everyone').boundingBox();
    if (!homeBox || !everyoneBox) throw new Error('rows have no box');
    expect(Math.abs(everyoneBox.y - (homeBox.y + homeBox.height))).toBeLessThanOrEqual(1);
  });

  test('Everyone segments sit on 15-minute edges; with Kolkata, Best starts at 14:30', async ({
    page,
  }) => {
    await page.goto('/');
    await addZone(page, 'Asia/Kolkata');
    await expect(row(page, 'Asia/Kolkata')).toBeVisible();

    const [midnight] = await boxes(
      page,
      '[data-zone="Australia/Sydney"] [data-start="2026-11-17T13:00:00.000Z"]',
    );
    const [best] = await boxes(
      page,
      '[data-zone="everyone"] [data-rating="best"][data-start="2026-11-18T03:30:00.000Z"]',
    );
    if (!midnight || !best) throw new Error('missing Sydney 00:00 cell or Best segment');
    const column = midnight.width;
    const offset = (best.left - midnight.left) / column;
    expect(Math.abs(offset - 14.5) * column).toBeLessThanOrEqual(1);

    const minutes = await page
      .locator('[data-zone="everyone"] [role="gridcell"]')
      .evaluateAll((els) =>
        els.map((el) =>
          new Date(/** @type {string} */ (el.getAttribute('data-start'))).getUTCMinutes(),
        ),
      );
    expect(minutes.length).toBeGreaterThan(1);
    expect(minutes.every((m) => [0, 15, 30, 45].includes(m))).toBe(true);
  });

  test('a repeated hour gets a second cell with a marker and a tooltip', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T01:00:00Z')); // Sydney 1 Nov 12:00
    await page.goto('/');
    await addZone(page, 'America/New_York');
    const ny = row(page, 'America/New_York');
    const cell = (/** @type {string} */ iso) => ny.locator(`[data-start="${iso}"]`);

    const first = cell('2026-11-01T05:00:00.000Z');
    const repeat = cell('2026-11-01T06:00:00.000Z');
    await expect(first).toHaveAttribute('data-hour', '1');
    await expect(repeat).toHaveAttribute('data-hour', '1');
    await expect(repeat.locator('sup')).toHaveText('2');
    await expect(repeat).toHaveAttribute('title', 'Clocks go back — this hour repeats');
    for (const plain of [
      first,
      cell('2026-10-31T05:00:00.000Z'),
      cell('2026-11-02T06:00:00.000Z'),
    ]) {
      await expect(plain).toHaveAttribute('data-hour', '1');
      await expect(plain.locator('sup')).toHaveCount(0);
      await expect(plain).not.toHaveAttribute('title', /.*/);
    }
  });

  test('the grid covers three days and scrolls inside itself at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    const homeCells = row(page, 'Australia/Sydney').getByRole('gridcell');
    expect(await homeCells.count()).toBeGreaterThanOrEqual(72);
    const sizes = await page.evaluate(() => {
      const el = /** @type {HTMLElement} */ (document.querySelector('[role="grid"]'));
      const track = /** @type {HTMLElement} */ (el.querySelector('.grid__track'));
      const cell = /** @type {HTMLElement} */ (track.querySelector('[role="gridcell"]'));
      return {
        track: track.getBoundingClientRect().width,
        column: cell.getBoundingClientRect().width,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        grid: el.scrollWidth - el.clientWidth,
      };
    });
    expect(sizes.track).toBeGreaterThanOrEqual(72 * sizes.column - 1);
    expect(sizes.page).toBe(0);
    expect(sizes.grid).toBeGreaterThan(0);
  });

  test('eight zones stay within 1,100 elements', async ({ page }) => {
    const tzs = [
      'Asia/Kolkata',
      'Asia/Tokyo',
      'America/New_York',
      'Europe/London',
      'Asia/Kathmandu',
      'America/Los_Angeles',
      'Europe/Berlin',
    ];
    await seedZones(
      page,
      tzs.map((tz, i) => ({ id: `z${i}`, kind: 'iana', tz, label: tz.split('/')[1] })),
    );
    await page.goto('/');
    await expect(grid(page).getByRole('row')).toHaveCount(9);
    const count = await grid(page).evaluate((el) => el.querySelectorAll('*').length);
    expect(count).toBeLessThanOrEqual(1100);
  });

  test('a fixed zone gets a row marked No DST', async ({ page }) => {
    await seedZones(page, [
      { id: 'f', kind: 'fixed', minutes: 330, label: 'UTC+5:30' },
      { id: 't', kind: 'iana', tz: 'Asia/Tokyo', label: 'Tokyo' },
    ]);
    await page.goto('/');
    const fixed = row(page, 'fixed:330');
    await expect(fixed.getByRole('rowheader')).toContainText('No DST');
    await expect(fixed.getByRole('rowheader')).toContainText('06:30');
    await expect(row(page, 'Australia/Sydney').getByRole('rowheader')).not.toContainText('No DST');
    await expect(row(page, 'Asia/Tokyo').getByRole('rowheader')).not.toContainText('No DST');
  });

  test('headers show the local time and the offset', async ({ page }) => {
    await page.goto('/');
    await addZone(page, 'Asia/Kolkata');
    await expect(grid(page)).toBeVisible();
    const home = row(page, 'Australia/Sydney').getByRole('rowheader');
    await expect(home).toContainText('Sydney (you)');
    await expect(home).toContainText('12:00');
    await expect(home).toContainText('UTC+11');
    const kolkata = row(page, 'Asia/Kolkata').getByRole('rowheader');
    await expect(kolkata).toContainText('06:30');
    await expect(kolkata).toContainText('UTC+5:30');
  });
});

test.describe('grid clock', () => {
  test.use({ timezoneId: 'Australia/Sydney' });

  test('header times tick on the minute without rebuilding cells', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-18T01:00:30Z') });
    await page.goto('/');
    const time = row(page, 'Australia/Sydney').locator('.grid__time');
    await expect(time).toHaveText('12:00');
    const selector = '[data-zone="Australia/Sydney"] [data-start="2026-11-18T01:00:00.000Z"]';
    const before = await page.locator(selector).elementHandle();
    await page.clock.runFor(31_000);
    await expect(time).toHaveText('12:01');
    const same = await page.evaluate(
      ([el, sel]) => /** @type {Element} */ (el).isConnected && document.querySelector(sel) === el,
      /** @type {const} */ ([before, selector]),
    );
    expect(same).toBe(true);
    await page.clock.runFor(60_000);
    await expect(time).toHaveText('12:02');
  });
});
