// E2E: the Add city button, first-run prompt, limit note, A key and the Add
// city sheet (lazy city data, popular list, search, duplicates, focus).

import { expect, test } from '@playwright/test';
import {
  NOW,
  addZone,
  deleteZone,
  expectNoA11yViolations,
  openSettings,
  seedZones,
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/** @param {import('@playwright/test').Page} page */
const addButton = (page) => page.getByRole('button', { name: 'Add city', exact: true });

/** @param {import('@playwright/test').Page} page */
const sheet = (page) => page.getByRole('dialog', { name: 'Add city' });

/** @param {import('@playwright/test').Page} page */
const search = (page) => sheet(page).getByLabel('Search cities, countries or offsets');

/** @param {import('@playwright/test').Page} page */
const results = (page) => sheet(page).locator('.add-city__result');

/** @param {import('@playwright/test').Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

const LIMIT_NOTE = 'Maximum of 7 time zones. Remove one to add another.';

/** @param {string[]} tzs */
const seeded = (tzs) =>
  tzs.map((tz, i) => ({ id: `z${i}`, kind: 'iana', tz, label: tz.split('/')[1] ?? tz }));

const SEVEN = [
  'Asia/Tokyo',
  'America/New_York',
  'Asia/Kolkata',
  'Europe/Berlin',
  'Australia/Sydney',
  'America/Chicago',
  'Asia/Dubai',
];

test('first run: prompt and primary button; city data loads on the first open only', async ({
  page,
}) => {
  /** @type {string[]} */
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto('/', { waitUntil: 'networkidle' });

  expect(await page.locator('[role="row"]').count()).toBe(2);
  await expect(page.getByText('Add the cities you work with')).toBeVisible();
  await expect(addButton(page)).toHaveClass(/btn--primary/);
  expect(requests.filter((url) => url.includes('/data/cities'))).toEqual([]);

  await addButton(page).click();
  await expect(sheet(page).getByRole('heading', { name: 'Europe' })).toBeVisible();
  expect(requests.filter((url) => url.includes('/data/cities'))).toHaveLength(1);
});

test('popular list: region headings and Tokyo with its time and offset', async ({ page }) => {
  await page.goto('/');
  await addButton(page).click();
  await expect(sheet(page).getByRole('heading', { level: 3, name: 'Europe' })).toBeVisible();
  await expect(sheet(page).getByRole('heading', { level: 3, name: 'Asia' })).toBeVisible();
  const tokyo = results(page).filter({ hasText: 'Tokyo' }).first();
  await expect(tokyo).toContainText('Japan');
  await expect(tokyo).toContainText(/\d{2}:\d{2}/);
  await expect(tokyo).toContainText('22:30');
  await expect(tokyo).toContainText('UTC+9');

  // Times line up down the list, whatever the offset's width.
  const edges = await sheet(page)
    .locator('.add-city__time')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().right)));
  expect(new Set(edges).size).toBe(1);
});

test('search: nyc finds New York, adds it, and it survives a reload', async ({ page }) => {
  await page.goto('/');
  await addButton(page).click();
  await search(page).fill('nyc');
  await expect(results(page).first()).toContainText('New York');
  await expect(results(page).first()).toContainText('United States');
  await results(page).first().click();

  await expect(sheet(page)).toBeHidden();
  await expect(row(page, 'America/New_York').getByRole('rowheader')).toContainText('New York');
  await expect(page.getByTestId('announcer')).toHaveText('Added New York.');
  await expect(addButton(page)).toHaveClass(/btn--secondary/);

  await page.reload();
  await expect(row(page, 'America/New_York').getByRole('rowheader')).toContainText('New York');
});

test('fixed offset: +5:30 comes first and adds a No DST row', async ({ page }) => {
  await page.goto('/');
  await addButton(page).click();
  await search(page).fill('+5:30');
  await expect(results(page).first()).toContainText('UTC+5:30 (fixed, no daylight saving)');
  await results(page).first().click();
  await expect(row(page, 'fixed:330').getByRole('rowheader')).toContainText('No DST');
});

test('abbreviations: IST lists every meaning', async ({ page }) => {
  await page.goto('/');
  await addButton(page).click();
  await search(page).fill('IST');
  await expect(sheet(page)).toContainText('India Standard Time');
  await expect(sheet(page)).toContainText('Irish Standard Time');
  await expect(sheet(page)).toContainText('Israel Standard Time');
});

test('no results: a message instead of a list', async ({ page }) => {
  await page.goto('/');
  await addButton(page).click();
  await search(page).fill('zzzzqx');
  await expect(sheet(page)).toContainText('No matching cities or time zones.');
  await search(page).fill('  ');
  await expect(sheet(page).getByRole('heading', { name: 'Asia' })).toBeVisible();
});

