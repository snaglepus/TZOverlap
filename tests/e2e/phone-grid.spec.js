// E2E: the phone grid (TZO-33): below --bp-md the Timelines card has no card
// look, the heading is visually hidden, Edit / Done sits above the grid (with
// the no-overlap message on its line, TZO-36), the legend follows the grid,
// headers are 112 px and the drag handles show in Edit mode only; focus leaves
// a handle that hides. The grid limits hold with and without the message. From
// --bp-md (and a phone in landscape) nothing changes. Device in Sydney, clock
// fixed at 12:00 on Wed 18 Nov 2026, four zones that share no hours seeded (so
// the no-overlap message shows), install hint dismissed.

import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, setRootFontSize } from './helpers.js';

/** Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-11-18T01:00:00Z');
const HOME = 'Australia/Sydney';
const ZONES = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'America/Los_Angeles'];
const NAMES = ['New_York', 'London', 'Kolkata', 'Los_Angeles'];
const PHONE = { width: 390, height: 844 };
const SMALL = { width: 320, height: 568 };
const DESKTOP = { width: 1440, height: 900 };
const LANDSCAPE = { width: 844, height: 390 };

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

/**
 * Seed four zones that share hours with Sydney, so the no-overlap message stays
 * empty and the layout checks measure the grid alone; the grid limit tests run
 * once with it and once with the default zones, where the message shows. Runs
 * after the default seed above and replaces its zones.
 * @param {import('@playwright/test').Page} page
 */
async function seedOverlap(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('overlap')) return;
    sessionStorage.setItem('overlap', '1');
    const state = JSON.parse(localStorage.getItem('tzoverlap.state') ?? '{}');
    state.zones = ['Asia/Tokyo', 'Asia/Singapore', 'Pacific/Auckland', 'Australia/Brisbane'].map(
      (tz, i) => ({ id: `z${i}`, kind: 'iana', tz, label: tz.split('/')[1] }),
    );
    localStorage.setItem('tzoverlap.state', JSON.stringify(state));
  });
}

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

/** @param {Page} page */
const region = (page) => page.getByRole('region', { name: 'Timelines' });

/** @param {Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {Page} page @param {string} zone */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {Page} page */
const legend = (page) => page.getByRole('list', { name: 'Legend' });

/** @param {Page} page */
const editButton = (page) => page.getByRole('button', { name: 'Edit time zones', exact: true });

/** @param {Page} page */
const doneButton = (page) =>
  page.getByRole('button', { name: 'Done editing time zones', exact: true });

/** @param {Page} page */
const message = (page) => page.locator('.no-overlap');

/** @param {Page} page */
const nextDay = (page) => page.getByRole('button', { name: 'Show next day that works' });

/** @param {Page} page */
const dateInput = (page) => page.locator('.toolbar input[type="date"]');

/** @param {Page} page */
const handles = (page) => page.locator('.grid__handle');

/** @param {Page} page */
const details = (page) => page.getByRole('group', { name: 'Time zone details' });

