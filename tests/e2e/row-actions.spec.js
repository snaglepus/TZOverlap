// E2E: row actions in a user row's header popover: Change, Move up, Move down
// and Delete with Undo, at phone and desktop widths and with the keyboard.

import { expect, test } from '@playwright/test';
import { NOW, deleteZone, expectNoA11yViolations, seedZones } from './helpers.js';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** @param {string[]} tzs */
const seeded = (tzs) =>
  tzs.map((tz, i) => ({
    id: `z${i}`,
    kind: 'iana',
    tz,
    label: (tz.split('/')[1] ?? tz).replace('_', ' '),
  }));

const THREE = ['America/New_York', 'Europe/Paris', 'Asia/Kolkata'];
const FIVE = [...THREE, 'Asia/Dubai', 'America/Chicago'];
const SEVEN = [...FIVE, 'Asia/Singapore', 'America/Los_Angeles'];

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** The header trigger shown at the current width. @param {import('@playwright/test').Page} page @param {string} zone */
const trigger = (page, zone) => row(page, zone).locator('.grid__trigger:visible');

/** @param {import('@playwright/test').Page} page */
const menu = (page) => page.getByRole('group', { name: 'Time zone details' });

/** @param {import('@playwright/test').Page} page @param {string} name */
const action = (page, name) => menu(page).getByRole('button', { name, exact: true });

/** @param {import('@playwright/test').Page} page */
const addButton = (page) => page.getByRole('button', { name: 'Add city', exact: true });

/** The data-zone of each user row, in order. @param {import('@playwright/test').Page} page */
const userZones = (page) =>
  page
    .locator('[role="row"][data-id]')
    .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).dataset.zone));

const ACTIONS = ['Change', 'Move up', 'Move down', 'Delete'];

