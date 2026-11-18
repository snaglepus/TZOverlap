// E2E: the main page — app shell, timelines card (first-run prompt, timeline
// grid, Add city button), theme switching and the error state.

import { expect, test } from '@playwright/test';
import {
  NOW,
  addZone,
  chooseAppearance,
  expectNoA11yViolations,
  openSettings,
  seedZones,
} from './helpers.js';

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
  await expect(row(page, 'Europe/London').getByRole('rowheader')).toContainText('London');
  await expect(row(page, 'Europe/London').getByRole('rowheader')).not.toContainText('(you)');
  // Home and Everyone rows only; the header shows the live time and offset.
  expect(await rowZones(page)).toEqual(['Europe/London', 'everyone']);
  await expect(row(page, 'Europe/London').getByRole('rowheader')).toContainText('14:30');
  await expect(row(page, 'Europe/London').getByRole('rowheader')).toContainText('UTC+1');
  await expect(row(page, 'everyone').getByRole('rowheader')).toHaveText('Everyone');
  const empty = page.locator('[data-component="empty-state"]');
  await expect(empty).toContainText('Add the cities you work with');
  await expect(empty).toContainText('Add up to 7 to see which hours work for everyone.');
  expect(foreign).toEqual([]);
});

test('user flow: add zones, see the overlap, remove a zone', async ({ page }) => {
  await page.goto('/');

  // Row added, prompt gone.
  await addZone(page, 'New York');
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

  // Zones persist across a reload.
  await addZone(page, 'Tokyo');
  await page.reload();
  await expect(grid(page).getByRole('row')).toHaveCount(4); // you + everyone + 2
  expect(await rowZones(page)).toEqual([
    'Europe/London',
    'everyone',
    'America/New_York',
    'Asia/Tokyo',
  ]);

  // Remove -> focus moves to Add city, announcement made.
  await page.getByRole('button', { name: 'Remove New York' }).click();
  await expect(page.getByTestId('announcer')).toHaveText('Removed New York.');
  await expect(page.getByRole('button', { name: 'Add city', exact: true })).toBeFocused();
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
    await addZone(page, 'Kolkata');
    // Keeps the modern name, not Chromium's legacy "Asia/Calcutta" alias.
    await expect(page.getByRole('rowheader', { name: /Kolkata/ })).toContainText('UTC+5:30');
    await expect(row(page, 'Asia/Kolkata').locator('[data-rating="good"]').first()).toBeVisible();
    await expectNoA11yViolations(page);
    // Scrolled away from now: the Now button is enabled.
    await grid(page).evaluate((el) => {
      el.scrollLeft = 0;
    });
    await expect(page.getByRole('button', { name: 'Go to now' })).toBeEnabled();
    await expectNoA11yViolations(page);
  });
}

