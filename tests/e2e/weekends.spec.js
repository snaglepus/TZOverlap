// E2E: midnight dividers, weekend shading and the "Treat weekends as
// unavailable" setting (TZO-15, PRD T9).

import { expect, test } from '@playwright/test';
import { NOW, addZone, chooseAppearance, expectNoA11yViolations, openSettings } from './helpers.js';

/** Saturday 13 June 2026, 12:00 in London: the window is Fri 12 to Sun 14. */
const SATURDAY = new Date('2026-06-13T11:00:00Z');
/** 10:00 London on Sunday 14 June. */
const SUNDAY_TEN = '2026-06-14T09:00:00.000Z';
const SWITCH = 'Treat weekends as unavailable';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/**
 * Seed `tzoverlap.state` with `zones` before the first load only.
 * @param {import('@playwright/test').Page} page
 * @param {object[]} zones
 */
async function seedZones(page, zones) {
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'tzoverlap.state',
      JSON.stringify({
        version: 1,
        zones: list,
        settings: {
          hourCycle: 'auto',
          theme: 'system',
          filter: 'all',
          weekendsUnavailable: true,
          defaultDuration: 60,
        },
        meta: { installHintDismissed: false, lastHomeTz: null },
      }),
    );
  }, zones);
}

/**
 * Each cell's data-start and data-weekend, grouped by the cell's local date
 * in `tz` ("12", "13", ...).
 * @param {import('@playwright/test').Locator} rowLocator
 * @param {string} tz
 */
async function weekendByDay(rowLocator, tz) {
  const cells = await rowLocator
    .getByRole('gridcell')
    .evaluateAll((els) =>
      els.map((el) => [el.getAttribute('data-start'), el.getAttribute('data-weekend')]),
    );
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit' });
  /** @type {Record<string, Set<string | null>>} */
  const out = {};
  for (const [start, weekend] of cells) {
    const key = day.format(new Date(/** @type {string} */ (start)));
    (out[key] ??= new Set()).add(weekend ?? null);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

/**
 * The Everyone segments as [start, end) instants, each ending where the next begins.
 * @param {import('@playwright/test').Page} page
 */
async function segments(page) {
  const list = await row(page, 'everyone')
    .getByRole('gridcell')
    .evaluateAll((els) =>
      els.map((el) => ({
        start: Date.parse(/** @type {string} */ (el.getAttribute('data-start'))),
        rating: el.getAttribute('data-rating'),
      })),
    );
  // The window ends at Wed 17 June 00:00 BST.
  const end = Date.parse('2026-06-16T23:00:00Z');
  return list.map((seg, i) => ({ ...seg, end: list[i + 1]?.start ?? end }));
}

/**
 * The rating of the Everyone segment covering `iso`.
 * @param {import('@playwright/test').Page} page
 * @param {string} iso
 */
async function everyoneAt(page, iso) {
  const t = Date.parse(iso);
  return (await segments(page)).find((seg) => seg.start <= t && t < seg.end)?.rating;
}

test.describe('midnight dividers', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  test('label each local midnight, half a column off for Kolkata', async ({ page }) => {
    await page.goto('/');
    await addZone(page, 'Asia/Kolkata');
    const london = row(page, 'Europe/London');
    const kolkata = row(page, 'Asia/Kolkata');
    await expect(kolkata).toBeVisible();

    /** @param {import('@playwright/test').Locator} r */
    const dividers = (r) =>
      r
        .locator('.grid__divider')
        .evaluateAll((els) =>
          els.map((el) => [el.getAttribute('data-start'), el.textContent, el.getAttribute('role')]),
        );
    expect(await dividers(london)).toEqual([
      ['2026-06-13T23:00:00.000Z', 'Sun 14', null],
      ['2026-06-14T23:00:00.000Z', 'Mon 15', null],
      ['2026-06-15T23:00:00.000Z', 'Tue 16', null],
    ]);
    expect(await dividers(kolkata)).toEqual([
      ['2026-06-14T18:30:00.000Z', 'Mon 15', null],
      ['2026-06-15T18:30:00.000Z', 'Tue 16', null],
      ['2026-06-16T18:30:00.000Z', 'Wed 17', null],
    ]);
    await expect(london.locator('.grid__divider').first()).toHaveAttribute('aria-hidden', 'true');
    await expect(row(page, 'everyone').locator('.grid__divider')).toHaveCount(0);

    const box = async (/** @type {import('@playwright/test').Locator} */ el) =>
      /** @type {{ x: number, width: number }} */ (await el.boundingBox());
    const slot = (await box(london.getByRole('gridcell').first())).width;
    const londonMon = await box(
      london.locator('[data-start="2026-06-14T23:00:00.000Z"].grid__divider'),
    );
    const kolkataMon = await box(
      kolkata.locator('[data-start="2026-06-14T18:30:00.000Z"].grid__divider'),
    );
    expect(Math.abs(londonMon.x - kolkataMon.x - 4.5 * slot)).toBeLessThanOrEqual(1);

    // The hidden divider's date is in the day's first cell name.
    await expect(
      london.locator('[role="gridcell"][data-start="2026-06-14T23:00:00.000Z"]'),
    ).toHaveAttribute('aria-label', /Mon 15/);
  });

  test('stay under the sticky row header when the grid scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    const grid = page.getByRole('grid');
    await grid.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const header = row(page, 'Europe/London').getByRole('rowheader');
    const hb = /** @type {{ x: number, y: number, width: number, height: number }} */ (
      await header.boundingBox()
    );
    // The element on top in the middle of the header is part of the header.
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="rowheader"]') !== null,
      { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 },
    );
    expect(onTop).toBe(true);
  });
});

