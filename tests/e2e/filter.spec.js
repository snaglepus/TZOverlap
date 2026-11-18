// E2E: the All / Good / Best filter (TZO-20) — masks by instant in every row,
// the segmented control and its placement, the 1/2/3 keys, persistence, other
// tabs and Reset, and the no-overlap message with its next-day search.

import { expect, test } from '@playwright/test';
import { NOW, expectNoA11yViolations, openSettings, seedZones } from './helpers.js';

const HOME = 'Europe/London';
const HOUR = 3600000;

/** @param {string[]} tzs */
const zones = (tzs) =>
  tzs.map((tz, i) => ({ id: `z${i}`, kind: 'iana', tz, label: tz.split('/')[1] }));

/** Offsets from UTC−10 to UTC+12 with London home: no hour is Best everywhere. */
const SPREAD = [
  'Pacific/Honolulu',
  'America/Los_Angeles',
  'America/New_York',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/** @param {import('@playwright/test').Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {import('@playwright/test').Page} page */
const filterGroup = (page) => page.getByRole('group', { name: 'Filter' });

/** @param {import('@playwright/test').Page} page @param {'All' | 'Good' | 'Best'} name */
const radio = (page, name) => filterGroup(page).getByRole('radio', { name, exact: true });

/** @param {import('@playwright/test').Page} page @param {'All' | 'Good' | 'Best'} name */
const segment = (page, name) =>
  filterGroup(page).locator('.segmented__option').filter({ hasText: name });

/** @param {import('@playwright/test').Page} page */
const message = (page) => page.locator('.no-overlap');

/** @param {import('@playwright/test').Page} page */
const dateInput = (page) => page.locator('.toolbar input[type="date"]');

/**
 * Click a filter segment and wait for its radio to be checked.
 * @param {import('@playwright/test').Page} page
 * @param {'All' | 'Good' | 'Best'} name
 */
async function choose(page, name) {
  await segment(page, name).click();
  await expect(radio(page, name)).toBeChecked();
}

/**
 * Each track's masks as "start/end", in order: home, Everyone, user rows.
 * @param {import('@playwright/test').Page} page
 */
const masksByTrack = (page) =>
  grid(page)
    .locator('.grid__track')
    .evaluateAll((tracks) =>
      tracks.map((track) =>
        [...track.querySelectorAll(':scope > .grid__mask')].map(
          (el) => `${el.getAttribute('data-start')}/${el.getAttribute('data-end')}`,
        ),
      ),
    );

/**
 * The window from the home row's cells, and the Everyone segments with their ends.
 * @param {import('@playwright/test').Page} page
 */
async function everyone(page) {
  const homeStarts = await page
    .locator(`[role="row"][data-zone="${HOME}"] [role="gridcell"]`)
    .evaluateAll((els) => els.map((el) => Date.parse(/** @type {string} */ (el.dataset.start))));
  const start = Math.min(...homeStarts);
  // London in June: every home cell is one hour long.
  const end = Math.max(...homeStarts) + HOUR;
  const raw = await page
    .locator('[role="row"][data-zone="everyone"] [role="gridcell"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        start: Date.parse(/** @type {string} */ (el.dataset.start)),
        rating: /** @type {string} */ (el.dataset.rating),
        label: /** @type {string} */ (el.getAttribute('aria-label')),
      })),
    );
  const segments = raw.map((s, i) => ({ ...s, end: raw[i + 1]?.start ?? end }));
  return { start, end, segments };
}

/**
 * Every row has the same masks, inside the window, and the instants left
 * unmasked are exactly the Everyone segments rated one of `shown`.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} shown
 */
async function expectUnmasked(page, shown) {
  const tracks = await masksByTrack(page);
  expect(tracks.length).toBeGreaterThan(2);
  for (const track of tracks) expect(track).toEqual(tracks[0]);
  const masks = /** @type {string[]} */ (tracks[0]).map((m) => {
    const [from, to] = m.split('/');
    return {
      start: Date.parse(/** @type {string} */ (from)),
      end: Date.parse(/** @type {string} */ (to)),
    };
  });
  const { start, end, segments } = await everyone(page);
  for (const m of masks) {
    expect(m.start).toBeGreaterThanOrEqual(start);
    expect(m.end).toBeLessThanOrEqual(end);
  }
  for (const s of segments) {
    const covered = masks.some((m) => m.start <= s.start && s.end <= m.end);
    const apart = masks.every((m) => m.end <= s.start || s.end <= m.start);
    expect(covered || apart, `segment at ${new Date(s.start).toISOString()}`).toBe(true);
    expect(covered, `${s.rating} at ${new Date(s.start).toISOString()}`).toBe(
      !shown.includes(s.rating),
    );
  }
  return { masks, segments };
}

