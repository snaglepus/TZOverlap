// E2E: the toolbar, the Settings sheet (Appearance, Reset all data), the
// sheet's focus handling and layout, and toasts.

import { expect, test } from '@playwright/test';
import { NOW, addZone, expectNoA11yViolations, openSettings } from './helpers.js';

const DATA_RESET = 'Your saved data could not be read and was reset';
const RESET_DONE = 'All data was reset.';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/**
 * Seed a corrupt saved state before the first load only.
 * @param {import('@playwright/test').Page} page
 */
async function seedCorruptState(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tzoverlap.state', '{not json');
  });
}

/** @param {import('@playwright/test').Page} page */
const zoneRows = (page) =>
  page
    .locator('[role="row"][data-zone]:not([data-zone="everyone"])')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-zone')));

/** @param {import('@playwright/test').Page} page */
const savedState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('tzoverlap.state') ?? 'null'));

/**
 * The toast message fits in two lines without truncation or shrinking.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function expectToastFits(page, text) {
  const message = page.getByRole('status').locator('.toast__message');
  await expect(message).toHaveText(text);
  const box = await message.evaluate((el) => {
    const style = getComputedStyle(el);
    const fontSizeSm = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--font-size-sm'),
    );
    return {
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(style.lineHeight),
      textOverflow: style.textOverflow,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      fontSize: parseFloat(style.fontSize),
      minFontSize: fontSizeSm * parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
  expect(box.height).toBeLessThanOrEqual(2 * box.lineHeight);
  expect(box.textOverflow).not.toBe('ellipsis');
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
  expect(box.minFontSize).toBe(14);
  expect(box.fontSize).toBeGreaterThanOrEqual(box.minFontSize);
}

test('appearance: System default follows the OS live, without a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const url = page.url();
  await page.evaluate(() => {
    /** @type {any} */ (window).__marker = 'kept';
  });
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('radio', { name: 'System default' })).toBeChecked();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => /** @type {any} */ (window).__marker)).toBe('kept');
});

test('appearance: Dark holds under a light OS and across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe('rgb(18, 19, 22)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const reopened = await openSettings(page);
  await expect(reopened.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
});

test('sheet: opens as a dialog with focus inside; Esc closes and returns focus', async ({
  page,
}) => {
  await page.goto('/');
  const gear = page.getByRole('button', { name: 'Settings' });
  const dialog = await openSettings(page);
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(gear).toBeFocused();
});

test('sheet: the backdrop and the Close button close it and return focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const gear = page.getByRole('button', { name: 'Settings' });

  const dialog = await openSettings(page);
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  await expect(gear).toBeFocused();

  await openSettings(page);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(gear).toBeFocused();
});

test('sheet: Tab and Shift+Tab stay inside the open sheet', async ({ page }) => {
  await page.goto('/');
  const dialog = await openSettings(page);
  const count = await dialog.locator('button, input').count();
  const inside = () => dialog.evaluate((el) => el.contains(document.activeElement));

  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < count + 2; i += 1) {
      await page.keyboard.press(key);
      expect(await inside(), `${key} #${i + 1}`).toBe(true);
    }
  }

  // Also with the reset confirmation showing.
  await dialog.getByRole('button', { name: 'Reset all data' }).click();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < count + 2; i += 1) {
      await page.keyboard.press(key);
      expect(await inside(), `${key} #${i + 1} (confirming)`).toBe(true);
    }
  }
});

test('sheet: bottom sheet on a phone, centred modal on a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const dialog = await openSettings(page);
  const phone = /** @type {NonNullable<Awaited<ReturnType<typeof dialog.boundingBox>>>} */ (
    await dialog.boundingBox()
  );
  expect(Math.abs(phone.y + phone.height - 844)).toBeLessThanOrEqual(1);
  expect(Math.abs(phone.width - 390)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1440, height: 900 });
  await openSettings(page);
  const desktop = /** @type {NonNullable<Awaited<ReturnType<typeof dialog.boundingBox>>>} */ (
    await dialog.boundingBox()
  );
  expect(desktop.y + desktop.height).toBeLessThan(900 - 8);
  const left = desktop.x;
  const right = 1440 - (desktop.x + desktop.width);
  expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
});

