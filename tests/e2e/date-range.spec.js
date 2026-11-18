// E2E: the anchor date, lazy range extension, the date control and the Today
// button (TZO-11). Device in Sydney, clock fixed at 12:00 on Wed 18 Nov 2026.

import { expect, test } from '@playwright/test';
import { addZone, expectNoA11yViolations } from './helpers.js';

/** Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-11-18T01:00:00Z');
const HOME = 'Australia/Sydney';

test.use({ timezoneId: HOME, viewport: { width: 1280, height: 720 } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SYDNEY_NOON);
});

/**
 * Seed `tzoverlap.state` with these IANA zones before the first load only.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} tzs
 */
async function seedZones(page, tzs) {
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
        meta: { installHintDismissed: false, lastHomeTz: null },
      }),
    );
  }, tzs);
}

/** @param {import('@playwright/test').Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {import('@playwright/test').Page} page */
const dateInput = (page) => page.locator('.toolbar input[type="date"]');

/** @param {import('@playwright/test').Page} page */
const dateLabel = (page) => page.locator('.toolbar .date-field label');

/** @param {import('@playwright/test').Page} page */
const todayButton = (page) => page.getByRole('button', { name: 'Today', exact: true });

/**
 * data-start of every home cell.
 * @param {import('@playwright/test').Page} page
 * @param {string} [zone]
 */
const starts = (page, zone = HOME) =>
  row(page, zone)
    .getByRole('gridcell')
    .evaluateAll((els) => els.map((el) => /** @type {string} */ (el.getAttribute('data-start'))));

/** @param {import('@playwright/test').Page} page */
const homeCount = (page) => row(page, HOME).getByRole('gridcell').count();

/**
 * The cell under a fixed point (the middle of the visible track area, in the
 * given row) and its left edge, optionally after setting scrollLeft in the same task.
 * @param {import('@playwright/test').Page} page
 * @param {string} zone
 * @param {number | 'end'} [scrollTo]
 */
const probe = (page, zone, scrollTo) =>
  page.evaluate(([zone, scrollTo]) => {
    const el = /** @type {HTMLElement} */ (document.querySelector('[role="grid"]'));
    if (scrollTo !== undefined) el.scrollLeft = scrollTo === 'end' ? el.scrollWidth : scrollTo;
    const box = el.getBoundingClientRect();
    const header = /** @type {Element} */ (el.querySelector('.grid__header'));
    const headerRight = box.left + header.getBoundingClientRect().width;
    const target = /** @type {Element} */ (el.querySelector(`[data-zone="${zone}"]`));
    const rowBox = target.getBoundingClientRect();
    const x = (headerRight + box.right) / 2;
    // Skip midnight dividers and day labels drawn over the cells.
    const cell = document
      .elementsFromPoint(x, rowBox.top + rowBox.height / 2)
      .find((e) => e.getAttribute('role') === 'gridcell');
    return {
      start: cell?.getAttribute('data-start') ?? null,
      left: cell?.getBoundingClientRect().left ?? NaN,
      scrollLeft: el.scrollLeft,
    };
  }, /** @type {const} */ ([zone, scrollTo]));

/**
 * Whether the home cell starting at `iso` lies entirely within the visible track area.
 * @param {import('@playwright/test').Page} page
 * @param {string} iso
 */
const inVisibleTrack = (page, iso) =>
  page.evaluate((iso) => {
    const el = /** @type {HTMLElement} */ (document.querySelector('[role="grid"]'));
    const box = el.getBoundingClientRect();
    const header = /** @type {Element} */ (el.querySelector('.grid__header'));
    const cell = el.querySelector(
      `[role="row"]:first-child [role="gridcell"][data-start="${iso}"]`,
    );
    if (!cell) return false;
    const r = cell.getBoundingClientRect();
    return r.left >= box.left + header.getBoundingClientRect().width && r.right <= box.right;
  }, iso);

/** @param {import('@playwright/test').Page} page @param {string} value */
async function pickDate(page, value) {
  await dateInput(page).fill(value);
  await expect(dateInput(page)).toHaveValue(value);
}

/**
 * Scroll to one end until that side stops extending, waiting for each day.
 * @param {import('@playwright/test').Page} page
 * @param {'start' | 'end'} side
 */
async function extendToCap(page, side) {
  for (;;) {
    const n = await homeCount(page);
    await probe(page, HOME, side === 'end' ? 'end' : 0);
    try {
      await expect.poll(() => homeCount(page), { timeout: 1000 }).toBeGreaterThan(n);
    } catch {
      return;
    }
  }
}

