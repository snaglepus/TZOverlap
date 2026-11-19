// E2E: the Everyone row's summary line (TZO-29) — its three forms, the short
// and long variants, the 12/24-hour switch, the no-overlap message under All,
// and the single announcement each action makes in the polite live region.

import { expect, test } from '@playwright/test';
import { NOW, addZone, expectNoA11yViolations, seedZones } from './helpers.js';

const HOME = 'Australia/Sydney';

test.use({ timezoneId: HOME });

/** Four zones that never share a Best or Good slot with Sydney. */
const APART = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'America/Los_Angeles'];

/** @param {string[]} tzs */
const zones = (tzs) =>
  tzs.map((tz, i) => ({
    id: `z${i}`,
    kind: 'iana',
    tz,
    label: /** @type {string} */ (tz.split('/')[1]).replace('_', ' '),
  }));

/** @typedef {import('@playwright/test').Page} Page */

/** @param {Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {Page} page */
const everyoneRow = (page) => page.locator('[role="row"][data-zone="everyone"]');

/** @param {Page} page */
const header = (page) => everyoneRow(page).getByRole('rowheader');

/** The visible summary variant's text. @param {Page} page */
const summary = (page) => header(page).locator('.grid__summary');

/** @param {Page} page */
const message = (page) => page.locator('.no-overlap');

/** @param {Page} page */
const dateInput = (page) => page.locator('.toolbar input[type="date"]');

/** @param {Page} page */
const announcer = (page) => page.getByTestId('announcer');

/** @param {Page} page @param {'All' | 'Good' | 'Best'} name */
const filterSegment = (page, name) =>
  page
    .getByRole('group', { name: 'Filter' })
    .locator('.segmented__option')
    .filter({ hasText: name });

/**
 * Start recording the announcer's non-empty texts, one per write.
 * @param {Page} page
 */
const record = (page) =>
  page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__observer?.disconnect();
    w.__texts = [];
    const region = /** @type {HTMLElement} */ (document.querySelector('[data-testid="announcer"]'));
    w.__observer = new MutationObserver(() => {
      if (region.textContent) w.__texts.push(region.textContent);
    });
    w.__observer.observe(region, { childList: true, characterData: true, subtree: true });
  });

/**
 * The texts recorded since record(), after a moment for any later writes.
 * @param {Page} page
 */
async function recorded(page) {
  await page.waitForTimeout(300);
  return page.evaluate(() => /** @type {string[]} */ (/** @type {any} */ (window).__texts));
}