test('reset: confirm, cancel changes nothing', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await addZone(page, 'Asia/Tokyo');
  const html = page.locator('html');
  let dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await dialog.getByRole('button', { name: 'Reset all data' }).click();
  await expect(dialog.getByRole('button', { name: 'Reset everything' })).toBeVisible();
  await expect(
    dialog.getByRole('group', { name: /This removes your time zones and settings/ }),
  ).toBeVisible();
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeFocused();

  await cancel.click();
  await expect(dialog.getByRole('button', { name: 'Reset everything' })).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Reset all data' })).toBeFocused();
  await expect(page.locator('[role="row"][data-zone="Asia/Tokyo"]')).toHaveCount(1);
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  const text = await page.evaluate(() => localStorage.getItem('tzoverlap.state'));
  expect(text).toContain('Asia/Tokyo');
  expect(text).toContain('"theme":"dark"');

  // Closing the sheet while confirming puts the section back.
  dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'Reset all data' }).click();
  await page.keyboard.press('Escape');
  await openSettings(page);
  await expect(dialog.getByRole('button', { name: 'Reset all data' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Reset everything' })).toBeHidden();
});

test('reset: Reset everything clears zones and settings, here and after a reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await addZone(page, 'Asia/Tokyo');
  const html = page.locator('html');
  const dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await dialog.getByRole('button', { name: 'Reset all data' }).click();
  await dialog.getByRole('button', { name: 'Reset everything' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
  await expect(page.getByRole('status')).toContainText(RESET_DONE);
  await expect.poll(() => zoneRows(page)).toEqual(['Europe/London']);
  await expect(page.locator('[data-component="empty-state"]')).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await openSettings(page);
  await expect(dialog.getByRole('radio', { name: 'System default' })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Reset all data' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect.poll(async () => (await savedState(page))?.zones).toEqual([]);
  await page.reload();
  await expect.poll(() => zoneRows(page)).toEqual(['Europe/London']);
  await expect(page.locator('[data-component="empty-state"]')).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'light');
  const state = await savedState(page);
  expect(state.zones).toEqual([]);
  expect(state.settings.theme).toBe('system');
});

test('corrupt state: the page starts empty and a toast says the data was reset', async ({
  page,
}) => {
  await seedCorruptState(page);
  await page.goto('/');
  await expect.poll(() => zoneRows(page)).toEqual(['Europe/London']);
  await expect(page.locator('[data-component="empty-state"]')).toBeVisible();
  await expect(page.getByRole('status')).toContainText(DATA_RESET);
  expect(await page.evaluate(() => localStorage.getItem('tzoverlap.state.bak'))).toBe('{not json');
});

test('toast: the corrupt-state toast fits two lines on phones, then goes', async ({ page }) => {
  await seedCorruptState(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await expectToastFits(page, DATA_RESET);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectToastFits(page, DATA_RESET);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
});

test('toast: the reset-done toast fits two lines on phones, then goes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'Reset all data' }).click();
  // Keyboard, so the pointer is not left resting on the toast (that pauses it).
  await dialog.getByRole('button', { name: 'Reset everything' }).press('Enter');
  await expectToastFits(page, RESET_DONE);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectToastFits(page, RESET_DONE);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
});

test('toolbar: bottom on a phone, in the header from tablet up, 44px controls', async ({
  page,
}) => {
  const toolbar = page.getByRole('group', { name: 'Toolbar' });
  /** @param {import('@playwright/test').Locator} locator */
  const box = async (locator) =>
    /** @type {NonNullable<Awaited<ReturnType<typeof locator.boundingBox>>>} */ (
      await locator.boundingBox()
    );
  const expectBigButtons = async () => {
    const buttons = toolbar.getByRole('button');
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const button of await buttons.all()) {
      const b = await box(button);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const phone = await box(toolbar);
  expect(Math.abs(phone.y + phone.height - 844)).toBeLessThanOrEqual(1);
  await expectBigButtons();
  // The footer can scroll clear of the fixed toolbar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footer = await box(page.locator('footer'));
  expect(footer.y + footer.height).toBeLessThanOrEqual(phone.y + 1);

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const tablet = await box(toolbar);
  const main = await box(page.locator('main'));
  expect(tablet.y).toBeLessThan(main.y);
  expect(await toolbar.evaluate((el) => el.closest('header') !== null)).toBe(true);
  await expectBigButtons();
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`accessibility: no WCAG A/AA violations with Settings open in ${scheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const dialog = await openSettings(page);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Reset all data' }).click();
    await expect(dialog.getByRole('button', { name: 'Reset everything' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
}
