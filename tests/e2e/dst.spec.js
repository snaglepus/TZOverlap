// E2E: DST badges on row headers and the clock-change banner for later dates
// (TZO-21). Device in Sydney unless a test says otherwise; London's clocks go
// forward at 2026-03-29T01:00Z and Sydney's go back at 2026-04-04T16:00Z.

import { expect, test } from '@playwright/test';
import { chooseAppearance, expectNoA11yViolations, seedZones } from './helpers.js';

const MARCH_1 = new Date('2026-03-01T01:00:00Z');
const MARCH_20 = new Date('2026-03-20T01:00:00Z');
const LONDON = { id: 'z0', kind: 'iana', tz: 'Europe/London', label: 'London' };
const FIXED = { id: 'z1', kind: 'fixed', minutes: 330, label: 'UTC+5:30' };
const SHOREDITCH = 'London office, Shoreditch engineering team';
const COMPACT = '1 clock change on Sun 29 Mar.';

test.use({ timezoneId: 'Australia/Sydney', viewport: { width: 1280, height: 720 } });

/** @param {import('@playwright/test').Page} page */
const dateInput = (page) => page.locator('.toolbar input[type="date"]');

/** @param {import('@playwright/test').Page} page @param {string} value */
async function pickDate(page, value) {
  await dateInput(page).fill(value);
  await expect(dateInput(page)).toHaveValue(value);
}

/** The DST banner: the second banner in <main>, after the update banner. @param {import('@playwright/test').Page} page */
const dstBanner = (page) => page.locator('main > .banner').nth(1);

/** @param {import('@playwright/test').Page} page @param {string} zone data-zone value */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/**
 * Load with `zones` seeded and the clock fixed at `at`.
 * @param {import('@playwright/test').Page} page
 * @param {object[]} zones
 * @param {Date} at
 */
async function open(page, zones, at) {
  await page.clock.setFixedTime(at);
  await seedZones(page, zones);
  await page.goto('/');
  await expect(page.getByRole('grid')).toBeVisible();
}

/**
 * The visible banner message wraps to at most two lines and is never clipped.
 * @param {import('@playwright/test').Page} page
 */
async function expectTwoLinesAtMost(page) {
  const box = await dstBanner(page)
    .locator('.banner__message')
    .evaluate((el) => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      return {
        fits: el.getBoundingClientRect().height <= 2 * lineHeight + 1,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    });
  expect(box.fits).toBe(true);
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight);
}

test.describe('DST banner', () => {
  test('explains two changes before a later date in a Details sheet', async ({ page }) => {
    await open(page, [LONDON], MARCH_1);
    await pickDate(page, '2026-04-10');
    const banner = dstBanner(page);
    await expect(banner).toHaveRole('status');
    await expect(banner.locator('.banner__long')).toHaveText('2 clock changes before Fri 10 Apr.');

    const details = banner.getByRole('button', { name: 'Details' });
    await details.click();
    const dialog = page.getByRole('dialog', { name: 'Clock changes' });
    await expect(dialog).toBeVisible();
    const items = dialog.getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('London moves to BST on Sun 29 Mar');
    await expect(items.nth(0)).toContainText('clocks go forward');
    await expect(items.nth(1)).toContainText('Sydney moves to AEST on Sun 5 Apr');
    await expect(items.nth(1)).toContainText('clocks go back');
    await expect(items.nth(1)).toContainText('from 10 h to 9 h');

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(details).toBeFocused();
  });

  test('shows nothing today, after Today, or before any change', async ({ page }) => {
    await open(page, [LONDON], MARCH_1);
    const banners = page.locator('main > .banner');
    await expect(banners.filter({ hasText: /clock change|clocks go/ })).toHaveCount(0);

    await pickDate(page, '2026-04-10');
    await expect(dstBanner(page)).toContainText('clock changes');
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(banners.filter({ hasText: /clock change|clocks go/ })).toHaveCount(0);

    await pickDate(page, '2026-03-20');
    await expect(page.locator('.toolbar .date-field__word')).toHaveText('Date');
    await expect(banners.filter({ hasText: /clock change|clocks go/ })).toHaveCount(0);
  });

  test('keeps the sheet and focus on Details across a change', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-29T00:59:00Z') });
    await seedZones(page, [LONDON]);
    await page.goto('/');
    await pickDate(page, '2026-04-10');
    const banner = dstBanner(page);
    await expect(banner.locator('.banner__long')).toHaveText('2 clock changes before Fri 10 Apr.');
    await banner.getByRole('button', { name: 'Details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clock changes' });
    await expect(dialog).toBeVisible();

    await page.clock.runFor(120_000);
    await expect(dialog).toContainText('London moves to BST on Sun 29 Mar');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        text: el?.textContent,
        connected: el?.isConnected,
        inBanner: Boolean(el?.closest('main > .banner + .banner')),
      };
    });
    expect(focused).toEqual({ text: 'Details', connected: true, inBanner: true });
    await expect(banner.locator('.banner__long')).toHaveText(
      'Sydney moves to AEST on Sun 5 Apr: clocks go back 1 h. The gap to London changes from 10 h to 9 h.',
    );
  });

  test('stands beside the update banner', async ({ page }) => {
    await open(page, [LONDON], MARCH_1);
    await pickDate(page, '2026-04-10');
    const update = page.locator('main > .banner').first();
    await expect(update).toBeEmpty();
    await expect(dstBanner(page)).toContainText('2 clock changes');
  });
});