test.describe('weekend cells at a Saturday clock', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(SATURDAY);
  });

  test('Riyadh shades Fri-Sat, London Sat-Sun (PRD T9)', async ({ page }) => {
    await seedZones(page, [
      { id: 'r', kind: 'iana', tz: 'Asia/Riyadh', country: 'SA', label: 'Riyadh' },
    ]);
    await page.goto('/');
    const riyadh = row(page, 'Asia/Riyadh');
    await expect(riyadh).toBeVisible();

    const ksa = await weekendByDay(riyadh, 'Asia/Riyadh');
    expect(ksa['12']).toEqual(['true']);
    expect(ksa['13']).toEqual(['true']);
    expect(ksa['14']).toEqual([null]);

    const london = await weekendByDay(row(page, 'Europe/London'), 'Europe/London');
    expect(london).toEqual({ 12: [null], 13: ['true'], 14: ['true'] });

    await expect(riyadh.locator('[data-weekend="true"]').first()).toHaveAttribute(
      'aria-label',
      /, weekend$/,
    );
    await expect(
      riyadh.locator('[role="gridcell"]:not([data-weekend])').first(),
    ).not.toHaveAttribute('aria-label', /weekend/);
  });

  test('a fixed-offset row uses Sat-Sun', async ({ page }) => {
    await seedZones(page, [{ id: 'f', kind: 'fixed', minutes: 180, country: 'SA', label: 'Ops' }]);
    await page.goto('/');
    const ops = row(page, 'fixed:180');
    await expect(ops).toBeVisible();
    const days = await weekendByDay(ops, 'Etc/GMT-3');
    expect(days['12']).toEqual([null]);
    expect(days['13']).toEqual(['true']);
    expect(days['14']).toEqual(['true']);
  });
});