test('duplicates: stored and home zones are marked Added and never re-added', async ({ page }) => {
  await seedZones(page, seeded(['Asia/Tokyo']));
  await page.goto('/');
  await addButton(page).click();
  await search(page).fill('tokyo');
  const tokyo = sheet(page)
    .getByRole('button', { name: /Tokyo.*Added/ })
    .first();
  await expect(tokyo).toBeVisible();
  await tokyo.click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page)).toContainText('That time zone is already in your list.');
  await expect(grid(page).getByRole('row')).toHaveCount(3);

  await search(page).fill('london');
  await expect(
    sheet(page)
      .getByRole('button', { name: /^London.*Added/ })
      .first(),
  ).toBeVisible();
});

test('limit: at 7 zones the note replaces the button; removing one brings it back', async ({
  page,
}) => {
  await seedZones(page, seeded(SEVEN));
  await page.goto('/');
  await expect(page.getByText(LIMIT_NOTE)).toBeVisible();
  await expect(addButton(page)).toHaveCount(0);
  await page.locator('body').press('a');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await deleteZone(page, 'Asia/Tokyo');
  await expect(addButton(page)).toBeFocused();
  await expect(page.getByText(LIMIT_NOTE)).toHaveCount(0);
});

test('A key: opens the sheet, not over Settings; desktop focuses search; Esc returns focus', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('body').press('a');
  await expect(sheet(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(addButton(page)).toBeFocused();

  const settings = await openSettings(page);
  await page.keyboard.press('a');
  await expect(sheet(page)).toBeHidden();
  await expect(settings).toBeVisible();
});

test('load failure: an alert asks for a reload', async ({ page }) => {
  await page.route('**/data/cities*', (route) => route.abort());
  await page.goto('/');
  await addButton(page).click();
  await expect(sheet(page).getByRole('alert')).toContainText('Couldn’t load the city list');
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`accessibility: the sheet passes axe in ${scheme} theme`, async ({ page }) => {
    await seedZones(page, seeded(['Asia/Tokyo']));
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await addButton(page).click();
    await expect(sheet(page).getByRole('heading', { name: 'Asia' })).toBeVisible();
    await expectNoA11yViolations(page);
    await search(page).fill('tokyo');
    await expect(results(page).first()).toContainText('Added');
    await expectNoA11yViolations(page);
  });
}

test('cross-tab: reaching the limit while open sends focus to the grid on close', async ({
  page,
  context,
}) => {
  await seedZones(page, seeded(SEVEN.slice(0, 6)));
  await page.goto('/');
  await addButton(page).click();
  await expect(sheet(page)).toBeVisible();

  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto('/');
  await addZone(other, 'Seoul');
  await expect(page.getByText(LIMIT_NOTE)).toBeAttached();

  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(grid(page)).toBeFocused();
});

test('cross-tab: a re-render while open sends focus to the new Add city button', async ({
  page,
  context,
}) => {
  await seedZones(page, seeded(SEVEN.slice(0, 2)));
  await page.goto('/');
  await addButton(page).click();
  await expect(sheet(page)).toBeVisible();

  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto('/');
  await addZone(other, 'Seoul');
  await expect(row(page, 'Asia/Seoul')).toBeAttached();

  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(addButton(page)).toBeFocused();
});

for (const width of [320, 375]) {
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    test(`phone layout: results don't overlap at ${width}px in ${scheme} theme`, async ({
      page,
    }) => {
      await seedZones(page, seeded(['Europe/London']));
      await page.setViewportSize({ width, height: 700 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await addButton(page).click();
      await search(page).fill('Lon');
      await expect(results(page).first()).toContainText('Added');

      const layout = await results(page).evaluateAll((buttons) =>
        buttons.map((button) => {
          const parts = [
            ...button.querySelectorAll(
              '.add-city__primary, .add-city__secondary, .add-city__added, .add-city__time, .add-city__offset',
            ),
          ].map((el) => {
            // Text is measured by its own extent, which overflows a squeezed box;
            // the pill by its border box.
            if (el.classList.contains('add-city__added')) return el.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getBoundingClientRect();
          });
          const overlaps = parts.some((a, i) =>
            parts
              .slice(i + 1)
              .some(
                (b) =>
                  a.left < b.right - 1 &&
                  b.left < a.right - 1 &&
                  a.top < b.bottom - 1 &&
                  b.top < a.bottom - 1,
              ),
          );
          const box = button.getBoundingClientRect();
          const inside = parts.every((r) => r.left >= box.left && r.right <= box.right);
          return { overlaps, inside, height: box.height };
        }),
      );
      expect(layout.length).toBeGreaterThan(0);
      for (const result of layout) {
        expect(result.overlaps).toBe(false);
        expect(result.inside).toBe(true);
        expect(result.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
    });
  }
}