/** @param {Locator} locator */
async function box(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/** @param {Page} page */
const noSidewaysScroll = (page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
  );

/**
 * Every visible button in the Timelines region is at least 44×44 px.
 * @param {Page} page
 */
async function expectBigButtons(page) {
  const sizes = await region(page).evaluate((el) =>
    [...el.querySelectorAll('button')]
      .filter((c) => c.getClientRects().length > 0)
      .map((c) => {
        const { width, height } = c.getBoundingClientRect();
        return { name: c.getAttribute('aria-label') || c.textContent?.trim(), width, height };
      }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) {
    expect(s.width, `${s.name} width`).toBeGreaterThanOrEqual(44);
    expect(s.height, `${s.name} height`).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Both seeds for the grid limit tests: zones that share hours (no message), and
 * the default zones, which share none (the message shows beside Edit).
 * @type {{ name: string, seed: (page: Page) => Promise<void>, expectMessage: (page: Page) => Promise<void> }[]}
 */
const SEEDS = [
  {
    name: 'shared hours',
    seed: seedOverlap,
    expectMessage: async (page) => {
      await expect(message(page)).toBeEmpty();
    },
  },
  {
    name: 'no overlap',
    seed: async () => {},
    expectMessage: async (page) => {
      await expect(message(page)).toContainText('No time works for everyone today');
      await expect(nextDay(page)).toBeVisible();
    },
  },
];

/**
 * The no-overlap message and its button sit on Edit's line, left of it, above
 * the grid; the button gives way to the none-found line and focuses the grid.
 * @param {Page} page
 */
async function expectMessageBesideEdit(page) {
  await page.goto('/');
  await expect(message(page)).toContainText('No time works for everyone today');
  await expect(nextDay(page)).toBeVisible();
  const bar = await box(page.locator('header.shell__header'));
  const g = await box(grid(page));
  const b = await box(nextDay(page));
  expect(b.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(b.y + b.height).toBeLessThanOrEqual(g.y);
  const m = await box(message(page));
  const e = await box(editButton(page));
  expect(m.y).toBeLessThan(e.y + e.height);
  expect(e.y).toBeLessThan(m.y + m.height);
  expect(m.x + m.width).toBeLessThan(e.x);

  const date = await dateInput(page).inputValue();
  await nextDay(page).click();
  await expect(message(page)).toContainText(
    'No time works for everyone in the next 14 days either.',
  );
  await expect(nextDay(page)).toHaveCount(0);
  await expect(dateInput(page)).toHaveValue(date);
  await expect(grid(page)).toBeFocused();
  expect(await noSidewaysScroll(page)).toBe(true);
}

/**
 * At 200% text the message takes its own line above Edit, spanning the grid's width.
 * @param {Page} page
 */
async function expectMessageAboveEdit(page) {
  await page.goto('/');
  await setRootFontSize(page, '200%');
  await expect(nextDay(page)).toBeVisible();
  const m = await box(message(page));
  const e = await box(editButton(page));
  const g = await box(grid(page));
  expect(m.y + m.height).toBeLessThanOrEqual(e.y);
  expect(Math.abs(m.x - g.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.x + m.width - (g.x + g.width))).toBeLessThanOrEqual(1);
  expect(e.y + e.height).toBeLessThanOrEqual(g.y);
  expect((await box(nextDay(page))).height).toBeGreaterThanOrEqual(44);
  expect(await noSidewaysScroll(page)).toBe(true);
}

test.describe('phone, 390×844', () => {
  for (const { name, seed, expectMessage } of SEEDS) {
    test(`AC-1, AC-2: six hour columns beside the header; the home row near the top (${name})`, async ({
      page,
    }) => {
      await seed(page);
      await page.goto('/');
      const home = row(page, HOME);
      await expect(home).toBeVisible();
      await expectMessage(page);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const g = await box(grid(page));
      const header = await box(home.locator('[role="rowheader"]'));
      expect(g.width - header.width).toBeGreaterThanOrEqual(PHONE.width * 0.45);
      const shown = await grid(page).evaluate((root, zone) => {
        const rect = root.getBoundingClientRect();
        const inner = rect.left + root.clientLeft + root.clientWidth;
        const head = /** @type {Element} */ (
          root.querySelector(`[role="row"][data-zone="${zone}"] [role="rowheader"]`)
        ).getBoundingClientRect();
        return [...root.querySelectorAll(`[role="row"][data-zone="${zone}"] [role="gridcell"]`)]
          .map((cell) => cell.getBoundingClientRect())
          .filter((r) => r.right > head.right && r.left < inner).length;
      }, HOME);
      expect(shown).toBeGreaterThanOrEqual(6);
      expect((await box(home)).y).toBeLessThanOrEqual(120);
    });
  }

  test("TZO-36: the no-overlap message and its button share Edit's line", async ({ page }) => {
    await expectMessageBesideEdit(page);
  });

  test('TZO-36: at 200% text the message takes its own line above Edit', async ({ page }) => {
    await expectMessageAboveEdit(page);
  });

  test('AC-6: the region has no card look; the heading is hidden but names it', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(region(page)).toHaveCount(1);
    const style = await region(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        border: s.borderTopWidth,
        shadow: s.boxShadow,
        padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
        background: s.backgroundColor,
      };
    });
    expect(style.border).toBe('0px');
    expect(style.shadow).toBe('none');
    expect(style.padding).toEqual(['0px', '0px', '0px', '0px']);
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
    const mainLeft = await page
      .locator('.shell__main')
      .evaluate(
        (el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft),
      );
    expect(mainLeft).toBe(16);
    expect(Math.abs((await box(grid(page))).x - mainLeft)).toBeLessThanOrEqual(1);
    expect((await box(grid(page))).width).toBeCloseTo(358, 0);
    const heading = region(page).getByRole('heading', { name: 'Timelines' });
    const h = await box(heading);
    expect(h.width).toBeLessThanOrEqual(1);
    expect(h.height).toBeLessThanOrEqual(1);
  });

  test('AC-7, AC-8: the legend follows the grid on one line; Edit sits above it, right-aligned', async ({
    page,
  }) => {
    await page.goto('/');
    const g = await box(grid(page));
    const l = await box(legend(page));
    expect(l.y).toBeGreaterThanOrEqual(g.y + g.height);
    expect(l.height).toBeLessThanOrEqual(32);
    const tops = await legend(page)
      .locator('.legend__item')
      .evaluateAll((items) => items.map((el) => el.getBoundingClientRect().top));
    expect(tops.length).toBeGreaterThan(1);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);

    for (const button of [editButton(page), doneButton(page)]) {
      const e = await box(button);
      expect(Math.abs(e.x + e.width - (g.x + g.width))).toBeLessThanOrEqual(1);
      expect(e.y + e.height).toBeLessThanOrEqual(g.y);
      await button.click();
    }
  });

  test('AC-9: handles show only in Edit mode and are no tab stop outside it', async ({ page }) => {
    await page.goto('/');
    await expect(handles(page)).toHaveCount(4);
    await expect(page.locator('.grid__handle:visible')).toHaveCount(0);
    const first = row(page, ZONES[0] ?? '').locator('.grid__trigger:visible');
    await first.focus();
    for (let i = 0; i < ZONES.length; i++) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => document.activeElement?.classList.contains('grid__handle')),
      ).toBe(false);
    }

    await editButton(page).click();
    for (const [i, zone] of ZONES.entries()) {
      const handle = row(page, zone).getByRole('button', { name: `Reorder ${NAMES[i]}` });
      await expect(handle).toBeVisible();
      const h = await box(handle);
      const header = await box(row(page, zone).locator('[role="rowheader"]'));
      expect(h.width).toBeGreaterThanOrEqual(44);
      expect(h.height).toBeGreaterThanOrEqual(44);
      expect(h.x).toBeGreaterThanOrEqual(header.x - 0.5);
      expect(h.x + h.width).toBeLessThanOrEqual(header.x + header.width + 0.5);
      expect(h.y).toBeGreaterThanOrEqual(header.y - 0.5);
      expect(h.y + h.height).toBeLessThanOrEqual(header.y + header.height + 0.5);
    }

    await doneButton(page).click();
    await expect(page.locator('.grid__handle:visible')).toHaveCount(0);
  });

  test('AC-11: 112 px headers; Delete and the handle fit inside them in Edit mode', async ({
    page,
  }) => {
    await page.goto('/');
    const widths = await page
      .locator('[role="rowheader"]')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(widths).toHaveLength(6);
    for (const width of widths) expect(Math.abs(width - 112)).toBeLessThanOrEqual(2);

    await editButton(page).click();
    for (const zone of ZONES) {
      const header = await box(row(page, zone).locator('[role="rowheader"]'));
      for (const part of ['.grid__delete', '.grid__handle']) {
        const b = await box(row(page, zone).locator(part));
        expect(b.x).toBeGreaterThanOrEqual(header.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(header.x + header.width + 0.5);
        expect(b.y).toBeGreaterThanOrEqual(header.y - 0.5);
        expect(b.y + b.height).toBeLessThanOrEqual(header.y + header.height + 0.5);
      }
    }
  });

  test('AC-18: Esc out of Edit mode with a handle focused focuses the Edit button', async ({
    page,
  }) => {
    await page.goto('/');
    await editButton(page).click();
    const handle = row(page, ZONES[0] ?? '').getByRole('button', { name: `Reorder ${NAMES[0]}` });
    await handle.focus();
    await page.keyboard.press('Escape');
    await expect(editButton(page)).toBeVisible();
    await expect(page.locator('.grid__handle:visible')).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
  });
});