test('load: three days around now, now in view, label Today, Today button hidden', async ({
  page,
}) => {
  await page.goto('/');
  const homeStarts = await starts(page);
  expect(homeStarts).toHaveLength(72);
  expect(homeStarts[0]).toBe('2026-11-16T13:00:00.000Z');
  expect(homeStarts.at(-1)).toBe('2026-11-19T12:00:00.000Z');
  expect(await inVisibleTrack(page, '2026-11-18T01:00:00.000Z')).toBe(true);
  await expect(page.getByLabel('Today', { exact: true })).toHaveValue('2026-11-18');
  await expect(page.getByLabel('Today', { exact: true })).toHaveAttribute('min', '1980-01-01');
  await expect(page.getByLabel('Today', { exact: true })).toHaveAttribute('max', '2099-12-31');
  await expect(todayButton(page)).toBeHidden();
});

test('right extension: a day per scroll, nothing moves, stops 14 days after', async ({ page }) => {
  test.setTimeout(30_000);
  await seedZones(page, ['Europe/London']);
  await page.goto('/');
  for (let after = 1; after < 14; after++) {
    const n = await homeCount(page);
    const before = await probe(page, 'Europe/London', 'end');
    await expect.poll(() => homeCount(page)).toBe(n + 24);
    const now = await probe(page, 'Europe/London');
    expect(now.start).toMatch(/^2026-/);
    expect(now.start).toBe(before.start);
    expect(now.scrollLeft).toBe(before.scrollLeft);
  }
  expect((await starts(page)).at(-1)).toBe('2026-12-02T12:00:00.000Z');
  const n = await homeCount(page);
  await probe(page, 'Europe/London', 'end');
  await page.waitForTimeout(500);
  expect(await homeCount(page)).toBe(n);
  expect((await starts(page)).at(-1)).toBe('2026-12-02T12:00:00.000Z');
});

test('left extension: scrollLeft grows by the new day, nothing moves, stops 14 days before', async ({
  page,
}) => {
  test.setTimeout(30_000);
  await seedZones(page, ['Europe/London']);
  await page.goto('/');
  await grid(page).focus();
  for (let before = 1; before < 14; before++) {
    const n = await homeCount(page);
    const was = await probe(page, 'Europe/London', 0);
    await expect.poll(() => homeCount(page)).toBe(n + 24);
    const now = await probe(page, 'Europe/London');
    expect(now.start).toMatch(/^2026-/);
    expect(now.start).toBe(was.start);
    expect(Math.abs(now.left - was.left)).toBeLessThanOrEqual(1);
    expect(now.scrollLeft).toBeGreaterThan(was.scrollLeft);
  }
  expect((await starts(page))[0]).toBe('2026-11-03T13:00:00.000Z');
  const n = await homeCount(page);
  await probe(page, 'Europe/London', 0);
  await page.waitForTimeout(500);
  expect(await homeCount(page)).toBe(n);
  await expect(grid(page)).toBeFocused();
});

test('date pick: the window moves to that date, with its rules (FR-32)', async ({ page }) => {
  await seedZones(page, ['Europe/London']);
  await page.goto('/');
  await pickDate(page, '2026-07-15');
  const home = row(page, HOME);
  await expect(
    home.locator('[role="gridcell"][data-start="2026-07-14T14:00:00.000Z"]'),
  ).toHaveCount(1);
  await expect(
    row(page, 'Europe/London').locator('[role="gridcell"][data-start="2026-07-15T08:00:00.000Z"]'),
  ).toHaveText('09');
  await expect(row(page, 'Europe/London').getByRole('rowheader')).toContainText('UTC+1');
  await expect(home.getByRole('rowheader')).toContainText('UTC+10');
  await expect(home.locator('.grid__details .grid__time')).toHaveText('12:00');
  const all = await page
    .locator('[role="grid"] [role="row"]:not([data-zone="everyone"]) [role="gridcell"][data-start]')
    .evaluateAll((els) => els.map((el) => /** @type {string} */ (el.getAttribute('data-start'))));
  expect((await starts(page))[0]).toBe('2026-07-13T14:00:00.000Z');
  expect(all.every((start) => start >= '2026-07-13T14:00:00.000Z')).toBe(true);
  expect(await inVisibleTrack(page, '2026-07-14T14:00:00.000Z')).toBe(true);
});

test('control and Today button: label Date away from today, Today brings it back', async ({
  page,
}) => {
  await page.clock.install({ time: SYDNEY_NOON });
  await seedZones(page, ['Europe/London']);
  await page.goto('/');
  await pickDate(page, '2026-07-15');
  await expect(dateLabel(page)).toHaveText('Date');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-07-15');
  await expect(todayButton(page)).toBeVisible();
  const london = row(page, 'Europe/London').getByRole('rowheader');
  await expect(london).toContainText('UTC+1');
  await page.clock.runFor(60_000);
  await expect(row(page, HOME).locator('.grid__details .grid__time')).toHaveText('12:01');
  await expect(london).toContainText('UTC+1');

  await todayButton(page).click();
  await expect(dateInput(page)).toHaveValue('2026-11-18');
  await expect(dateLabel(page)).toHaveText('Today');
  await expect(todayButton(page)).toBeHidden();
  await expect(dateInput(page)).toBeFocused();
  await expect(london).toContainText('UTC+0');
  expect(await inVisibleTrack(page, '2026-11-18T01:00:00.000Z')).toBe(true);
});

