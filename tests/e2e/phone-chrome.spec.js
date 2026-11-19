// E2E: the phone chrome (TZO-28): the slim app bar with its Settings gear, the
// one-row bottom toolbar, the compact date button and the shorter footer; and
// the title bar from --bp-md, unchanged. Device in Sydney, clock fixed at 12:00
// on Wed 18 Nov 2026.

import { expect, test } from '@playwright/test';

/** Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-11-18T01:00:00Z');
const HOME = 'Australia/Sydney';
const ZONES = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'America/Los_Angeles'];
const PHONE = { width: 390, height: 844 };

test.use({ timezoneId: HOME, locale: 'en-AU', viewport: PHONE });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SYDNEY_NOON);
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'tzoverlap.state',
      JSON.stringify({
        version: 1,
        zones: list.map((tz, i) => ({ id: `z${i}`, kind: 'iana', tz, label: tz.split('/')[1] })),
        settings: {
          hourCycle: 'auto',
          theme: 'system',
          filter: 'all',
          weekendsUnavailable: true,
          defaultDuration: 60,
        },
        meta: { installHintDismissed: true, lastHomeTz: null },
      }),
    );
  }, ZONES);
});

/** @param {import('@playwright/test').Page} page */
const header = (page) => page.locator('header.shell__header');

/** @param {import('@playwright/test').Page} page */
const toolbar = (page) => page.getByRole('group', { name: 'Toolbar' });

/** @param {import('@playwright/test').Page} page */
const dateInput = (page) => page.locator('.toolbar input[type="date"]');

/** The date button's visible box. @param {import('@playwright/test').Page} page */
const dateButton = (page) => page.locator('.toolbar .date-field__label');

/** @param {import('@playwright/test').Page} page */
const shortDate = (page) => page.locator('.toolbar .date-field__short');

/** @param {import('@playwright/test').Page} page */
const settingsButtons = (page) => page.getByRole('button', { name: 'Settings', exact: true });

/** @param {import('@playwright/test').Page} page */
const todayButton = (page) => page.getByRole('button', { name: 'Today', exact: true });

/** @param {import('@playwright/test').Page} page */
const firstHomeStart = (page) =>
  page
    .locator(`[role="row"][data-zone="${HOME}"] [role="gridcell"]`)
    .first()
    .getAttribute('data-start');

/**
 * Where a Settings button is: in the app bar, in the toolbar, or elsewhere.
 * @param {import('@playwright/test').Locator} locator
 */
const place = (locator) =>
  locator.evaluate((el) =>
    el.closest('.toolbar') ? 'toolbar' : el.closest('header.shell__header') ? 'bar' : 'other',
  );

/** @param {import('@playwright/test').Locator} locator */
async function box(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/**
 * The toolbar's height and the tops of its rendered children.
 * @param {import('@playwright/test').Page} page
 */
const toolbarRows = (page) =>
  toolbar(page).evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    tops: [...el.children]
      .filter((child) => child.getClientRects().length > 0)
      .map((child) => child.getBoundingClientRect().top),
  }));

/** @param {import('@playwright/test').Page} page */
async function expectOneRow(page) {
  const { height, tops } = await toolbarRows(page);
  expect(height).toBeLessThanOrEqual(72);
  expect(tops.length).toBe(3);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
}

/**
 * Every rendered control in the app bar and the toolbar is at least 44×44 px.
 * @param {import('@playwright/test').Page} page
 */
