// E2E: the main page — app shell, add-zone card (input + button), timelines
// card (empty state + timeline table), theme switching and the error state.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// 14:30 in London (BST) on a Monday: deterministic "now" for every test.
const NOW = new Date('2026-06-15T13:30:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone
 */
async function addZone(page, zone) {
  await page.getByLabel('Time zone', { exact: true }).fill(zone);
  await page.getByLabel('Time zone', { exact: true }).press('Enter');
}

/** @param {import('@playwright/test').Page} page */
async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

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
  const empty = page.locator('[data-component="empty-state"]');
  await expect(empty).toContainText('Only your time zone so far');
  await expect(page.getByText('You can add 7 more.')).toBeVisible();

  // The current hour is marked in your row.
  await expect(page.locator('tr[data-zone="Europe/London"] td[aria-current="time"]')).toHaveText(
    /^14/,
  );
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

  const ny = page.locator('tr[data-zone="America/New_York"]');
  await expect(ny.getByRole('rowheader')).toContainText('UTC-4');
  // Same column = same moment: 14:30 London is 09:30 New York.
  await expect(ny.locator('td[aria-current="time"]')).toHaveText(/^09/);
  await expect(ny.locator('td[aria-current="time"]')).toHaveAttribute('data-band', 'ideal');

  // Overlap row: London 14-16 == New York 09-11 are ideal for both.
  const overlap = page.locator('tr[data-zone="overlap"] td');
  await expect(overlap).toHaveCount(24);
  await expect(page.locator('tr[data-zone="overlap"] td[data-band="ideal"]')).toHaveCount(3);

  // Duplicate -> error.
  await addZone(page, 'America/New_York');
  await expect(page.getByText('That time zone is already on the board.')).toBeVisible();

  // Zones persist across a reload.
  await addZone(page, 'Asia/Tokyo');
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(4); // you + 2 + overlap
  // London's day starts at 08:00 the same day in Tokyo and ends on Tokyo's next day.
  const tokyo = page.locator('tr[data-zone="Asia/Tokyo"] td');
  await expect(tokyo.first()).not.toContainText('+1d');
  await expect(tokyo.last()).toContainText('+1d');

  // Remove -> focus returns to the input, announcement made.
  await page.getByRole('button', { name: 'Remove New York' }).click();
  await expect(page.getByTestId('announcer')).toHaveText('Removed New York.');
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Remove Tokyo' }).click();
  await expect(page.locator('[data-component="empty-state"]')).toBeVisible();
});

test('theme: follows the OS, toggles, and remembers the choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: 'Dark theme' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
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
  await expect(page.getByRole('button', { name: 'Dark theme' })).toBeFocused();
  await page.keyboard.press('Tab');
  const input = page.getByLabel('Time zone', { exact: true });
  await expect(input).toBeFocused();
  const outline = await input.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');

  await page.keyboard.type('Asia/Tokyo');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add zone' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('tr[data-zone="Asia/Tokyo"]')).toBeVisible();

  // The scrollable timeline is itself focusable, then the row's remove button.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('region', { name: /hours in each time zone/ })).toBeFocused();
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
  const zoneRows = () =>
    page
      .locator('tbody tr[data-zone]:not([data-zone="overlap"])')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-zone')));

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
  await expect(other.locator('tr[data-zone="Asia/Tokyo"]')).toBeVisible();

  const region = page.locator('.timeline');
  await region.focus();
  await region.evaluate((el) => {
    el.scrollLeft = 200;
  });
  const scrollLeft = () => region.evaluate((el) => el.scrollLeft);
  const before = await scrollLeft();
  expect(before).toBeGreaterThan(0);

  await other.getByRole('button', { name: 'Dark theme' }).click();
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await scrollLeft()).toBe(before);
  await expect(region).toBeFocused();

  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await scrollLeft()).toBe(before);
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('layout: no sideways page scroll on a phone; timeline scrolls inside its region', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await addZone(page, 'Asia/Tokyo');
  const { page: pageOverflow, region } = await page.evaluate(() => {
    const el = /** @type {HTMLElement} */ (document.querySelector('.timeline'));
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
  await expect(page.locator('tr[data-zone="Asia/Tokyo"]')).toBeVisible();

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
      slots: sizesOf('.timeline td.slot'),
      secondary: sizesOf('.timeline__meta, .slot__day'),
      dayMarkers: document.querySelectorAll('.slot__day').length,
      visibleText,
    };
  });

  expect(sizes.body).toBe('17px');
  expect(sizes.slots.length).toBeGreaterThan(0);
  expect(Math.min(...sizes.slots)).toBeGreaterThanOrEqual(13);
  expect(sizes.dayMarkers).toBeGreaterThan(0);
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