test('invalid input: clearing the date changes nothing, blur restores it', async ({ page }) => {
  await page.goto('/');
  const before = await starts(page);
  const scroll = await grid(page).evaluate((el) => el.scrollLeft);
  await dateInput(page).fill('');
  await expect(dateInput(page)).toHaveValue('');
  expect(await starts(page)).toEqual(before);
  await dateInput(page).blur();
  await expect(dateInput(page)).toHaveValue('2026-11-18');
  expect(await starts(page)).toEqual(before);
  expect(await grid(page).evaluate((el) => el.scrollLeft)).toBe(scroll);
});

test('bounded DOM: seven zones at the 29-day cap, back under 1,100 after a pick', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedZones(page, [
    'Asia/Kolkata',
    'Asia/Tokyo',
    'America/New_York',
    'Europe/London',
    'Asia/Kathmandu',
    'America/Los_Angeles',
    'Europe/Berlin',
  ]);
  await page.goto('/');
  await expect(grid(page).getByRole('row')).toHaveCount(9);
  await extendToCap(page, 'end');
  await extendToCap(page, 'start');
  const rows = await page.locator('[role="grid"] [role="row"]').evaluateAll((els) =>
    els.map((el) => {
      const s = [...el.querySelectorAll('[role="gridcell"][data-start]')].map((c) =>
        c.getAttribute('data-start'),
      );
      return { zone: el.getAttribute('data-zone'), count: s.length, unique: new Set(s).size };
    }),
  );
  for (const r of rows) expect(r.unique, /** @type {string} */ (r.zone)).toBe(r.count);
  expect(await homeCount(page)).toBe(29 * 24);
  const count = () => grid(page).evaluate((el) => el.querySelectorAll('*').length);
  expect(await count()).toBeLessThanOrEqual(9000);
  await pickDate(page, '2026-07-15');
  await expect(
    row(page, HOME).locator('[role="gridcell"][data-start="2026-07-14T14:00:00.000Z"]'),
  ).toHaveCount(1);
  expect(await count()).toBeLessThanOrEqual(1100);
});

test('re-render keeps the view: adding a zone keeps the days and the scroll', async ({ page }) => {
  await seedZones(page, ['Europe/London']);
  await page.goto('/');
  const n = await homeCount(page);
  await probe(page, HOME, 'end');
  await expect.poll(() => homeCount(page)).toBe(n + 24);
  const before = await probe(page, HOME);
  await addZone(page, 'Asia/Tokyo');
  await expect(row(page, 'Asia/Tokyo')).toBeVisible();
  expect(await homeCount(page)).toBe(n + 24);
  const after = await probe(page, HOME);
  expect(after.start).toMatch(/^2026-/);
  expect(after.start).toBe(before.start);
  expect(after.scrollLeft).toBe(before.scrollLeft);
});

