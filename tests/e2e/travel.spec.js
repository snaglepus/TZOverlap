// E2E: travel detection. The home row follows the device time zone on focus,
// on visibility and on the minute tick, with a toast after travel.

import { expect, test } from '@playwright/test';
import { NOW, expectNoA11yViolations } from './helpers.js';

test.use({ timezoneId: 'Australia/Sydney' });

const TRAVEL_TOAST = "You're now in Los Angeles time";

/**
 * Let the test switch the device zone: a formatter built with no timeZone
 * option uses window.__deviceZone when it is set. Test code only.
 * @param {import('@playwright/test').Page} page
 */
async function fakeDeviceZone(page) {
  await page.addInitScript(() => {
    const Real = Intl.DateTimeFormat;
    /** @param {unknown[]} args */
    const withZone = (args) => {
      const zone = /** @type {any} */ (window).__deviceZone;
      const [locales, options] = args;
      if (!zone || (options && /** @type {any} */ (options).timeZone)) return args;
      return [locales, { .../** @type {object} */ (options ?? {}), timeZone: zone }];
    };
    Intl.DateTimeFormat = new Proxy(Real, {
      apply: (target, self, args) => Reflect.apply(target, self, withZone(args)),
      construct: (target, args, newTarget) => Reflect.construct(target, withZone(args), newTarget),
    });
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone
 */
async function moveTo(page, zone) {
  await page.evaluate((tz) => {
    /** @type {any} */ (window).__deviceZone = tz;
  }, zone);
}

/** @param {import('@playwright/test').Page} page */
async function focus(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

/**
 * Seed the stored state once per session.
 * @param {import('@playwright/test').Page} page
 * @param {{ zones: string[], lastHomeTz: string | null, theme?: string }} seed
 */
async function seed(page, { zones, lastHomeTz, theme = 'system' }) {
  await page.addInitScript(
    ({ zones, lastHomeTz, theme }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'tzoverlap.state',
        JSON.stringify({
          version: 1,
          zones: zones.map((tz, i) => ({
            id: `z${i}`,
            kind: 'iana',
            tz,
            label: tz.slice(tz.indexOf('/') + 1).replace('_', ' '),
          })),
          settings: {
            hourCycle: 'auto',
            theme,
            filter: 'all',
            weekendsUnavailable: true,
            defaultDuration: 60,
          },
          meta: { installHintDismissed: false, lastHomeTz },
        }),
      );
    },
    { zones, lastHomeTz, theme },
  );
}

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

/** @param {import('@playwright/test').Page} page */
const storedState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('tzoverlap.state') ?? 'null'));

test.beforeEach(async ({ page }) => {
  await fakeDeviceZone(page);
});

test('focus after travel: home row moves to the new zone, with a toast', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await seed(page, { zones: ['Europe/London', 'Asia/Tokyo'], lastHomeTz: 'Australia/Sydney' });
  await page.goto('/');
  expect(await rowZones(page)).toEqual([
    'Australia/Sydney',
    'everyone',
    'Europe/London',
    'Asia/Tokyo',
  ]);
  await expect(page.getByText(/You're now in/)).toHaveCount(0);

  await moveTo(page, 'America/Los_Angeles');
  await focus(page);

  await expect(row(page, 'America/Los_Angeles').getByRole('rowheader')).toContainText(
    'Los Angeles',
  );
  expect(await rowZones(page)).toEqual([
    'America/Los_Angeles',
    'everyone',
    'Europe/London',
    'Asia/Tokyo',
  ]);
  await expect(page.getByText(TRAVEL_TOAST)).toBeVisible();
  await expect(row(page, 'Europe/London').getByRole('rowheader')).toContainText('London');
  await expect(row(page, 'Asia/Tokyo').getByRole('rowheader')).toContainText('Tokyo');
  await expect
    .poll(async () => (await storedState(page)).meta.lastHomeTz)
    .toBe('America/Los_Angeles');
});

test('minute tick after travel: home row moves without focus', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await seed(page, { zones: ['Europe/London', 'Asia/Tokyo'], lastHomeTz: 'Australia/Sydney' });
  await page.goto('/');
  await expect(row(page, 'Australia/Sydney')).toBeVisible();

  await moveTo(page, 'America/Los_Angeles');
  await page.clock.runFor(60000);

  expect((await rowZones(page))[0]).toBe('America/Los_Angeles');
  await expect(row(page, 'America/Los_Angeles').getByRole('rowheader')).toContainText(
    'Los Angeles',
  );
  await expect(page.getByText(TRAVEL_TOAST)).toBeVisible();
});

test('no toast on first load or when the zone has not changed', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(row(page, 'Australia/Sydney')).toBeVisible();
  await expect
    .poll(async () => (await storedState(page))?.meta.lastHomeTz)
    .toBe('Australia/Sydney');
  await expect(page.locator('.toast')).toHaveCount(0);

  await page.reload();
  await expect(row(page, 'Australia/Sydney')).toBeVisible();
  await focus(page);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.getByText(/You're now in/)).toHaveCount(0);
});

test('a stored copy of home stays hidden and comes back after moving away', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await seed(page, {
    zones: ['Europe/London', 'America/Los_Angeles'],
    lastHomeTz: 'Australia/Sydney',
  });
  await page.goto('/');
  expect(await rowZones(page)).toEqual([
    'Australia/Sydney',
    'everyone',
    'Europe/London',
    'America/Los_Angeles',
  ]);

  await moveTo(page, 'America/Los_Angeles');
  await focus(page);
  await expect(page.getByText(TRAVEL_TOAST)).toBeVisible();
  expect(await rowZones(page)).toEqual(['America/Los_Angeles', 'everyone', 'Europe/London']);
  // The sheet follows the new home: Sydney is no longer Added, Los Angeles is.
  await page.getByRole('button', { name: 'Add city' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add city' });
  const search = sheet.getByLabel('Search cities, countries or offsets');
  await search.fill('Sydney');
  await expect(sheet.getByRole('button', { name: /^Sydney/ }).first()).not.toContainText('Added');
  await search.fill('Los Angeles');
  await expect(sheet.getByRole('button', { name: /^Los Angeles.*Added/ })).toBeVisible();
  await page.keyboard.press('Escape');
  const stored = await storedState(page);
  expect(stored.zones.map((/** @type {{ tz: string }} */ z) => z.tz)).toEqual([
    'Europe/London',
    'America/Los_Angeles',
  ]);

  await moveTo(page, 'Australia/Sydney');
  await focus(page);
  await expect(row(page, 'Australia/Sydney')).toBeVisible();
  expect(await rowZones(page)).toEqual([
    'Australia/Sydney',
    'everyone',
    'Europe/London',
    'America/Los_Angeles',
  ]);
});

for (const theme of ['light', 'dark']) {
  test(`axe passes after travel with the toast showing (${theme})`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await seed(page, { zones: ['Europe/London'], lastHomeTz: 'Australia/Sydney', theme });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await moveTo(page, 'America/Los_Angeles');
    await focus(page);
    await expect(page.getByText(TRAVEL_TOAST)).toBeVisible();
    await expectNoA11yViolations(page);
  });
}

test('the travel toast fits a 320 px viewport without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.clock.setFixedTime(NOW);
  await seed(page, { zones: [], lastHomeTz: 'Australia/Sydney' });
  await page.goto('/');
  await moveTo(page, 'America/Los_Angeles');
  await focus(page);
  await expect(page.getByText(TRAVEL_TOAST)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