/** @param {import('@playwright/test').Page} page */
async function expectActions(page) {
  await expect(menu(page)).toBeVisible();
  for (const name of ACTIONS) await expect(action(page, name)).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function expectNoActions(page) {
  for (const name of ACTIONS) await expect(action(page, name)).toHaveCount(0);
}

/** @param {import('@playwright/test').Page} page @param {string} zone @param {string} name */
async function runAction(page, zone, name) {
  await trigger(page, zone).click();
  await action(page, name).click();
}

test.describe('with a fixed clock', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  for (const [width, size] of /** @type {const} */ ([
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ])) {
    test(`${width}: click and right-click open the actions`, async ({ page }) => {
      await page.setViewportSize(size);
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await trigger(page, 'Europe/Paris').click();
      await expectActions(page);
      await expect(trigger(page, 'Europe/Paris')).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(menu(page)).toBeHidden();
      await expect(trigger(page, 'Europe/Paris')).toBeFocused();

      await row(page, 'Europe/Paris').locator('.grid__header').click({ button: 'right' });
      await expectActions(page);
    });
  }

  test('home and Everyone rows have no actions', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    const home = row(page, 'Europe/London').locator('.grid__header');
    await home.click();
    await home.click({ button: 'right' });
    await row(page, 'everyone').locator('.grid__header').click({ button: 'right' });
    await expect(menu(page)).toBeHidden();
    await expectNoActions(page);

    // Phone: the home row's popover shows its details only.
    await page.setViewportSize(PHONE);
    await trigger(page, 'Europe/London').click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).locator('.popover__title')).toHaveText('London');
    await expectNoActions(page);
    await home.click({ button: 'right' });
    await expectNoActions(page);
  });

  test('Change replaces the zone in place and keeps it after a reload', async ({ page }) => {
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    await runAction(page, 'Europe/Paris', 'Change');
    const sheet = page.getByRole('dialog', { name: 'Change Paris' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Search cities, countries or offsets').fill('Tokyo');
    await sheet.locator('.add-city__result').first().click();
    await expect(sheet).toBeHidden();
    await expect
      .poll(() => userZones(page))
      .toEqual(['America/New_York', 'Asia/Tokyo', 'Asia/Kolkata']);
    await expect(trigger(page, 'Asia/Tokyo')).toBeFocused();
    // One write with the new summary: Good for New York, Tokyo and Kolkata only 11:00–12:00 London.
    await expect(page.getByTestId('announcer')).toHaveText(
      'Changed Paris to Tokyo. Everyone: Good 11:00–12:00.',
    );

    // Add city afterwards is plain add mode again.
    await addButton(page).click();
    await expect(page.getByRole('dialog', { name: 'Add city' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect
      .poll(() => userZones(page))
      .toEqual(['America/New_York', 'Asia/Tokyo', 'Asia/Kolkata']);
  });

  test('Change blocks a zone already listed, and works with 7 zones', async ({ page }) => {
    await seedZones(page, seeded(SEVEN));
    await page.goto('/');
    await runAction(page, 'Europe/Paris', 'Change');
    const sheet = page.getByRole('dialog', { name: 'Change Paris' });
    await sheet.getByLabel('Search cities, countries or offsets').fill('New York');
    await sheet.locator('.add-city__result').first().click();
    await expect(sheet.getByText('That time zone is already in your list.')).toBeVisible();
    await expect(sheet).toBeVisible();
    expect(await userZones(page)).toEqual(SEVEN);

    await sheet.getByLabel('Search cities, countries or offsets').fill('Tokyo');
    await sheet.locator('.add-city__result').first().click();
    await expect(sheet).toBeHidden();
    await expect
      .poll(() => userZones(page))
      .toEqual(SEVEN.map((tz) => (tz === 'Europe/Paris' ? 'Asia/Tokyo' : tz)));
  });

  test('Delete removes the row at once; Undo puts it back', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', () => dialogs++);
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    await runAction(page, 'Europe/Paris', 'Delete');
    await expect.poll(() => userZones(page)).toEqual(['America/New_York', 'Asia/Kolkata']);
    await expect(addButton(page)).toBeFocused();
    const toast = page.locator('.toast');
    await expect(toast).toContainText('Removed Paris.');
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => userZones(page)).toEqual(THREE);
    await expect(trigger(page, 'Europe/Paris')).toBeFocused();
    await expect(page.getByTestId('announcer')).toHaveText('Restored Paris.');
    expect(dialogs).toBe(0);
  });

  test('keyboard only: Move down from the first of five rows', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedZones(page, seeded(FIVE));
    await page.goto('/');
    await trigger(page, 'America/New_York').focus();
    await page.keyboard.press('Enter');
    await expect(action(page, 'Change')).toBeFocused();
    await expect(action(page, 'Move up')).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(action(page, 'Move down')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => userZones(page)).toEqual([FIVE[1], FIVE[0], ...FIVE.slice(2)]);
    await expect(menu(page)).toBeHidden();
    await expect(trigger(page, 'America/New_York')).toBeFocused();
    await expect(page.getByTestId('announcer')).toHaveText('New York moved to position 2 of 5');
    await page.reload();
    await expect.poll(() => userZones(page)).toEqual([FIVE[1], FIVE[0], ...FIVE.slice(2)]);
  });

  test('Move down is disabled on the last row', async ({ page }) => {
    await seedZones(page, seeded(FIVE));
    await page.goto('/');
    await trigger(page, 'America/Chicago').click();
    await expect(action(page, 'Move down')).toBeDisabled();
    await expect(action(page, 'Move up')).toBeEnabled();
  });

  test('Change sheet closes when another tab deletes its row', async ({ page, context }) => {
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    await runAction(page, 'Europe/Paris', 'Change');
    const sheet = page.getByRole('dialog', { name: 'Change Paris' });
    await expect(sheet).toBeVisible();

    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto('/');
    await deleteZone(other, 'Europe/Paris');
    await expect.poll(() => userZones(other)).toEqual(['America/New_York', 'Asia/Kolkata']);

    await expect(sheet).toBeHidden();
    await expect(row(page, 'Europe/Paris')).toHaveCount(0);
    await expect(addButton(page)).toBeFocused();
    await other.close();
  });

  for (const [from, to, name] of /** @type {const} */ ([
    [PHONE, DESKTOP, 'phone to desktop'],
    [DESKTOP, PHONE, 'desktop to phone'],
  ])) {
    test(`crossing --bp-md closes the popover: ${name}`, async ({ page }) => {
      await page.setViewportSize(from);
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await trigger(page, 'Europe/Paris').focus();
      await page.keyboard.press('Enter');
      await expect(action(page, 'Change')).toBeFocused();

      await page.setViewportSize(to);
      await expect(menu(page)).toBeHidden();
      const visible = trigger(page, 'Europe/Paris');
      await expect(visible).toBeFocused();
      await expect(visible).toHaveClass(to === DESKTOP ? /grid__trigger--wide/ : /^grid__trigger$/);
      await expect(visible).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Enter');
      await expect(action(page, 'Change')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(visible).toBeFocused();
    });
  }

  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    test(`axe: clean with a row's actions open (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await trigger(page, 'Europe/Paris').click();
      await expectActions(page);
      await expectNoA11yViolations(page);
    });
  }
});

test('Delete times out after 5 s and the deletion is saved', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await seedZones(page, seeded(THREE));
  await page.goto('/');
  await runAction(page, 'Europe/Paris', 'Delete');
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Removed Paris.');
  await page.clock.runFor(5000);
  await expect(toast).toHaveCount(0);
  await page.reload();
  await expect.poll(() => userZones(page)).toEqual(['America/New_York', 'Asia/Kolkata']);
});