test.describe('AC-6: Best greys every row at the same instants', () => {
  test('London, Sydney and New York: nothing qualifies, the whole window is masked', async ({
    page,
  }) => {
    await seedZones(page, zones(['Australia/Sydney', 'America/New_York']));
    await page.goto('/');
    await expect(message(page)).toBeEmpty();
    await choose(page, 'Best');
    const { masks, segments } = await expectUnmasked(page, ['best']);
    expect(segments.some((s) => s.rating === 'best')).toBe(false);
    const { start, end } = await everyone(page);
    expect(masks).toEqual([{ start, end }]);
    await expect(message(page)).toContainText('No time works for everyone today');
  });

  for (const tz of ['America/New_York', 'Asia/Kolkata']) {
    test(`London and ${tz}: unmasked exactly where Everyone is Best, never on Sunday`, async ({
      page,
    }) => {
      await seedZones(page, zones([tz]));
      await page.goto('/');
      await choose(page, 'Best');
      const { masks } = await expectUnmasked(page, ['best']);
      // Sunday 14 Jun in London: 13 Jun 23:00Z to 14 Jun 23:00Z.
      const sunday = {
        start: Date.parse('2026-06-13T23:00:00Z'),
        end: Date.parse('2026-06-14T23:00:00Z'),
      };
      expect(masks.some((m) => m.start <= sunday.start && sunday.end <= m.end)).toBe(true);
      await expect(page.locator(`[data-zone="${tz}"] .grid__mask`)).toHaveCount(masks.length);
      const image = await page
        .locator('.grid__mask')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(image).not.toBe('none');
      await expect(message(page)).toBeEmpty();
    });
  }
});

test('Good and All: Good leaves Good and Best unmasked, All restores the grid', async ({
  page,
}) => {
  await seedZones(page, zones(['America/New_York']));
  await page.goto('/');
  await expect(radio(page, 'All')).toBeChecked();
  await expect(page.locator('.grid__mask')).toHaveCount(0);
  const cells = () =>
    grid(page)
      .locator('[data-hour]')
      .evaluateAll((els) =>
        els.map((el) => [el.dataset.start, el.dataset.rating, el.dataset.heat ?? null]),
      );
  const before = await cells();

  await choose(page, 'Good');
  const { segments } = await expectUnmasked(page, ['good', 'best']);
  const unsuitable = segments.find((s) => s.rating === 'unsuitable');
  expect(unsuitable?.label).toMatch(/, Unsuitable for everyone, greyed out by the filter$/);
  const good = segments.find((s) => s.rating === 'good');
  expect(good?.label).toMatch(/, Good for everyone$/);

  await choose(page, 'All');
  await expect(page.locator('.grid__mask')).toHaveCount(0);
  expect(await cells()).toEqual(before);
  const after = await everyone(page);
  expect(after.segments.find((s) => s.rating === 'unsuitable')?.label).toMatch(
    /, Unsuitable for everyone$/,
  );
});

test('changing the filter keeps the scroll, the date and the window', async ({ page }) => {
  await seedZones(page, zones(['America/New_York']));
  await page.goto('/');
  const home = page.locator(`[role="row"][data-zone="${HOME}"] [role="gridcell"]`);
  const state = async () => ({
    scrollLeft: await grid(page).evaluate((el) => el.scrollLeft),
    date: await dateInput(page).inputValue(),
    first: await home.first().getAttribute('data-start'),
    last: await home.last().getAttribute('data-start'),
  });
  const before = await state();
  expect(before.scrollLeft).toBeGreaterThan(0);
  for (const name of /** @type {const} */ (['Best', 'Good', 'All'])) {
    await choose(page, name);
    expect(await state()).toEqual(before);
  }
});

