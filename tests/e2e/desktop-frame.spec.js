// E2E: the desktop frame (TZO-32): from --bp-md the title and toolbar share one
// slim top bar (one row from --bp-lg, at most two below it), the Timelines
// region has no card look or visible heading, the legend and tools share one
// row on the grid's top edge, the page grows to --page-max-width while text
// keeps the --content-max-width measure, and the footer follows the content.
// Device in Sydney, clock fixed at 12:00 on Wed 18 Nov 2026, four zones that
// share hours with Sydney seeded (so no no-overlap message shows), install hint
// dismissed.

import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers.js';

/** Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-11-18T01:00:00Z');
const HOME = 'Australia/Sydney';
const OVERLAP = ['Asia/Tokyo', 'Asia/Singapore', 'Pacific/Auckland', 'Australia/Brisbane'];
const APART = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'America/Los_Angeles'];
const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1024, height: 768 };
const TABLET = { width: 820, height: 1180 };
const WIDE = { width: 2560, height: 1440 };

test.use({ timezoneId: HOME, locale: 'en-AU', viewport: DESKTOP });

/**
 * Seed the zones, the default settings and the dismissed install hint.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} zones
 */
async function seed(page, zones) {
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
  }, zones);
}

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

/** @param {Page} page */
const header = (page) => page.locator('header.shell__header');

/** @param {Page} page */
const region = (page) => page.getByRole('region', { name: 'Timelines' });

/** @param {Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {Page} page */
const homeRow = (page) => page.locator(`[role="row"][data-zone="${HOME}"]`);

/** @param {Page} page */
const legend = (page) => page.getByRole('list', { name: 'Legend' });

/** @param {Page} page */
const addCity = (page) => region(page).getByRole('button', { name: 'Add city' });

/** @param {Page} page */
const editButton = (page) => page.getByRole('button', { name: 'Edit time zones', exact: true });

/** @param {Page} page */
const dateInput = (page) => page.locator('.toolbar input[type="date"]');

/** @param {Page} page */
const todayButton = (page) => page.getByRole('button', { name: 'Today', exact: true });

/** @param {Page} page */
const nowButton = (page) => page.getByRole('button', { name: 'Go to now' });

/** @param {Page} page */
const hourToggle = (page) => page.getByRole('button', { name: '24-hour' });

/** @param {Page} page */
const settingsButton = (page) => page.getByRole('button', { name: 'Settings', exact: true });

/** @param {Page} page */
const tagline = (page) => page.locator('.shell__tagline');

/** @param {Page} page */
const message = (page) => page.locator('.no-overlap');

