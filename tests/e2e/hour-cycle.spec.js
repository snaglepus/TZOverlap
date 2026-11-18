// E2E: the 12/24-hour setting (TZO-18) — locale default, compact cell labels,
// full header times, the title bar toggle, the Settings group, the T key and
// labels that don't fit at large text.

import { expect, test } from '@playwright/test';
import { addZone, expectNoA11yViolations, openSettings } from './helpers.js';

// 09:30 in London (BST) on Monday 15 June 2026.
const CLOCK = new Date('2026-06-15T08:30:00Z');
const HOME = 'Europe/London';

test.use({ timezoneId: HOME });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(CLOCK);
});

/** @param {import('@playwright/test').Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {import('@playwright/test').Page} page */
const inlineTime = (page) => row(page, HOME).locator('.grid__details .grid__time');

/** @param {import('@playwright/test').Page} page */
const phoneTime = (page) => row(page, HOME).locator('.grid__trigger .grid__time');

/**
 * A home row cell label with exactly `text`.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
const label = (page, text) =>
  row(page, HOME).locator('.grid__label').getByText(text, { exact: true }).first();

/** @param {import('@playwright/test').Page} page */
const toggle = (page) => page.getByRole('button', { name: '24-hour' });

/** @param {import('@playwright/test').Page} page */
async function storedHourCycle(page) {
  const raw = await page.evaluate(() => localStorage.getItem('tzoverlap.state'));
  return raw ? JSON.parse(raw).settings.hourCycle : null;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string[]} texts
 */
async function expectLabels(page, texts) {
  for (const text of texts) await expect(label(page, text)).toBeVisible();
}

test.describe('locale default', () => {
  test.describe('en-US', () => {
    test.use({ locale: 'en-US' });

    test('shows 12-hour times and stores nothing new', async ({ page }) => {
      await page.goto('/');
      await expect(inlineTime(page)).toHaveText('9:30 am');
      await expectLabels(page, ['9a', '12p', '9p']);
      await expect.poll(() => storedHourCycle(page)).toBe('auto');
    });
  });

  test.describe('en-GB', () => {
    test.use({ locale: 'en-GB' });

    test('shows 24-hour times and stores nothing new', async ({ page }) => {
      await page.goto('/');
      await expect(inlineTime(page)).toHaveText('09:30');
      await expectLabels(page, ['09', '12', '21']);
      await expect.poll(() => storedHourCycle(page)).toBe('auto');
    });
  });
});

test.describe('phone', () => {
  test.use({ locale: 'en-US', viewport: { width: 390, height: 844 } });

  test('compact cells, full header, switched from Settings', async ({ page }) => {
    await page.goto('/');
    await expect(phoneTime(page)).toHaveText('9:30 am');
    await expectLabels(page, ['9a', '12p', '9p']);
    await expect(row(page, HOME).locator('[data-hour="9"]').first()).toHaveAttribute(
      'aria-label',
      /^9:00 am, /,
    );

    const dialog = await openSettings(page);
    await dialog.getByRole('radio', { name: '24-hour' }).check();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(phoneTime(page)).toHaveText('09:30');
    await expectLabels(page, ['09', '12', '21']);
    await expect(row(page, HOME).locator('[data-hour="9"]').first()).toHaveAttribute(
      'aria-label',
      /^09:00, /,
    );

    // Default text size: every label fits.
    await expect(grid(page)).not.toHaveAttribute('data-labels');
    const hidden = await grid(page)
      .locator('.grid__label')
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).visibility === 'hidden'));
    expect(hidden).toHaveLength(0);
  });

  test('the title bar toggle is hidden', async ({ page }) => {
    await page.goto('/');
    await expect(toggle(page)).toBeHidden();
  });
});