test.describe('keys and assistive tech', () => {
  test('1, 2 and 3 in the grid pick All, Good and Best; nowhere else', async ({ page }) => {
    await seedZones(page, zones(['America/New_York']));
    await page.goto('/');
    await expect(filterGroup(page).getByRole('radio')).toHaveCount(3);
    for (const [name, key] of /** @type {const} */ ([
      ['All', '1'],
      ['Good', '2'],
      ['Best', '3'],
    ])) {
      await expect(radio(page, name)).toHaveAttribute('aria-keyshortcuts', key);
    }
    const checked = () =>
      filterGroup(page)
        .getByRole('radio')
        .evaluateAll(
          (els) => els.filter((el) => /** @type {HTMLInputElement} */ (el).checked).length,
        );
    expect(await checked()).toBe(1);
    await expect(radio(page, 'All')).toBeChecked();

    await page.getByRole('button', { name: 'Settings' }).focus();
    await page.keyboard.press('2');
    await expect(radio(page, 'All')).toBeChecked();

    await grid(page).focus();
    await page.keyboard.press('Control+2');
    await page.keyboard.press('Alt+2');
    await expect(radio(page, 'All')).toBeChecked();
    await expect(page.locator('.grid__mask')).toHaveCount(0);

    await page.keyboard.press('2');
    await expect(radio(page, 'Good')).toBeChecked();
    await expect(page.getByTestId('announcer')).toHaveText('Filter: Good');
    await page.keyboard.press('3');
    await expect(radio(page, 'Best')).toBeChecked();
    await expect(page.getByTestId('announcer')).toHaveText('Filter: Best');
    await expect(page.locator('.grid__mask').first()).toBeAttached();
    expect(await checked()).toBe(1);
    await expect(grid(page)).toBeFocused();
    await page.keyboard.press('1');
    await expect(radio(page, 'All')).toBeChecked();
    await expect(page.locator('.grid__mask')).toHaveCount(0);
  });

  test('the choice survives a reload', async ({ page }) => {
    await seedZones(page, zones(['America/New_York']));
    await page.goto('/');
    await choose(page, 'Best');
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('tzoverlap.state') ?? '{}').settings?.filter,
        ),
      )
      .toBe('best');
    await page.reload();
    await expect(radio(page, 'Best')).toBeChecked();
    await expect(page.locator('.grid__mask').first()).toBeAttached();
  });
});

test.describe('no-overlap message (FR-29b, PRD T10)', () => {
  test.describe('Saturday', () => {
    test.beforeEach(async ({ page }) => {
      // 12:00 in London on Saturday 13 Jun 2026.
      await page.clock.setFixedTime(new Date('2026-06-13T11:00:00Z'));
    });

    test('jumps to Monday, the first later date with a Best slot', async ({ page }) => {
      await seedZones(page, zones(['America/New_York']));
      await page.goto('/');
      await expect(dateInput(page)).toHaveValue('2026-06-13');
      await choose(page, 'Best');
      await expect(message(page)).toContainText('No time works for everyone today');
      await message(page).getByRole('button', { name: 'Show next day that works' }).click();
      await expect(dateInput(page)).toHaveValue('2026-06-15');
      await expect(message(page)).toBeEmpty();
      await expect(grid(page)).toBeFocused();
    });
  });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}px: seven zones over 16 hours: none in the next 14 days, All clears it`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedZones(page, zones(SPREAD));
      await page.goto('/');
      await choose(page, 'Best');
      await expect(message(page)).toContainText('No time works for everyone today');
      const date = await dateInput(page).inputValue();
      await message(page).getByRole('button', { name: 'Show next day that works' }).click();
      await expect(message(page)).toContainText(
        'No time works for everyone in the next 14 days either.',
      );
      await expect(message(page).getByRole('button')).toHaveCount(0);
      // Both lines share the message style (weight and wrapping).
      await expect(message(page).locator('.no-overlap__message')).toHaveCount(2);
      // One block: the second line starts under the first, at the same left edge.
      const [first, second] = await message(page)
        .locator('.no-overlap__message')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      expect(second.left).toBe(first.left);
      expect(second.top).toBeGreaterThanOrEqual(first.bottom);
      await expect(dateInput(page)).toHaveValue(date);
      await expect(grid(page)).toBeFocused();
      await choose(page, 'All');
      await expect(message(page)).toBeEmpty();
    });
  }

  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    test(`axe passes with Best and the message in ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await seedZones(page, zones(['Australia/Sydney', 'America/New_York']));
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await choose(page, 'Best');
      await expect(message(page)).toContainText('No time works for everyone today');
      await expectNoA11yViolations(page);
    });
  }
});