async function expectBigControls(page) {
  const sizes = await header(page).evaluate((el) =>
    [...el.querySelectorAll('button, input[type="date"], .segmented__option')]
      .filter((c) => c.getClientRects().length > 0)
      .map((c) => {
        const { width, height } = c.getBoundingClientRect();
        return { name: c.textContent?.trim() || c.getAttribute('aria-label'), width, height };
      }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) {
    expect(s.width, `${s.name} width`).toBeGreaterThanOrEqual(44);
    expect(s.height, `${s.name} height`).toBeGreaterThanOrEqual(44);
  }
}

test.describe('phone, 390×844', () => {
  test('a slim app bar without the tagline', async ({ page }) => {
    await page.goto('/');
    expect((await box(header(page))).height).toBeLessThanOrEqual(52);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('TZ Overlap');
    await expect(page.locator('.shell__tagline')).toBeHidden();
  });

  test('the toolbar is one row: date button, Now, then the filter', async ({ page }) => {
    await page.goto('/');
    await expectOneRow(page);
    const date = await box(dateButton(page));
    const now = await box(page.getByRole('button', { name: 'Go to now' }));
    const filter = await box(page.getByRole('group', { name: 'Filter' }));
    expect(date.x + date.width).toBeLessThanOrEqual(now.x);
    expect(now.x + now.width).toBeLessThanOrEqual(filter.x);
    await expect(page.getByRole('button', { name: '24-hour' })).toBeHidden();
    await expectBigControls(page);
  });

  test('the date button shows the short date and moves the anchor', async ({ page }) => {
    await page.goto('/');
    await expect(shortDate(page)).toHaveText('Today · Wed 18 Nov');
    await expect(page.locator('.toolbar .date-field__word')).toBeHidden();
    await expect(dateButton(page)).toHaveText('Today · Wed 18 Nov', { useInnerText: true });
    await expect(dateInput(page)).toHaveAccessibleName(/Today/);
    await expect(dateInput(page)).toHaveAttribute('min', '1980-01-01');
    await expect(dateInput(page)).toHaveAttribute('max', '2099-12-31');

    await dateInput(page).fill('2026-07-15');
    await expect(shortDate(page)).toHaveText('Wed 15 July');
    // "Date" stays in the accessible name, visually hidden.
    const word = await box(page.locator('.toolbar .date-field__word'));
    expect(word.width * word.height).toBeLessThanOrEqual(1);
    await expect(dateInput(page)).toHaveAccessibleName(/^Date\b/);
    // 14 Jul 00:00 AEST: the day before the new anchor.
    await expect.poll(() => firstHomeStart(page)).toBe('2026-07-13T14:00:00.000Z');
    await expect(dateInput(page)).toHaveAttribute('min', '1980-01-01');
    await expect(dateInput(page)).toHaveAttribute('max', '2099-12-31');
  });

  test('the input covers the button: a tap at its centre focuses it', async ({ page }) => {
    await page.goto('/');
    const button = await box(dateButton(page));
    const input = await box(dateInput(page));
    expect(input.x).toBeLessThanOrEqual(button.x);
    expect(input.y).toBeLessThanOrEqual(button.y);
    expect(input.x + input.width).toBeGreaterThanOrEqual(button.x + button.width);
    expect(input.y + input.height).toBeGreaterThanOrEqual(button.y + button.height);
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    await expect(dateInput(page)).toBeFocused();
    await page.keyboard.press('Escape');
  });

  test('a focus ring on the button while the input has keyboard focus', async ({ page }) => {
    await page.goto('/');
    await settingsButtons(page).focus();
    await page.keyboard.press('Tab');
    await expect(dateInput(page)).toBeFocused();
    await expect(dateButton(page)).toHaveCSS('outline-style', 'solid');
  });

  test('no Today button; Now brings back today', async ({ page }) => {
    await page.goto('/');
    await dateInput(page).fill('2026-07-15');
    await expect(shortDate(page)).toHaveText('Wed 15 July');
    await expect(todayButton(page)).toBeHidden();
    await page.getByRole('button', { name: 'Go to now' }).click();
    await expect(dateInput(page)).toHaveValue('2026-11-18');
    await expect(shortDate(page)).toHaveText('Today · Wed 18 Nov');
    await expect.poll(() => firstHomeStart(page)).toBe('2026-11-16T13:00:00.000Z');
  });

  test('the filter: clicks and keys 1, 2, 3', async ({ page }) => {
    await page.goto('/');
    const filter = page.getByRole('group', { name: 'Filter' });
    for (const name of ['Good', 'Best', 'All']) {
      await filter.locator('.segmented__option', { hasText: name }).click();
      await expect(filter.getByRole('radio', { name, exact: true })).toBeChecked();
    }
    await page.getByRole('grid', { name: /Hours in each time zone/ }).focus();
    for (const [key, name] of /** @type {const} */ ([
      ['2', 'Good'],
      ['3', 'Best'],
      ['1', 'All'],
    ])) {
      await page.keyboard.press(key);
      await expect(filter.getByRole('radio', { name, exact: true })).toBeChecked();
    }
  });

  test('one Settings gear, in the app bar; Esc returns focus to it', async ({ page }) => {
    await page.goto('/');
    const gear = settingsButtons(page);
    await expect(gear).toHaveCount(1);
    await expect(gear).toBeVisible();
    expect(await place(gear)).toBe('bar');
    await expect(toolbar(page).getByRole('button', { name: 'Settings' })).toHaveCount(0);

    await settingsButtons(page).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(gear).toBeFocused();

    await settingsButtons(page).click();
    await dialog
      .getByRole('group', { name: 'Time format' })
      .getByRole('radio', { name: '24-hour' })
      .check();
    await page.keyboard.press('Escape');
    await expect(
      page.locator(
        `[role="row"][data-zone="${HOME}"] .grid__trigger:not(.grid__trigger--wide) .grid__time`,
      ),
    ).toHaveText('12:00');
  });

  test('tab order: skip link, gear, date, Now, filter, then main', async ({ page }) => {
    await page.goto('/');
    // Now is disabled on today: start from another date, then walk back to the start.
    await dateInput(page).fill('2026-07-15');
    await expect(page.getByRole('button', { name: 'Go to now' })).toBeEnabled();
    await dateInput(page).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(settingsButtons(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(settingsButtons(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dateInput(page)).toBeFocused();
    for (
      let i = 0;
      i < 5 && (await dateInput(page).evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(page.getByRole('button', { name: 'Go to now' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('main')).toContainText('Timelines');
    expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
  });

  test('the footer keeps its line with less padding', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer.shell__footer');
    await expect(footer).toContainText('Runs entirely in your browser.');
    const padding = await footer.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.paddingBlockStart, style.paddingBlockEnd].map(parseFloat);
    });
    for (const p of padding) expect(p).toBeLessThanOrEqual(8);
  });
});

/**
 * Line tops of the date in the date button's text (after "Today · " on today).
 * @param {import('@playwright/test').Page} page
 */
const dateLineTops = (page) =>
  shortDate(page).evaluate((el) => {
    const text = /** @type {Text} */ (el.firstChild);
    const dot = text.data.indexOf('· ');
    const range = document.createRange();
    range.setStart(text, dot < 0 ? 0 : dot + 2);
    range.setEnd(text, text.data.length);
    return [...new Set([...range.getClientRects()].map((r) => Math.round(r.top)))];
  });

test('320×568: one toolbar row, no sideways scroll, big controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  // 30 Sept is among the widest short dates.
  for (const [date, text] of /** @type {const} */ ([
    [null, 'Today · Wed 18 Nov'],
    ['2026-07-15', 'Wed 15 July'],
    ['2026-09-30', 'Wed 30 Sept'],
  ])) {
    if (date) await dateInput(page).fill(date);
    await expect(shortDate(page)).toHaveText(text);
    await expectOneRow(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expectBigControls(page);
    // The date never breaks inside itself, and never runs out of the button.
    expect(await dateLineTops(page)).toHaveLength(1);
    expect(await dateButton(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 820, height: 1180 },
]) {
  test(`${viewport.width}px: the title bar is unchanged`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.shell__tagline')).toBeVisible();
    await expect(header(page).getByRole('group', { name: 'Toolbar' })).toBeVisible();
    await expect(toolbar(page)).not.toHaveCSS('position', 'fixed');
    await expect(settingsButtons(page)).toHaveCount(1);
    await expect(toolbar(page).getByRole('button', { name: 'Settings' })).toBeVisible();
    await expect(shortDate(page)).toBeHidden();

    await dateInput(page).fill('2026-07-15');
    await expect(todayButton(page)).toBeVisible();
    await expect(page.locator('.toolbar .date-field__word')).toHaveText('Date');
    await expect(dateButton(page)).toHaveText('Date', { useInnerText: true });
    await expect(dateInput(page)).toHaveAccessibleName('Date');
    const hourToggle = page.getByRole('button', { name: '24-hour' });
    if (viewport.width === 1440) {
      await expect(hourToggle).toBeVisible();
      await expectBigControls(page);
    } else {
      await expect(hourToggle).toBeHidden();
    }
  });
}

test('Settings focus follows the layout when it changes while open', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const focused = page.locator(':focus');

  expect(await place(settingsButtons(page))).toBe('bar');
  await settingsButtons(page).click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(toolbar(page).getByRole('button', { name: 'Settings' })).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await toolbar(page).getByRole('button', { name: 'Settings' }).click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize(PHONE);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(settingsButtons(page)).toBeFocused();
  expect(await place(focused)).toBe('bar');
  await expect(toolbar(page).getByRole('button', { name: 'Settings' })).toHaveCount(0);
});