test.describe('DST banner at 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('shows the short sentence for one change and the summary for two', async ({ page }) => {
    await open(page, [LONDON], MARCH_1);
    const short = dstBanner(page).locator('.banner__short');
    await pickDate(page, '2026-04-01');
    await expect(short).toHaveText('London: clocks go forward 29 Mar. Gap now 10 h.');
    await expectTwoLinesAtMost(page);
    await pickDate(page, '2026-04-10');
    await expect(short).toHaveText('2 clock changes before Fri 10 Apr.');
    await expectTwoLinesAtMost(page);
  });

  for (const label of [SHOREDITCH, 'WWWWWWWWWWWWWWW']) {
    test(`falls back to the compact line for the label ${label}`, async ({ page }) => {
      await open(page, [{ ...LONDON, label }], MARCH_1);
      await pickDate(page, '2026-04-01');
      await expect(dstBanner(page).locator('.banner__short')).toHaveText(COMPACT);
      await expectTwoLinesAtMost(page);
    });
  }

  test('measures again after a resize', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, [{ ...LONDON, label: SHOREDITCH }], MARCH_1);
    await pickDate(page, '2026-04-01');
    const banner = dstBanner(page);
    await expect(banner.locator('.banner__long')).toBeVisible();
    await expect(banner.locator('.banner__long')).toContainText(`${SHOREDITCH} moves to BST`);
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(banner.locator('.banner__short')).toHaveText(COMPACT);
    await expectTwoLinesAtMost(page);
  });

  test.describe('in Tokyo', () => {
    test.use({ timezoneId: 'Asia/Tokyo' });

    test('gives the size of a 30-minute change', async ({ page }) => {
      await open(
        page,
        [{ id: 'z0', kind: 'iana', tz: 'Australia/Lord_Howe', label: 'Lord Howe' }],
        MARCH_1,
      );
      await pickDate(page, '2026-04-10');
      await expect(dstBanner(page).locator('.banner__short')).toHaveText(
        'Lord Howe: clocks go back 30 min 5 Apr. Gap now 1.5 h.',
      );
      await expectTwoLinesAtMost(page);
    });
  });
});

test.describe('Row header badges', () => {
  test('follow the shown date', async ({ page }) => {
    await open(page, [LONDON], MARCH_1);
    const warning = row(page, 'Europe/London').locator('.grid__trigger--wide .grid__warning');
    await expect(warning).toBeHidden();
    await pickDate(page, '2026-03-20');
    await expect(warning).toBeVisible();
  });

  test('show DST, the clock-change chip and nothing for fixed zones at 1280 px', async ({
    page,
  }) => {
    await open(page, [LONDON, FIXED], MARCH_20);
    const trigger = row(page, 'Europe/London').locator('.grid__trigger--wide');
    const warning = trigger.locator('.grid__warning');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText(/29 Mar/);
    await expect(trigger).toHaveAccessibleName(/Clocks change Sun 29 Mar/);

    await trigger.click();
    const popover = page.locator('.popover');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('London moves to BST on Sun 29 Mar');
    await expect(popover.getByRole('button', { name: 'Change' })).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();

    const sydney = row(page, 'Australia/Sydney');
    await expect(sydney.locator('.grid__details .grid__dst')).toBeVisible();
    await expect(sydney.locator('.grid__details .grid__dst')).toHaveText('DST');
    await expect(sydney.locator('.grid__warning:visible')).toHaveCount(0);

    const fixed = row(page, 'fixed:330');
    await expect(fixed.locator('.grid__dst, .grid__warning')).toHaveCount(0);
    await expect(fixed.locator('.grid__meta')).toContainText('No DST');
  });

  test.describe('with a London home', () => {
    test.use({ timezoneId: 'Europe/London' });

    test("show the home row's clock-change button at 1280 px", async ({ page }) => {
      await open(page, [FIXED], MARCH_20);
      const warning = row(page, 'Europe/London').locator('button.grid__warning');
      await expect(warning).toBeVisible();
      await expect(warning).toHaveText('29 Mar');
      await expect(warning).toHaveAccessibleName('Clocks change Sun 29 Mar');
      const box = await warning.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);

      await warning.click();
      const popover = page.locator('.popover');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText('Sun 29 Mar');
      await expect(warning).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(popover).toBeHidden();
      await expect(warning).toBeFocused();
    });
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 720 } });

    test('show the chips inside the header button', async ({ page }) => {
      await open(page, [LONDON, FIXED], MARCH_20);
      const trigger = row(page, 'Europe/London').locator(
        '.grid__trigger:not(.grid__trigger--wide)',
      );
      await expect(trigger.locator('.grid__warning')).toBeVisible();
      await expect(trigger).toHaveAccessibleName(/Clocks change Sun 29 Mar/);
      await trigger.click();
      await expect(page.locator('.popover')).toContainText('London moves to BST on Sun 29 Mar');

      await expect(
        row(page, 'Australia/Sydney').locator(
          '.grid__trigger:not(.grid__trigger--wide) .grid__dst',
        ),
      ).toBeVisible();
      await expect(row(page, 'fixed:330').locator('.grid__dst, .grid__warning')).toHaveCount(0);
    });
  });
});

test.describe('Accessibility', () => {
  for (const appearance of /** @type {const} */ (['Light', 'Dark'])) {
    test(`has no violations with the banner and a warning badge (${appearance})`, async ({
      page,
    }) => {
      await open(page, [LONDON], MARCH_1);
      await chooseAppearance(page, appearance);
      await pickDate(page, '2026-04-10');
      await expect(dstBanner(page)).toContainText('2 clock changes');
      await expectNoA11yViolations(page);
      await pickDate(page, '2026-03-20');
      await expect(
        row(page, 'Europe/London').locator('.grid__trigger--wide .grid__warning'),
      ).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});