test('AC-18: at 1440×900 Esc out of Edit mode leaves focus on the handle', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await editButton(page).click();
  const handle = row(page, ZONES[0] ?? '').getByRole('button', { name: `Reorder ${NAMES[0]}` });
  await handle.focus();
  await page.keyboard.press('Escape');
  await expect(editButton(page)).toBeVisible();
  await expect(handle).toBeVisible();
  await expect(handle).toBeFocused();
});

test.describe('320×568', () => {
  test.use({ viewport: SMALL });

  for (const { name, seed, expectMessage } of SEEDS) {
    test(`AC-3, AC-4: 300 px of grid between the bars; Edit on one line (${name})`, async ({
      page,
    }) => {
      await seed(page);
      await page.goto('/');
      await expect(row(page, HOME)).toBeVisible();
      await expectMessage(page);
      const g = await box(grid(page));
      const bar = await box(page.locator('header.shell__header'));
      const toolbar = await box(page.getByRole('group', { name: 'Toolbar' }));
      const shown = Math.min(g.y + g.height, toolbar.y) - Math.max(g.y, bar.y + bar.height);
      expect(shown).toBeGreaterThanOrEqual(300);
      const e = await box(editButton(page));
      expect(e.height).toBeLessThanOrEqual(44);
      expect(e.height).toBeGreaterThanOrEqual(44);
      expect(e.width).toBeGreaterThanOrEqual(44);
    });
  }

  test("TZO-36: the no-overlap message and its button share Edit's line", async ({ page }) => {
    await expectMessageBesideEdit(page);
  });

  test('TZO-36: at 200% text the message takes its own line above Edit', async ({ page }) => {
    await expectMessageAboveEdit(page);
  });
});