for (const width of [320, 375]) {
  test(`layout at ${width}px: toolbar controls fit without overlap, on today and another date`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    const controls = () => [
      dateInput(page),
      todayButton(page),
      page.getByRole('button', { name: 'Go to now' }),
      page.getByRole('button', { name: 'Settings' }),
    ];
    for (const date of [null, '2026-07-15']) {
      if (date) {
        await pickDate(page, date);
        await expect(todayButton(page)).toBeVisible();
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      /** @type {{ x: number, y: number, width: number, height: number }[]} */
      const boxes = [];
      for (const control of controls()) {
        if (!(await control.isVisible())) continue;
        const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (
          await control.boundingBox()
        );
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y + box.height).toBeLessThanOrEqual(740);
        boxes.push(box);
      }
      expect(boxes.length).toBe(date ? 4 : 3);
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const apart =
            a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y;
          expect(apart).toBe(true);
        }
      }
      // The native control shows the whole date, not a clipped one.
      expect(await dateInput(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  });
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`accessibility: axe passes on today and on another date in ${scheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seedZones(page, ['Europe/London']);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    await expectNoA11yViolations(page);
    await pickDate(page, '2026-07-15');
    await expect(todayButton(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });
}

test('day rollover: label and Today button follow the date, the grid stays', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T12:58:00Z') }); // 23:58 1 Nov, Sydney
  await seedZones(page, ['America/New_York']);
  await page.goto('/');
  await expect(dateLabel(page)).toHaveText('Today');
  await expect(todayButton(page)).toBeHidden();
  const ny = row(page, 'America/New_York').getByRole('rowheader');
  await expect(ny).toContainText('UTC-5');
  const before = await starts(page);
  await page.clock.runFor(120_000);
  await expect(dateLabel(page)).toHaveText('Date');
  await expect(todayButton(page)).toBeVisible();
  await expect(ny).toContainText('UTC-4');
  const after = await starts(page);
  expect([after[0], after.at(-1)]).toEqual([before[0], before.at(-1)]);
});

test.describe('skipped adjacent date', () => {
  test.use({ timezoneId: 'Pacific/Apia' });

  test('Apia 31 Dec 2011: an extra day before, positioned without extending', async ({ page }) => {
    await page.goto('/');
    await pickDate(page, '2011-12-31');
    const home = 'Pacific/Apia';
    await expect(
      row(page, home).locator('[role="gridcell"][data-start="2011-12-30T10:00:00.000Z"]'),
    ).toHaveCount(1);
    const homeStarts = await starts(page, home);
    expect(homeStarts).toHaveLength(72);
    expect(homeStarts[0]).toBe('2011-12-29T10:00:00.000Z');
    expect(homeStarts.at(-1)).toBe('2012-01-01T09:00:00.000Z');
    // 30 Dec never happened in Apia: no cell between 29 Dec 23:00 (UTC-10) and 31 Dec 00:00 (UTC+14).
    expect(homeStarts).toContain('2011-12-30T09:00:00.000Z');
    expect(homeStarts.indexOf('2011-12-30T10:00:00.000Z')).toBe(
      homeStarts.indexOf('2011-12-30T09:00:00.000Z') + 1,
    );
    expect(await inVisibleTrack(page, '2011-12-30T10:00:00.000Z')).toBe(true);
    expect(await grid(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(await starts(page, home)).toHaveLength(72);
  });

  test('Apia: the skipped date itself is rejected', async ({ page }) => {
    await page.goto('/');
    const before = await starts(page, 'Pacific/Apia');
    await dateInput(page).fill('2011-12-30');
    expect(await starts(page, 'Pacific/Apia')).toEqual(before);
    await dateInput(page).blur();
    await expect(dateInput(page)).not.toHaveValue('2011-12-30');
  });
});

test('now line and Now: hidden on another date, Now goes back to today', async ({ page }) => {
  await page.goto('/');
  const line = page.locator('.grid__now');
  const now = page.getByRole('button', { name: 'Go to now' });
  await expect(line).toBeAttached();
  await expect(line).not.toHaveAttribute('hidden');
  await expect(now).toBeDisabled();

  await pickDate(page, '2026-07-15');
  await expect(line).toHaveAttribute('hidden');
  await expect(now).toBeEnabled();

  await now.click();
  await expect(dateInput(page)).toHaveValue('2026-11-18');
  await expect(dateLabel(page)).toHaveText('Today');
  await expect(todayButton(page)).toBeHidden();
  await expect(line).not.toHaveAttribute('hidden');
  await expect(now).toBeDisabled();
  expect(await inVisibleTrack(page, '2026-11-18T01:00:00.000Z')).toBe(true);
});

test('the now line stays on now when days are added on the left', async ({ page }) => {
  await page.goto('/');
  const lineLeft = () =>
    page.locator('.grid__now').evaluate((el) => el.getBoundingClientRect().left);
  const cellLeft = () =>
    row(page, HOME)
      .locator('[role="gridcell"][data-start="2026-11-18T01:00:00.000Z"]')
      .evaluate((el) => el.getBoundingClientRect().left);
  // The line sits at the start of the 12:00 cell (now is 12:00 exactly).
  expect(Math.abs((await lineLeft()) - (await cellLeft()))).toBeLessThanOrEqual(1);
  const n = await homeCount(page);
  await probe(page, HOME, 0);
  await expect.poll(() => homeCount(page)).toBe(n + 24);
  expect(Math.abs((await lineLeft()) - (await cellLeft()))).toBeLessThanOrEqual(1);
});

test('midnight dividers follow the days added on either side', async ({ page }) => {
  await page.goto('/');
  const dividers = () =>
    row(page, HOME)
      .locator('.grid__divider')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-start')));
  expect(await dividers()).toEqual([
    '2026-11-16T13:00:00.000Z',
    '2026-11-17T13:00:00.000Z',
    '2026-11-18T13:00:00.000Z',
  ]);
  const n = await homeCount(page);
  await probe(page, HOME, 0);
  await expect.poll(() => homeCount(page)).toBe(n + 24);
  await probe(page, HOME, 'end');
  await expect.poll(() => homeCount(page)).toBe(n + 48);
  expect(await dividers()).toEqual([
    '2026-11-15T13:00:00.000Z',
    '2026-11-16T13:00:00.000Z',
    '2026-11-17T13:00:00.000Z',
    '2026-11-18T13:00:00.000Z',
    '2026-11-19T13:00:00.000Z',
  ]);
});
