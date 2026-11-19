// E2E: the AC-4 persistence journey (TZO-25). From no zones: add two, drag
// one above the other, delete one and let the delete commit, choose 24-hour
// and Dark in Settings, reload; everything is as left. The locale is en-US, so
// 24-hour differs from its 12-hour default. Device in London, clock fixed at
// 14:30 BST on Mon 15 Jun 2026.

import { expect, test } from '@playwright/test';
import { LIFT_PX, NOW, addZone, deleteZone, openSettings } from './helpers.js';

const HOME = 'Europe/London';
const TOKYO = 'Asia/Tokyo';
const NEW_YORK = 'America/New_York';

test.use({ timezoneId: HOME, locale: 'en-US', viewport: { width: 1280, height: 800 } });

/** @typedef {import('@playwright/test').Page} Page */

/** @param {Page} page @param {string} zone data-zone value */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** The data-zone of every row but Everyone, in order. @param {Page} page */
const shownZones = (page) =>
  page
    .locator('[role="row"][data-zone]:not([data-zone="everyone"])')
    .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).dataset.zone));

/** @param {Page} page */
const saved = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('tzoverlap.state') ?? 'null'));

/** @param {import('@playwright/test').Locator} locator */
async function centre(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * What the reload must keep: the rows, a header time and the home row's
 * hour cell labels.
 * @param {Page} page
 */
async function expectLeftAsSet(page) {
  await expect.poll(() => shownZones(page)).toEqual([HOME, NEW_YORK]);
  await expect(row(page, HOME).locator('.grid__details .grid__time')).toHaveText('14:30');
  await expect(row(page, NEW_YORK).locator('.grid__details .grid__time')).toHaveText('09:30');
  const labels = row(page, HOME).locator('.grid__label');
  for (const text of ['09', '12', '21']) {
    await expect(labels.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(labels.getByText('9a', { exact: true })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

test('AC-4: zones, order, time format and theme survive a reload', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect.poll(() => shownZones(page)).toEqual([HOME]);

  await addZone(page, 'Tokyo');
  await addZone(page, 'New York');
  await expect.poll(() => shownZones(page)).toEqual([HOME, TOKYO, NEW_YORK]);

  // Drag New York's handle above Tokyo's midpoint.
  const grab = await centre(row(page, NEW_YORK).locator('.grid__handle'));
  const target = await centre(row(page, TOKYO).locator('[role="rowheader"]'));
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x, grab.y - LIFT_PX);
  await page.mouse.move(grab.x, target.y - 10, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => shownZones(page)).toEqual([HOME, NEW_YORK, TOKYO]);

  // Delete Tokyo and let the Undo window close.
  await deleteZone(page, TOKYO);
  await expect(page.locator('.toast')).toContainText('Removed Tokyo.');
  await page.mouse.move(0, 0);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });

  const dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: '24-hour' }).check();
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expectLeftAsSet(page);
  await expect
    .poll(async () => {
      const state = await saved(page);
      return {
        zones: state.zones.map((/** @type {{ tz: string }} */ z) => z.tz),
        hourCycle: state.settings.hourCycle,
        theme: state.settings.theme,
      };
    })
    .toEqual({ zones: [NEW_YORK], hourCycle: 'h23', theme: 'dark' });

  await page.reload();
  await expectLeftAsSet(page);
  const state = await saved(page);
  expect(state.zones.map((/** @type {{ tz: string }} */ z) => z.tz)).toEqual([NEW_YORK]);
  expect(state.settings.hourCycle).toBe('h23');
  expect(state.settings.theme).toBe('dark');
});