for (const viewport of [SMALL, PHONE]) {
  test(`AC-5, AC-14: ${viewport.width}px, no sideways scroll and 44 px buttons, in and out of Edit mode`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(row(page, HOME)).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    await expectBigButtons(page);
    await editButton(page).click();
    await expect(page.locator('.grid__handle:visible')).toHaveCount(4);
    expect(await noSidewaysScroll(page)).toBe(true);
    await expectBigButtons(page);
  });
}

test('the legend wraps rather than widening the page at 320 px, 200% text', async ({ page }) => {
  await page.setViewportSize(SMALL);
  await page.goto('/');
  await setRootFontSize(page, '200%');
  const l = await box(legend(page));
  const g = await box(grid(page));
  expect(l.y).toBeGreaterThanOrEqual(g.y + g.height);
  expect(l.x + l.width).toBeLessThanOrEqual(SMALL.width - 8);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('AC-12: 1440×900 keeps the card look, the heading, the legend above and the handles', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const style = await region(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      border: s.borderTopWidth,
      shadow: s.boxShadow,
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
    };
  });
  expect(style.border).toBe('1px');
  expect(style.shadow).not.toBe('none');
  expect(style.padding).toEqual(['24px', '24px', '24px', '24px']);
  await expect(region(page).getByRole('heading', { level: 2, name: 'Timelines' })).toBeVisible();
  await expect(page.locator('.card__header').getByRole('list', { name: 'Legend' })).toBeVisible();
  const l = await box(legend(page));
  expect(l.y + l.height).toBeLessThanOrEqual((await box(grid(page))).y);
  await expect(page.locator('.grid__handle:visible')).toHaveCount(4);
  const widths = await page
    .locator('[role="rowheader"]')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  for (const width of widths) expect(Math.abs(width - 220)).toBeLessThanOrEqual(2);
});

test('TZO-36: at 1440×900 the no-overlap message keeps its box between the header and the grid', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await expect(message(page)).toContainText('No time works for everyone today');
  const m = await box(message(page));
  const header = await box(region(page).locator('.card__header'));
  expect(m.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(m.y + m.height).toBeLessThanOrEqual((await box(grid(page))).y);
  const style = await message(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopWidth, background: s.backgroundColor };
  });
  expect(style.border).toBe('1px');
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
});

test.describe('landscape, 844×390', () => {
  test.use({ viewport: LANDSCAPE });

  test('AC-13: all four handles show outside Edit mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.grid__handle:visible')).toHaveCount(4);
  });

  test('AC-19: rotating to portrait closes a handle popover and focuses the trigger', async ({
    page,
  }) => {
    await page.goto('/');
    const first = row(page, ZONES[0] ?? '');
    await first.getByRole('button', { name: `Reorder ${NAMES[0]}` }).click();
    await expect(details(page)).toBeVisible();
    await page.setViewportSize(PHONE);
    await expect(page.locator(':popover-open')).toHaveCount(0);
    await expect(first.locator('.grid__trigger:not(.grid__trigger--wide)')).toBeFocused();
  });

  test('AC-19: rotating to portrait moves focus from a handle to the trigger', async ({ page }) => {
    await page.goto('/');
    const first = row(page, ZONES[0] ?? '');
    await first.getByRole('button', { name: `Reorder ${NAMES[0]}` }).focus();
    await page.setViewportSize(PHONE);
    await expect(first.locator('.grid__handle')).toBeHidden();
    await expect(first.locator('.grid__trigger:not(.grid__trigger--wide)')).toBeFocused();
  });
});

for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`AC-15: axe, ${colorScheme}`, () => {
    test.use({ colorScheme });

    for (const viewport of [SMALL, PHONE, DESKTOP]) {
      test(`passes at ${viewport.width}×${viewport.height}, Edit mode off and on`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto('/');
        await expect(row(page, HOME)).toBeVisible();
        await expectNoA11yViolations(page);
        await editButton(page).click();
        await expect(page.locator('.grid__handle:visible')).toHaveCount(4);
        await expectNoA11yViolations(page);
      });
    }
  });
}