test.describe('with a fixed clock', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  test('AC-3: four zones apart under All: No shared hours and none in 14 days', async ({
    page,
  }) => {
    await seedZones(page, zones(APART));
    await page.goto('/');
    await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeChecked();
    await expect(header(page)).toContainText('No shared hours');
    await expect(message(page)).toContainText('No time works for everyone today');
    const next = message(page).getByRole('button', { name: 'Show next day that works' });
    await expect(next).toBeVisible();
    await next.click();
    await expect(message(page)).toContainText(
      'No time works for everyone in the next 14 days either.',
    );
  });

  test('AC-4: a weekend under All moves to Monday, which has a Best range', async ({ page }) => {
    await seedZones(page, zones(['Asia/Tokyo']));
    await page.goto('/');
    await expect(header(page)).toContainText('Best 10:00–17:00');
    await dateInput(page).fill('2026-06-20');
    await expect(message(page)).toContainText('No time works for everyone today');
    await expect(header(page)).toContainText('No shared hours');
    const next = message(page).getByRole('button', { name: 'Show next day that works' });
    await expect(next).toBeVisible();
    await next.click();
    await expect(dateInput(page)).toHaveValue('2026-06-22');
    await expect(message(page)).toBeEmpty();
    await expect(summary(page)).toHaveText(/^Best \d\d:\d\d–\d\d:\d\d$/, { useInnerText: true });
  });

  test('AC-5: Sydney and Tokyo: Best 10:00–17:00, the green segment, and T', async ({ page }) => {
    await seedZones(page, zones(['Asia/Tokyo']));
    await page.goto('/');
    await expect(summary(page)).toHaveText('Best 10:00–17:00', { useInnerText: true });
    // 10:00 Sydney on Monday 15 Jun is 00:00Z.
    const best = everyoneRow(page).locator(
      '[data-rating="best"][data-start="2026-06-15T00:00:00.000Z"]',
    );
    await expect(best).toHaveAttribute(
      'aria-label',
      /^10:00 to 17:00 your time, Best for everyone/,
    );

    await grid(page).focus();
    await record(page);
    await page.keyboard.press('t');
    await expect(summary(page)).toHaveText('Best 10 am–5 pm', { useInnerText: true });
    expect(await recorded(page)).toEqual([]);
  });

  test('AC-7: each action makes one announcement, with the summary', async ({ page, context }) => {
    await seedZones(page, zones(['Asia/Tokyo']));
    await page.goto('/');
    await expect(summary(page)).toHaveText('Best 10:00–17:00', { useInnerText: true });

    // A filter change by click, with older text in the region.
    await filterSegment(page, 'Best').click();
    await expect(announcer(page)).toHaveText('Filter: Best. Everyone: Best 10:00–17:00.');
    await record(page);
    await filterSegment(page, 'Good').click();
    await expect(announcer(page)).toHaveText('Filter: Good. Everyone: Best 10:00–17:00.');
    expect(await recorded(page)).toEqual(['Filter: Good. Everyone: Best 10:00–17:00.']);

    // Adding a city that changes the summary, with older text in the region.
    // London (UTC+1) is Good from 15:00 Sydney; Sydney's own Good ends at 20:00.
    await record(page);
    await addZone(page, 'London');
    await expect(announcer(page)).toHaveText('Added London. Everyone: Good 15:00–20:00.');
    expect(await recorded(page)).toEqual(['Added London. Everyone: Good 15:00–20:00.']);

    // A date change to one with a different summary: Saturday is a weekend.
    await record(page);
    await dateInput(page).fill('2026-06-20');
    await expect(announcer(page)).toHaveText('Everyone: No shared hours.');
    expect(await recorded(page)).toEqual(['Everyone: No shared hours.']);

    // Another tab changes the zones and the filter at once.
    await dateInput(page).fill('2026-06-15');
    await expect(summary(page)).toHaveText('Good 15:00–20:00', { useInnerText: true });
    await page.waitForTimeout(500);
    const other = await context.newPage();
    // Same origin, without the app, so only this write reaches the first tab.
    await other.goto('/manifest.webmanifest');
    await record(page);
    await other.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('tzoverlap.state') ?? '{}');
      state.zones = state.zones.filter((/** @type {{ tz: string }} */ z) => z.tz === 'Asia/Tokyo');
      state.settings.filter = 'best';
      localStorage.setItem('tzoverlap.state', JSON.stringify(state));
    });
    await expect(announcer(page)).toHaveText('Filter: Best. Everyone: Best 10:00–17:00.');
    expect(await recorded(page)).toEqual(['Filter: Best. Everyone: Best 10:00–17:00.']);
  });

  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    test(`AC-8: axe passes with the summary showing (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await seedZones(page, zones(['Asia/Tokyo']));
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await expect(summary(page)).toHaveText('Best 10:00–17:00', { useInnerText: true });
      await expectNoA11yViolations(page);
    });
  }

  for (const [viewport, text, hidden] of /** @type {const} */ ([
    [{ width: 390, height: 844 }, 'None shared', 'No shared hours'],
    [{ width: 1440, height: 900 }, 'No shared hours', 'None shared'],
  ])) {
    test(`AC-8: ${viewport.width} px shows "${text}" on its own line under Everyone`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedZones(page, zones(APART));
      await page.goto('/');
      const shown = header(page).getByText(text, { exact: true });
      await expect(shown).toBeVisible();
      await expect(header(page).getByText(hidden, { exact: true })).toBeHidden();
      await expect(summary(page)).toHaveText(text, { useInnerText: true });
      const name = await header(page).locator('.grid__name').boundingBox();
      const line = await shown.boundingBox();
      if (!name || !line) throw new Error('no box');
      expect(line.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
      expect(Math.abs(line.x - name.x)).toBeLessThanOrEqual(1);
      await expectNoA11yViolations(page);
    });
  }
});

test('AC-7: the minute tick announces nothing', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await seedZones(page, zones(['Asia/Tokyo']));
  await page.goto('/');
  await expect(summary(page)).toHaveText('Best 10:00–17:00', { useInnerText: true });
  await record(page);
  await page.clock.runFor(90_000);
  expect(await recorded(page)).toEqual([]);
  await expect(summary(page)).toHaveText('Best 10:00–17:00', { useInnerText: true });
});