test.describe('placement', () => {
  /** @param {import('@playwright/test').Locator} locator */
  const box = async (locator) =>
    /** @type {{ x: number, y: number, width: number, height: number }} */ (
      await locator.boundingBox()
    );

  /** @param {import('@playwright/test').Page} page */
  async function expectBigSegments(page) {
    for (const name of /** @type {const} */ (['All', 'Good', 'Best'])) {
      const b = await box(segment(page, name));
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
  }

  test('phone: the last row of the bottom toolbar, clear of the footer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const toolbar = page.getByRole('group', { name: 'Toolbar' });
    expect(await filterGroup(page).evaluate((el) => el.closest('.toolbar') !== null)).toBe(true);
    const group = await box(filterGroup(page));
    expect(group.y + group.height).toBeLessThanOrEqual(844);
    const settings = await box(page.getByRole('button', { name: 'Settings' }));
    expect(group.y).toBeGreaterThanOrEqual(settings.y + settings.height);
    await expectBigSegments(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const footer = await box(page.locator('footer'));
    expect(footer.y + footer.height).toBeLessThanOrEqual((await box(toolbar)).y + 1);
  });

  for (const viewport of [
    { width: 820, height: 1180 },
    { width: 1280, height: 800 },
  ]) {
    test(`${viewport.width}px: its own line in the title bar, under Settings`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      expect(await filterGroup(page).evaluate((el) => el.closest('header') !== null)).toBe(true);
      const group = await box(filterGroup(page));
      const settings = await box(page.getByRole('button', { name: 'Settings' }));
      expect(group.y).toBeGreaterThanOrEqual(settings.y + settings.height);
      expect(group.y + group.height).toBeLessThanOrEqual((await box(page.locator('main'))).y);
      await expectBigSegments(page);
    });
  }

  for (const width of [320, 375]) {
    test(`${width}px: the segments fit and overlap no other toolbar control`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto('/');
      for (const date of [null, '2026-07-15']) {
        if (date) {
          await dateInput(page).fill(date);
          await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
        }
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBe(0);
        const others = [];
        for (const control of [
          dateInput(page),
          page.getByRole('button', { name: 'Today', exact: true }),
          page.getByRole('button', { name: 'Go to now' }),
          page.getByRole('button', { name: 'Settings' }),
        ]) {
          if (await control.isVisible()) others.push(await box(control));
        }
        for (const name of /** @type {const} */ (['All', 'Good', 'Best'])) {
          const s = await box(segment(page, name));
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x + s.width).toBeLessThanOrEqual(width);
          expect(s.y + s.height).toBeLessThanOrEqual(740);
          for (const o of others) {
            const apart =
              s.x + s.width <= o.x ||
              o.x + o.width <= s.x ||
              s.y + s.height <= o.y ||
              o.y + o.height <= s.y;
            expect(apart).toBe(true);
          }
        }
        await expectBigSegments(page);
      }
    });
  }
});

test('layering: headers above the masks, greyed labels readable above them', async ({ page }) => {
  await seedZones(page, zones(['Australia/Sydney', 'America/New_York']));
  await page.goto('/');
  await choose(page, 'Best');
  await grid(page).evaluate((el) => {
    el.scrollLeft += 300;
  });
  const hits = await page.evaluate(() => {
    const root = /** @type {HTMLElement} */ (document.querySelector('[role="grid"]'));
    const userRow = /** @type {HTMLElement} */ (
      root.querySelector('[role="row"][data-zone="America/New_York"]')
    );
    const header = /** @type {HTMLElement} */ (userRow.querySelector('.grid__header'));
    const h = header.getBoundingClientRect();
    const onHeader = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
    const area = root.getBoundingClientRect();
    const label = [...userRow.querySelectorAll('.grid__label')].find((el) => {
      const r = el.getBoundingClientRect();
      return (
        getComputedStyle(el).visibility === 'visible' &&
        r.width > 0 &&
        r.left > h.right &&
        r.right < area.right
      );
    });
    if (!label) return null;
    const r = label.getBoundingClientRect();
    return {
      header: header.contains(onHeader),
      label: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === label,
    };
  });
  expect(hits).toEqual({ header: true, label: true });
});

test.describe('other tabs and Reset', () => {
  test('Reset all data returns to All with no masks', async ({ page }) => {
    await seedZones(page, zones(['America/New_York']));
    await page.goto('/');
    await choose(page, 'Best');
    await expect(page.locator('.grid__mask').first()).toBeAttached();
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Reset all data' }).click();
    await dialog.getByRole('button', { name: 'Reset everything' }).click();
    await expect(dialog).toBeHidden();
    await expect(radio(page, 'All')).toBeChecked();
    await expect(page.locator('.grid__mask')).toHaveCount(0);
    await expect(message(page)).toBeEmpty();
  });

  test('a change in another tab shows here without a reload', async ({ page, context }) => {
    await seedZones(page, zones(['America/New_York']));
    await page.goto('/');
    await expect(radio(page, 'All')).toBeChecked();
    // This tab's own first save (the home zone) has landed, so it can't overwrite the other's.
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('tzoverlap.state') ?? '{}').meta?.lastHomeTz,
        ),
      )
      .toBe(HOME);
    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto('/');
    await choose(other, 'Good');
    await expect(radio(page, 'Good')).toBeChecked();
    await expect(page.locator('.grid__mask').first()).toBeAttached();
    await expectUnmasked(page, ['good', 'best']);
  });
});