test.describe('treat weekends as unavailable', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  test('on by default: Sunday is Unsuitable for everyone', async ({ page }) => {
    await page.goto('/');
    const sunStart = Date.parse('2026-06-13T23:00:00Z');
    const sunEnd = Date.parse('2026-06-14T23:00:00Z');
    const sunday = (await segments(page)).filter((s) => s.start < sunEnd && s.end > sunStart);
    expect(sunday.length).toBeGreaterThan(0);
    expect(sunday.map((s) => s.rating)).toEqual(sunday.map(() => 'unsuitable'));

    const cell = row(page, 'Europe/London').locator(`[data-start="${SUNDAY_TEN}"]`);
    await expect(cell).toHaveAttribute('data-rating', 'unsuitable');
    await expect(cell).toHaveAttribute('data-weekend', 'true');
  });

  test('off: weekend hours are rated by hour, and the choice persists', async ({ page }) => {
    await page.goto('/');
    const cell = row(page, 'Europe/London').locator(`[data-start="${SUNDAY_TEN}"]`);
    const dialog = await openSettings(page);
    const toggle = dialog.getByRole('switch', { name: SWITCH });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(cell).toHaveAttribute('data-rating', 'best');
    await expect(cell).toHaveAttribute('data-weekend', 'true');
    expect(await everyoneAt(page, SUNDAY_TEN)).toBe('best');

    await page.reload();
    await expect(cell).toHaveAttribute('data-rating', 'best');
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('tzoverlap.state') ?? 'null').settings,
    );
    expect(stored.weekendsUnavailable).toBe(false);
    const again = await openSettings(page);
    await expect(again.getByRole('switch', { name: SWITCH })).not.toBeChecked();
  });

  test('Reset all data turns the setting back on', async ({ page }) => {
    await page.goto('/');
    const dialog = await openSettings(page);
    await dialog.getByRole('switch', { name: SWITCH }).uncheck();
    await dialog.getByRole('button', { name: 'Reset all data' }).click();
    await dialog.getByRole('button', { name: 'Reset everything' }).click();
    await expect(dialog).toBeHidden();
    const reopened = await openSettings(page);
    await expect(reopened.getByRole('switch', { name: SWITCH })).toBeChecked();
    await expect(
      row(page, 'Europe/London').locator(`[data-start="${SUNDAY_TEN}"]`),
    ).toHaveAttribute('data-rating', 'unsuitable');
  });

  test('a change in another tab updates this grid', async ({ page, context }) => {
    await page.goto('/');
    // Wait for this tab's first save, so it can't land after the other tab's change.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('tzoverlap.state')))
      .not.toBeNull();
    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto('/');
    const cell = row(page, 'Europe/London').locator(`[data-start="${SUNDAY_TEN}"]`);
    await expect(cell).toHaveAttribute('data-rating', 'unsuitable');

    const dialog = await openSettings(other);
    await dialog.getByRole('switch', { name: SWITCH }).uncheck();
    await expect(cell).toHaveAttribute('data-rating', 'best');
  });

  test('the weekend band is the non-colour cue', async ({ page }) => {
    await page.goto('/');
    const london = row(page, 'Europe/London');
    const style = (/** @type {string} */ iso) =>
      london.locator(`[data-start="${iso}"]`).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { shadow: cs.boxShadow, background: cs.backgroundColor };
      });
    // Sunday 10:00 and Monday 10:00 are both Unsuitable here: Sunday by the weekend
    // rule, Monday 03:00 by the hour.
    const weekend = await style(SUNDAY_TEN);
    const weekday = await style('2026-06-15T02:00:00.000Z');
    expect(weekend.shadow).not.toBe('none');
    expect(weekday.shadow).toBe('none');

    const token = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.setProperty('background-color', 'var(--color-weekend)');
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    expect(weekend.background).toBe(token);
    expect(weekday.background).not.toBe(token);
  });

  for (const theme of /** @type {const} */ (['Light', 'Dark'])) {
    test(`weekend cells, dividers and the switch pass axe in ${theme}`, async ({ page }) => {
      await page.goto('/');
      await addZone(page, 'Asia/Kolkata');
      await expect(row(page, 'Asia/Kolkata')).toBeVisible();
      await chooseAppearance(page, theme);
      await expect(page.locator('[data-weekend="true"]').first()).toBeVisible();
      await expectNoA11yViolations(page);
      const dialog = await openSettings(page);
      await expect(dialog.getByRole('switch', { name: SWITCH })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});