test('keyboard: skip link first, everything reachable, focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  // The date control (one stop per date part), the 24-hour toggle, then Settings:
  // Today is hidden.
  await page.keyboard.press('Tab');
  const date = page.getByLabel('Today', { exact: true });
  await expect(date).toBeFocused();
  for (let i = 0; i < 5 && (await date.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(page.getByRole('button', { name: '24-hour' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
  // The filter: one stop, on the checked radio.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeFocused();
  // The scrollable grid is itself focusable, then the home row's one keyboard
  // slot, then Add city below it.
  await page.keyboard.press('Tab');
  await expect(grid(page)).toBeFocused();
  await page.keyboard.press('Tab');
  const slot = row(page, 'Europe/London').locator('[role="gridcell"][tabindex="0"]');
  await expect(slot).toHaveCount(1);
  await expect(slot).toBeFocused();
  await page.keyboard.press('Tab');
  const add = page.getByRole('button', { name: 'Add city', exact: true });
  await expect(add).toBeFocused();
  const outline = await add.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');

  await page.keyboard.press('Enter');
  await page.keyboard.type('Tokyo');
  const first = page.getByRole('dialog', { name: 'Add city' }).locator('.add-city__result').first();
  await expect(first).toContainText('Japan');
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, 'Asia/Tokyo')).toBeVisible();
  await expect(add).toBeFocused();

  // The row's remove button sits between the grid and Add city.
  await page.keyboard.press('Shift+Tab');
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

  await addZone(page, 'Berlin');
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
  await addZone(page, 'Tokyo');
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
  // 200px on from the opening position: clear of both extension margins.
  await region.evaluate((el) => {
    el.scrollLeft += 200;
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
  await addZone(page, 'Tokyo');
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
  await addZone(page, 'Tokyo');
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
      secondary: sizesOf('.grid__meta, .grid__clock'),
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
  await expect(page.getByRole('button', { name: 'Add city' })).toHaveCount(0);
  await expectNoA11yViolations(page);
});

// --- Grid (TZO-8): device in Sydney, clock fixed on a Wednesday -----------------

/** Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-11-18T01:00:00Z');

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
    await addZone(page, 'Kolkata');
    await addZone(page, 'Kathmandu');
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

    // Everyone segments have no text: Best has an inner edge, Unsuitable is plain.
    await addZone(page, 'Tokyo');
    const edges = await row(page, 'everyone')
      .locator('[data-rating]')
      .evaluateAll((els) =>
        els.map((el) => ({
          rating: el.getAttribute('data-rating'),
          shadow: getComputedStyle(el).boxShadow,
        })),
      );
    const bestEdges = edges.filter((e) => e.rating === 'best');
    expect(bestEdges.length).toBeGreaterThan(0);
    expect(bestEdges.every((e) => e.shadow.includes('inset'))).toBe(true);
    expect(edges.filter((e) => e.rating !== 'best').every((e) => e.shadow === 'none')).toBe(true);

    // Legend swatches are outlined in --color-border-strong (3:1 against the card).
    const outlines = await page
      .locator('.legend__swatch')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor));
    expect(new Set(outlines)).toEqual(new Set(['rgb(125, 119, 108)']));

    // The edge is a non-text cue: at least 3:1 against the Best fill, in both themes.
    const edgeContrast = () =>
      row(page, 'everyone')
        .locator('[data-rating="best"]')
        .first()
        .evaluate((el) => {
          /** @param {string} css */
          const luminance = (css) => {
            const [r = 0, g = 0, b = 0] = (css.match(/\d+(\.\d+)?/g) ?? []).map((v) => {
              const c = Number(v) / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const style = getComputedStyle(el);
          const edge = luminance(style.boxShadow.slice(0, style.boxShadow.indexOf(')') + 1));
          const fill = luminance(style.backgroundColor);
          return (Math.max(edge, fill) + 0.05) / (Math.min(edge, fill) + 0.05);
        });
    for (const scheme of /** @type {const} */ (['light', 'dark'])) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await expect.poll(edgeContrast).toBeGreaterThanOrEqual(3);
    }
  });

  test('Everyone takes the reddest step among the zones', async ({ page }) => {
    await page.goto('/');
    await addZone(page, 'Tokyo');
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
    await addZone(page, 'Kolkata');
    await addZone(page, 'Tokyo');
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
    await addZone(page, 'Kolkata');
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
    await addZone(page, 'New York');
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

  // Each hour cell wraps its label in .grid__label (hidden on odd hours when labels don't fit).
  test('eight zones stay within 1,400 elements', async ({ page }) => {
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
    expect(count).toBeLessThanOrEqual(1400);
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
    await addZone(page, 'Kolkata');
    await expect(grid(page)).toBeVisible();
    const home = row(page, 'Australia/Sydney').getByRole('rowheader');
    await expect(home).toContainText('Sydney');
    await expect(home).not.toContainText('(you)');
    await expect(home).toContainText('12:00');
    await expect(home).toContainText('AEDT · UTC+11');
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
    const time = row(page, 'Australia/Sydney').locator('.grid__details .grid__time');
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

// --- Row headers (TZO-12): device in Sydney -------------------------------------

/** Tuesday 17 Nov 2026, 21:30:30 in Sydney: Kiritimati Wed 00:30, Pago Pago Mon 23:30. */
const SYDNEY_EVENING = new Date('2026-11-17T10:30:30Z');
/** 30 characters. */
const LONG_LABEL = 'Our very long regional office!';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone
 */
const header = (page, zone) => row(page, zone).getByRole('rowheader');

/** Zone rowheaders (not Everyone). @param {import('@playwright/test').Page} page */
const zoneHeaders = (page) =>
  page.locator('[role="row"]:not([data-zone="everyone"]) [role="rowheader"]');

test.describe('row headers', () => {
  test.use({ timezoneId: 'Australia/Sydney' });

  test('home row: plain city name, a labelled location symbol, no row controls', async ({
    page,
  }) => {
    await page.clock.setFixedTime(SYDNEY_EVENING);
    await seedZones(page, [{ id: 't', kind: 'iana', tz: 'Asia/Tokyo', label: 'Tokyo' }]);
    await page.goto('/');
    const first = page.locator('[role="row"]').first();
    await expect(first).toHaveAttribute('data-zone', 'Australia/Sydney');
    const home = first.getByRole('rowheader');
    await expect(home.locator('.grid__details .grid__name')).toHaveText('Sydney');
    await expect(home).not.toContainText('(you)');
    const symbol = home.getByRole('img');
    await expect(symbol).toHaveCount(1);
    await expect(symbol).toHaveAccessibleName('Your location');
    await expect(first.getByRole('button', { name: /Remove|Edit|Delete/ })).toHaveCount(0);
    await expect(first.locator('[draggable="true"]')).toHaveCount(0);
    await expect(
      row(page, 'Asia/Tokyo').getByRole('button', { name: 'Remove Tokyo' }),
    ).toBeVisible();
  });

  test('wide header: time, short date, offset line and day difference', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.setFixedTime(new Date('2026-06-15T20:00:00Z'));
    await seedZones(page, [{ id: 'l', kind: 'iana', tz: 'Europe/London', label: 'London' }]);
    await page.goto('/');
    const london = header(page, 'Europe/London');
    for (const text of ['21:00', 'Mon 15 Jun', 'BST · UTC+1', 'Yesterday']) {
      await expect(london).toContainText(text, { useInnerText: true });
    }
    const sydney = header(page, 'Australia/Sydney');
    for (const text of ['06:00', 'Tue 16 Jun', 'AEST · UTC+10']) {
      await expect(sydney).toContainText(text, { useInnerText: true });
    }
    await expect(sydney).not.toContainText(/Yesterday|Tomorrow|days/, { useInnerText: true });

    await page.clock.setFixedTime(new Date('2026-01-15T01:00:00Z'));
    await page.reload();
    await expect(london).toContainText('GMT · UTC+0', { useInnerText: true });
  });

  test('day differences, and every header ticks without rebuilding cells', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install({ time: SYDNEY_EVENING });
    await seedZones(page, [
      { id: 'k', kind: 'iana', tz: 'Pacific/Kiritimati', label: 'Kiritimati' },
      { id: 'p', kind: 'iana', tz: 'Pacific/Pago_Pago', label: 'Pago Pago' },
    ]);
    await page.goto('/');
    const kiritimati = header(page, 'Pacific/Kiritimati');
    await expect(kiritimati).toContainText('Tomorrow', { useInnerText: true });
    await expect(kiritimati).toContainText('Wed 18 Nov', { useInnerText: true });
    const pago = header(page, 'Pacific/Pago_Pago');
    await expect(pago).toContainText('Yesterday', { useInnerText: true });
    await expect(pago).toContainText('Mon 16 Nov', { useInnerText: true });

    const times = () => page.locator('.grid__details .grid__time').allTextContents();
    expect(await times()).toEqual(['21:30', '00:30', '23:30']);
    const selector = '[data-zone="Australia/Sydney"] [data-start="2026-11-17T10:00:00.000Z"]';
    const before = await page.locator(selector).elementHandle();
    await page.clock.runFor(31_000);
    await expect.poll(times).toEqual(['21:31', '00:31', '23:31']);
    const same = await page.evaluate(
      ([el, sel]) => /** @type {Element} */ (el).isConnected && document.querySelector(sel) === el,
      /** @type {const} */ ([before, selector]),
    );
    expect(same).toBe(true);
  });

  test('phone: a two-line header button opens one details popover', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(SYDNEY_EVENING);
    await seedZones(page, [
      { id: 'k', kind: 'iana', tz: 'Pacific/Kiritimati', label: 'Kiritimati' },
      { id: 'o', kind: 'iana', tz: 'Europe/London', label: LONG_LABEL },
    ]);
    await page.goto('/');
    await expect(zoneHeaders(page)).toHaveCount(3);

    for (const box of await zoneHeaders(page).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().width),
    )) {
      expect(Math.abs(box - 112)).toBeLessThanOrEqual(2);
    }

    // Two one-line rows of text in each button; date and offset stay in the popover.
    const lines = await page.locator('.grid__trigger').evaluateAll((buttons) =>
      buttons.map((button) =>
        ['.grid__name', '.grid__clock'].map((sel) => {
          const el = /** @type {HTMLElement} */ (button.querySelector(sel));
          const style = getComputedStyle(el);
          return el.getBoundingClientRect().height / parseFloat(style.lineHeight);
        }),
      ),
    );
    expect(lines).toHaveLength(3);
    for (const ratios of lines) for (const ratio of ratios) expect(ratio).toBeLessThan(1.5);
    for (const zone of ['Australia/Sydney', 'Pacific/Kiritimati', 'Europe/London']) {
      await expect(row(page, zone).locator('.grid__details')).toBeHidden();
    }
    await expect(header(page, 'Australia/Sydney')).not.toContainText('Tue 17 Nov', {
      useInnerText: true,
    });

    const kiritimati = row(page, 'Pacific/Kiritimati').locator('.grid__trigger');
    await expect(kiritimati.locator('.grid__badge')).toBeVisible();
    await expect(kiritimati.locator('.grid__badge')).toHaveText('+1');
    await expect(kiritimati).toHaveAccessibleName('Kiritimati 00:30 Tomorrow');

    // The remove button sits beside the time, never over it.
    const clockRight = await kiritimati
      .locator('.grid__clock')
      .evaluate((el) => el.getBoundingClientRect().right);
    const remove = await row(page, 'Pacific/Kiritimati')
      .getByRole('button', { name: 'Remove Kiritimati' })
      .boundingBox();
    expect(clockRight).toBeLessThanOrEqual(/** @type {{ x: number }} */ (remove).x);
    const badgeClipped = await kiritimati
      .locator('.grid__clock')
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(badgeClipped).toBe(false);

    const office = row(page, 'Europe/London').locator('.grid__trigger');
    const name = await office.locator('.grid__name').evaluate((el) => ({
      cut: el.scrollWidth > el.clientWidth,
      overflow: getComputedStyle(el).textOverflow,
    }));
    expect(name).toEqual({ cut: true, overflow: 'ellipsis' });
    await expect(office).toHaveAccessibleName(`${LONG_LABEL} 10:30`);

    const details = page.getByRole('group', { name: 'Time zone details' });
    await expect(details).toBeHidden();
    await office.click();
    await expect(office).toHaveAttribute('aria-expanded', 'true');
    await expect(details).toBeVisible();
    await expect(details).toContainText(LONG_LABEL);
    await expect(details).toContainText('Tuesday 17 November 2026');
    await expect(details).toContainText('GMT · UTC+0');
    await expect(details).toBeInViewport({ ratio: 1 });

    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await expect(office).toBeFocused();
    await expect(office).toHaveAttribute('aria-expanded', 'false');

    // Another header refills the same popover.
    await kiritimati.click();
    await expect(details).toContainText('Wednesday 18 November 2026');
    await expect(details).toContainText('Tomorrow');
    await expect(page.locator('.popover')).toHaveCount(1);

    // Tapping outside closes it; so does tapping the same header again.
    await page.getByRole('heading', { level: 1 }).click();
    await expect(details).toBeHidden();
    await expect(kiritimati).toHaveAttribute('aria-expanded', 'false');
    await kiritimati.click();
    await expect(details).toBeVisible();
    await kiritimati.click();
    await expect(details).toBeHidden();
  });

  for (const [width, height, headerWidth, rowHeight] of /** @type {const} */ ([
    [390, 844, 112, 56],
    [820, 1180, 180, 64],
    [1440, 900, 220, 64],
  ])) {
    test(`sizes at ${width}px: ${headerWidth}px headers, rows at least ${rowHeight}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.clock.setFixedTime(SYDNEY_EVENING);
      await seedZones(page, [
        { id: 'k', kind: 'iana', tz: 'Pacific/Kiritimati', label: 'Kiritimati' },
        { id: 'f', kind: 'fixed', minutes: 330, label: 'UTC+5:30' },
      ]);
      await page.goto('/');
      await expect(zoneHeaders(page)).toHaveCount(3);
      const sizes = await page
        .locator('[role="row"]:not([data-zone="everyone"])')
        .evaluateAll((rows) =>
          rows.map((el) => ({
            header: /** @type {Element} */ (
              el.querySelector('[role="rowheader"]')
            ).getBoundingClientRect().width,
            row: el.getBoundingClientRect().height,
          })),
        );
      for (const size of sizes) {
        expect(Math.abs(size.header - headerWidth)).toBeLessThanOrEqual(2);
        expect(size.row).toBeGreaterThanOrEqual(rowHeight);
      }
      if (width < 640) return;
      await expect(page.locator('[role="rowheader"] [aria-expanded]:visible')).toHaveCount(0);
      for (const text of ['Tue 17 Nov', 'AEDT · UTC+11']) {
        await expect(header(page, 'Australia/Sydney')).toContainText(text, {
          useInnerText: true,
        });
      }
      await expect(header(page, 'fixed:330')).toContainText('No DST', { useInnerText: true });
    });
  }

  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    test(`accessibility: headers and the popover pass axe in ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.clock.setFixedTime(SYDNEY_EVENING);
      await seedZones(page, [
        { id: 'k', kind: 'iana', tz: 'Pacific/Kiritimati', label: 'Kiritimati' },
        { id: 'p', kind: 'iana', tz: 'Pacific/Pago_Pago', label: 'Pago Pago' },
      ]);
      await page.goto('/');
      await expect(header(page, 'Pacific/Kiritimati')).toContainText('Tomorrow');
      await expectNoA11yViolations(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await row(page, 'Pacific/Pago_Pago').locator('.grid__trigger').click();
      await expect(page.getByRole('group', { name: 'Time zone details' })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});