/** @param {Locator} locator */
async function box(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/**
 * The vertical centres of the top bar's rendered controls: the title, then
 * each rendered toolbar child.
 * @param {Page} page
 */
const barCentres = (page) =>
  header(page).evaluate((el) =>
    [el.querySelector('.shell__title'), ...(el.querySelector('.toolbar')?.children ?? [])]
      .filter((c) => c instanceof Element && c.getClientRects().length > 0)
      .map((c) => {
        const b = /** @type {Element} */ (c).getBoundingClientRect();
        return b.top + b.height / 2;
      }),
  );

/** @param {Page} page */
async function expectOneRow(page) {
  expect((await box(header(page))).height).toBeLessThanOrEqual(72);
  const centres = await barCentres(page);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(4);
}

/**
 * The number of distinct rows the top bar's controls sit on (centres more
 * than 4px apart start a new row).
 * @param {Page} page
 */
async function barRows(page) {
  const centres = (await barCentres(page)).sort((a, b) => a - b);
  return centres.filter((c, i) => i === 0 || c - (centres[i - 1] ?? c) > 4).length;
}

/** @param {Page} page */
const noSidewaysScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/**
 * The legend, Add city and Edit overlap vertically (one row) and all end at
 * or above the grid's top.
 * @param {Page} page
 */
async function expectToolsRow(page) {
  const boxes = [await box(legend(page)), await box(addCity(page)), await box(editButton(page))];
  const top = Math.max(...boxes.map((b) => b.y));
  const bottom = Math.min(...boxes.map((b) => b.y + b.height));
  expect(top).toBeLessThan(bottom);
  const g = await box(grid(page));
  for (const b of boxes) expect(b.y + b.height).toBeLessThanOrEqual(g.y);
}

test.describe('seeded zones that share hours', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, OVERLAP);
  });

  test('AC-1: at 1440×900 the top bar is one slim row with the tagline', async ({ page }) => {
    await page.goto('/');
    await expect(homeRow(page)).toBeVisible();
    await expect(hourToggle(page)).toBeVisible();
    await expect(settingsButton(page)).toHaveCount(1);
    await expect(tagline(page)).toBeVisible();
    await expectOneRow(page);
    const t = await box(tagline(page));
    const title = await box(page.locator('.shell__title'));
    expect(t.y).toBeLessThan(title.y + title.height);
    expect(t.y + t.height).toBeGreaterThan(title.y);
    expect(t.x).toBeGreaterThan(title.x + title.width);
  });

  test('AC-2, AC-3: the home row starts high and the hour area is wide', async ({ page }) => {
    await page.goto('/');
    await expect(homeRow(page)).toBeVisible();
    expect((await box(homeRow(page))).y).toBeLessThanOrEqual(140);
    const hours = await grid(page).evaluate((el) => {
      const rowHeader = el.querySelector(`[role="row"] [role="rowheader"]`);
      return el.clientWidth - (rowHeader?.getBoundingClientRect().width ?? 0);
    });
    expect(hours).toBeGreaterThanOrEqual(1100);
  });

  test('AC-4: no visible heading; the legend and tools share a row on the grid', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(region(page)).toBeVisible();
    const heading = await box(region(page).getByRole('heading', { level: 2, name: 'Timelines' }));
    expect(heading.width).toBeLessThanOrEqual(1);
    expect(heading.height).toBeLessThanOrEqual(1);
    await expectToolsRow(page);
    const g = await box(grid(page));
    const { border, rowHeader } = await grid(page).evaluate((el) => ({
      border: parseFloat(getComputedStyle(el).borderLeftWidth),
      rowHeader:
        el.querySelector('[role="row"] [role="rowheader"]')?.getBoundingClientRect().width ?? 0,
    }));
    expect(Math.abs((await box(legend(page))).x - (g.x + border + rowHeader))).toBeLessThanOrEqual(
      2,
    );
    const e = await box(editButton(page));
    expect(Math.abs(e.x + e.width - (g.x + g.width))).toBeLessThanOrEqual(2);
  });

  test('AC-5: nothing around the grid draws a card', async ({ page }) => {
    await page.goto('/');
    const style = await region(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        border: s.borderTopWidth,
        shadow: s.boxShadow,
        padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
      };
    });
    expect(style).toEqual({
      border: '0px',
      shadow: 'none',
      padding: ['0px', '0px', '0px', '0px'],
    });
    const drawn = await grid(page).evaluate((el) => {
      const found = [];
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (
          s.borderTopWidth !== '0px' ||
          s.boxShadow !== 'none' ||
          s.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          s.backgroundImage !== 'none'
        )
          found.push(node.className);
      }
      return found;
    });
    expect(drawn).toEqual([]);
  });

  test('AC-6: the footer follows the timelines', async ({ page }) => {
    await page.goto('/');
    const r = await box(region(page));
    const footer = await box(page.locator('footer.shell__footer'));
    expect(footer.y - (r.y + r.height)).toBeLessThanOrEqual(17);
    expect(footer.y).toBeGreaterThanOrEqual(r.y + r.height);
  });

  test('AC-7: at 1024×768 the top bar stays one row, with Today too', async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await page.goto('/');
    await expect(hourToggle(page)).toBeVisible();
    await expectOneRow(page);
    await dateInput(page).fill('2026-11-25');
    await expect(todayButton(page)).toBeVisible();
    await expectOneRow(page);
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test('AC-8: at 820×1180 the bar has at most two rows and no tagline', async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto('/');
    await expect(homeRow(page)).toBeVisible();
    await expect(tagline(page)).toBeHidden();
    await expect(hourToggle(page)).toBeHidden();
    await expect(settingsButton(page)).toHaveCount(1);
    for (const date of [null, '2026-11-25']) {
      if (date) {
        await dateInput(page).fill(date);
        await expect(todayButton(page)).toBeVisible();
      }
      expect((await box(header(page))).height).toBeLessThanOrEqual(112);
      expect(await barRows(page)).toBeLessThanOrEqual(2);
      expect(await noSidewaysScroll(page)).toBe(true);
    }
    await expectToolsRow(page);
  });

  test('AC-9: at 2560×1440 the grid is capped and centred, text keeps its measure', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    const g = await box(grid(page));
    expect(g.width).toBeLessThanOrEqual(1920);
    expect(Math.abs(g.x - (WIDE.width - (g.x + g.width)))).toBeLessThanOrEqual(1);
    const text = await box(page.locator('footer.shell__footer p').first());
    expect(text.width).toBeLessThanOrEqual(1152);
    expect(Math.abs(text.x - g.x)).toBeLessThanOrEqual(1);
    // Both banners: shown, they keep the measure too.
    const banners = await page
      .locator('main .banner')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).maxWidth));
    expect(banners.length).toBeGreaterThan(0);
    for (const max of banners) expect(max).toBe('1152px');
  });

  test('AC-12: tab order on today and on another date', async ({ page }) => {
    await page.goto('/');
    await expect(nowButton(page)).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

    /** Tab out of the date input, which may hold several stops. */
    const leaveDate = async () => {
      await expect(dateInput(page)).toBeFocused();
      for (
        let i = 0;
        i < 5 && (await dateInput(page).evaluate((el) => el === document.activeElement));
        i++
      ) {
        await page.keyboard.press('Tab');
      }
    };
    /** @param {Locator[]} stops */
    const walk = async (stops) => {
      await page.keyboard.press('Tab');
      await leaveDate();
      for (const stop of stops) {
        await expect(stop).toBeFocused();
        await page.keyboard.press('Tab');
      }
      expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
    };
    const all = page.getByRole('radio', { name: 'All', exact: true });
    await walk([hourToggle(page), all, settingsButton(page)]);

    await dateInput(page).fill('2026-11-25');
    await expect(nowButton(page)).toBeEnabled();
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await walk([todayButton(page), nowButton(page), hourToggle(page), all, settingsButton(page)]);
  });

  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    test.describe(`AC-10: axe, ${colorScheme}`, () => {
      test.use({ colorScheme });

      for (const viewport of [TABLET, LAPTOP, DESKTOP, WIDE]) {
        test(`passes at ${viewport.width}×${viewport.height}`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.goto('/');
          await expect(homeRow(page)).toBeVisible();
          await expectNoA11yViolations(page);
        });
      }
    });
  }
});

test('AC-11: the no-overlap message keeps its box between the tools row and the grid', async ({
  page,
}) => {
  await seed(page, APART);
  await page.goto('/');
  await expect(message(page)).toContainText('No time works for everyone today');
  const style = await message(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopWidth, background: s.backgroundColor };
  });
  expect(style.border).toBe('1px');
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');

  const expectBetween = async () => {
    const m = await box(message(page));
    for (const b of [await box(legend(page)), await box(editButton(page))]) {
      expect(m.y).toBeGreaterThanOrEqual(b.y + b.height);
    }
    expect(m.y + m.height).toBeLessThanOrEqual((await box(grid(page))).y);
  };
  await expectBetween();

  const before = await dateInput(page).inputValue();
  await page.getByRole('button', { name: 'Show next day that works' }).click();
  await expect(message(page)).toContainText(
    'No time works for everyone in the next 14 days either.',
  );
  await expect(page.getByRole('button', { name: 'Show next day that works' })).toHaveCount(0);
  expect(await dateInput(page).inputValue()).toBe(before);
  await expectBetween();
});