test.describe('desktop toggle', () => {
  test.use({ locale: 'en-GB', viewport: { width: 1440, height: 900 } });

  test('switches in place, T switches back, the choice survives a reload', async ({ page }) => {
    await page.goto('/');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page)).toHaveAttribute('aria-keyshortcuts', 'T');
    await expect(inlineTime(page)).toHaveText('09:30');

    const cellSelector = `[data-zone="${HOME}"] [data-hour="12"]`;
    const root = await grid(page).elementHandle();
    const cell = await page.locator(cellSelector).first().elementHandle();
    await grid(page).evaluate((el) => {
      el.focus();
      el.scrollLeft = 300;
    });
    const scrollLeft = () => grid(page).evaluate((el) => el.scrollLeft);
    expect(await scrollLeft()).toBe(300);
    /** Both handles are still the live elements. */
    const same = () =>
      page.evaluate(
        ([r, c, sel]) =>
          r?.isConnected &&
          c?.isConnected &&
          document.querySelector('[role="grid"]') === r &&
          document.querySelector(sel) === c,
        /** @type {const} */ ([root, cell, cellSelector]),
      );

    await toggle(page).click();
    await expect(inlineTime(page)).toHaveText('9:30 am');
    await expectLabels(page, ['9a', '12p', '9p']);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await same()).toBe(true);
    expect(await scrollLeft()).toBe(300);

    await grid(page).focus();
    await page.keyboard.press('t');
    await expect(inlineTime(page)).toHaveText('09:30');
    await expectLabels(page, ['09', '12', '21']);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('grid');
    expect(await same()).toBe(true);
    expect(await scrollLeft()).toBe(300);

    await expect.poll(() => storedHourCycle(page)).toBe('h23');
    await page.reload();
    await expect(inlineTime(page)).toHaveText('09:30');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await storedHourCycle(page)).toBe('h23');

    await toggle(page).click();
    await expect.poll(() => storedHourCycle(page)).toBe('h12');
    await page.reload();
    await expect(inlineTime(page)).toHaveText('9:30 am');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('an open details popover follows the switch', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await row(page, HOME).locator('.grid__trigger').click();
    const details = page.locator('.popover .grid__time');
    await expect(details).toHaveText('09:30');
    await row(page, HOME).locator('.grid__trigger').focus();
    await page.keyboard.press('t');
    await expect(details).toHaveText('9:30 am');
  });

  test('T works only with focus in the grid and no modifier', async ({ page }) => {
    await page.goto('/');
    await expect(inlineTime(page)).toHaveText('09:30');

    // Typing in the Add city search field.
    await page.getByRole('button', { name: 'Add city', exact: true }).click();
    const addCity = page.getByRole('dialog', { name: 'Add city' });
    const input = addCity.getByLabel('Search cities, countries or offsets');
    await input.focus();
    await page.keyboard.type('Asia/Tokyo t');
    await expect(input).toHaveValue('Asia/Tokyo t');
    await addCity.getByRole('button', { name: 'Close' }).click();
    await expect(inlineTime(page)).toHaveText('09:30');
    await addZone(page, 'Tokyo');
    await expect(row(page, 'Asia/Tokyo')).toBeVisible();
    await expect(inlineTime(page)).toHaveText('09:30');

    const dialog = await openSettings(page);
    await page.keyboard.press('t');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(inlineTime(page)).toHaveText('09:30');

    await page.getByRole('button', { name: 'Settings' }).focus();
    await page.keyboard.press('t');
    await expect(inlineTime(page)).toHaveText('09:30');

    await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
    await page.keyboard.press('t');
    await expect(inlineTime(page)).toHaveText('09:30');

    await grid(page).focus();
    await page.keyboard.press('Control+t');
    await page.keyboard.press('Shift+T');
    await expect(inlineTime(page)).toHaveText('09:30');
    await expect.poll(() => storedHourCycle(page)).toBe('auto');

    await page.getByRole('button', { name: 'Remove Tokyo' }).focus();
    await page.keyboard.press('t');
    await expect(inlineTime(page)).toHaveText('9:30 am');
    await expect(page.getByRole('button', { name: 'Remove Tokyo' })).toBeFocused();

    // Phone: the header trigger is inside the grid too.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle(page)).toBeHidden();
    await row(page, HOME).locator('.grid__trigger').focus();
    await page.keyboard.press('t');
    await expect(phoneTime(page)).toHaveText('09:30');
  });

  test('Settings Time format follows the toggle and Reset all data', async ({ page }) => {
    await page.goto('/');
    let dialog = await openSettings(page);
    const group = dialog.getByRole('group', { name: 'Time format' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(group.getByRole('radio', { name: 'Automatic' })).toBeChecked();
    await expect(group.getByRole('radio', { name: '12-hour' })).not.toBeChecked();
    await expect(group.getByRole('radio', { name: '24-hour' })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await toggle(page).click();
    await expect(inlineTime(page)).toHaveText('9:30 am');
    dialog = await openSettings(page);
    await expect(group.getByRole('radio', { name: '12-hour' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await toggle(page).click();
    dialog = await openSettings(page);
    await expect(group.getByRole('radio', { name: '24-hour' })).toBeChecked();
    await group.getByRole('radio', { name: '12-hour' }).check();
    await expect(inlineTime(page)).toHaveText('9:30 am');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');

    await dialog.getByRole('button', { name: 'Reset all data' }).click();
    await dialog.getByRole('button', { name: 'Reset everything' }).click();
    await expect(dialog).toBeHidden();
    await expect(inlineTime(page)).toHaveText('09:30');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await openSettings(page);
    await expect(group.getByRole('radio', { name: 'Automatic' })).toBeChecked();
  });

  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    test(`axe: toggle in both states and the Time format group (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      await expectNoA11yViolations(page);
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expectNoA11yViolations(page);
      const dialog = await openSettings(page);
      await expect(dialog.getByRole('group', { name: 'Time format' })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});

/**
 * Per row: visible labels that overlap their neighbour, odd hours shown,
 * even hours hidden, and the visible labels' font sizes.
 * @param {import('@playwright/test').Page} page
 */
const labelReport = (page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]:not([data-zone="everyone"])')];
    let overlaps = 0;
    let oddShown = 0;
    let evenHidden = 0;
    /** @type {number[]} */
    const sizes = [];
    for (const r of rows) {
      const shown = [];
      for (const cell of r.querySelectorAll('[data-hour]')) {
        const el = /** @type {HTMLElement} */ (cell.querySelector('.grid__label'));
        const visible = getComputedStyle(el).visibility === 'visible';
        const odd = Number(cell.getAttribute('data-hour')) % 2 === 1;
        if (odd && visible) oddShown += 1;
        if (!odd && !visible) evenHidden += 1;
        if (!visible) continue;
        shown.push(el.getBoundingClientRect());
        sizes.push(parseFloat(getComputedStyle(el).fontSize));
      }
      shown.sort((a, b) => a.left - b.left);
      for (let i = 1; i < shown.length; i += 1) {
        if (/** @type {DOMRect} */ (shown[i - 1]).right > /** @type {DOMRect} */ (shown[i]).left)
          overlaps += 1;
      }
    }
    return { overlaps, oddShown, evenHidden, sizes };
  });

/** @param {import('@playwright/test').Page} page @param {string} size */
const setRootFontSize = (page, size) =>
  page.evaluate((s) => {
    document.documentElement.style.fontSize = s;
  }, size);

/** @param {import('@playwright/test').Page} page */
const sideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const locale of ['en-US', 'en-GB']) {
  test.describe(`large text at 320 px (${locale})`, () => {
    test.use({ locale, viewport: { width: 320, height: 740 } });

    test('labels that do not fit show on even hours only', async ({ page }) => {
      await page.goto('/');
      await addZone(page, 'Asia/Kathmandu');
      await addZone(page, 'America/New_York');
      await expect(row(page, 'America/New_York')).toBeVisible();
      await expect(grid(page)).not.toHaveAttribute('data-labels');

      await setRootFontSize(page, '200%');
      await expect(grid(page)).toHaveAttribute('data-labels', 'alternate');
      await expect(row(page, HOME).locator('[data-hour="9"] .grid__label').first()).toBeHidden();
      await expect(row(page, HOME).locator('[data-hour="10"] .grid__label').first()).toBeVisible();
      const report = await labelReport(page);
      expect(report.overlaps).toBe(0);
      expect(report.oddShown).toBe(0);
      expect(report.evenHidden).toBe(0);
      const rootSize = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).fontSize),
      );
      expect(rootSize).toBe(32);
      for (const size of report.sizes) {
        expect(size).toBeCloseTo(rootSize * 0.875, 1);
        expect(size).toBeGreaterThanOrEqual(13);
      }
      const width = await row(page, HOME)
        .locator('[data-hour]')
        .first()
        .evaluate((el) => el.getBoundingClientRect().width);
      expect(width).toBeCloseTo(48, 1);
      expect(await sideways(page)).toBe(0);

      await setRootFontSize(page, '100%');
      await expect(grid(page)).not.toHaveAttribute('data-labels');
      const after = await labelReport(page);
      expect(after.oddShown).toBeGreaterThan(0);
      expect(after.evenHidden).toBe(0);
      const hidden = await grid(page)
        .locator('.grid__label')
        .evaluateAll((els) => els.filter((el) => getComputedStyle(el).visibility === 'hidden'));
      expect(hidden).toHaveLength(0);

      // A rebuilt grid gets its own observer.
      await addZone(page, 'Asia/Tokyo');
      await expect(row(page, 'Asia/Tokyo')).toBeVisible();
      await expect(grid(page)).not.toHaveAttribute('data-labels');
      await setRootFontSize(page, '200%');
      await expect(grid(page)).toHaveAttribute('data-labels', 'alternate');
    });
  });
}

test.describe('phone header time', () => {
  test.use({ locale: 'en-US' });

  for (const width of [320, 390]) {
    test(`stays on one line inside its header at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      // Pago Pago is on Sunday (−1); Kiritimati is 10:30 pm the same day.
      await addZone(page, 'Pacific/Pago_Pago');
      await addZone(page, 'Pacific/Kiritimati');
      await expect(row(page, 'Pacific/Kiritimati')).toBeVisible();
      await expect(row(page, 'Pacific/Pago_Pago').locator('.grid__badge')).toHaveText('−1');
      await expect(
        row(page, 'Pacific/Kiritimati').locator('.grid__trigger .grid__time'),
      ).toHaveText('10:30 pm');

      const report = await page.evaluate(() =>
        [...document.querySelectorAll('.grid__trigger .grid__time')].map((time) => {
          const header = /** @type {Element} */ (time.closest('[role="rowheader"]'));
          const t = time.getBoundingClientRect();
          const box = header.getBoundingClientRect();
          const style = getComputedStyle(time);
          return {
            inside:
              t.left >= box.left - 0.5 &&
              t.right <= box.right + 0.5 &&
              t.top >= box.top - 0.5 &&
              t.bottom <= box.bottom + 0.5,
            oneLine: t.height <= parseFloat(style.lineHeight) + 0.5,
            text: time.textContent,
          };
        }),
      );
      expect(report).toHaveLength(3);
      for (const entry of report) {
        expect(entry, entry.text ?? '').toMatchObject({ inside: true, oneLine: true });
      }
      expect(await sideways(page)).toBe(0);
    });
  }
});
