// E2E: timeline scrolling (TZO-10): wheel, mouse drag, arrow keys and native
// touch; the now line, the initial position, the Now button and the N key; and
// keeping the scroll position across grid rebuilds.

import { expect, test } from '@playwright/test';
import { NOW, addZone, openSettings, seedZones } from './helpers.js';

const HOUR = 3600000;
const TOKYO = { id: 't', kind: 'iana', tz: 'Asia/Tokyo', label: 'Tokyo' };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/** @param {import('@playwright/test').Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {import('@playwright/test').Page} page */
const nowButton = (page) => page.getByRole('button', { name: 'Go to now' });

/** @param {import('@playwright/test').Page} page */
const scrollLeft = (page) => grid(page).evaluate((el) => el.scrollLeft);

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} left
 */
const scrollTo = (page, left) =>
  grid(page).evaluate((el, x) => {
    el.scrollLeft = x;
  }, left);

/**
 * Where the now line sits across the visible track: 0 at the header's right
 * edge, 1 at the grid's right edge.
 * @param {import('@playwright/test').Page} page
 */
const lineFraction = (page) =>
  page.evaluate(() => {
    const el = /** @type {HTMLElement} */ (document.querySelector('[role="grid"]'));
    const line = /** @type {HTMLElement} */ (el.querySelector('.grid__now'));
    const header = /** @type {HTMLElement} */ (
      el.querySelector('[role="rowheader"]')
    ).getBoundingClientRect();
    return (line.getBoundingClientRect().x - header.right) / (el.clientWidth - header.width);
  });

/**
 * The line ends up 25–45% across, once any smooth scroll has finished.
 * @param {import('@playwright/test').Page} page
 */
const expectLineAtOneThird = async (page) => {
  await expect
    .poll(async () => {
      const before = await scrollLeft(page);
      await page.waitForTimeout(100);
      const fraction = await lineFraction(page);
      return (await scrollLeft(page)) === before && fraction >= 0.25 && fraction <= 0.45;
    })
    .toBe(true);
  const fraction = await lineFraction(page);
  expect(fraction).toBeGreaterThanOrEqual(0.25);
  expect(fraction).toBeLessThanOrEqual(0.45);
};

/** @param {import('@playwright/test').Page} page */
const columnWidth = (page) =>
  page
    .locator('[role="row"]')
    .first()
    .getByRole('gridcell')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);

/**
 * data-start of the first home cell fully right of the sticky header, in ms.
 * @param {import('@playwright/test').Page} page
 */
const visibleLeftInstant = (page) =>
  page.evaluate(() => {
    const homeRow = /** @type {HTMLElement} */ (document.querySelector('[role="row"]'));
    const edge = /** @type {HTMLElement} */ (
      homeRow.querySelector('[role="rowheader"]')
    ).getBoundingClientRect().right;
    const cell = [...homeRow.querySelectorAll('[role="gridcell"]')].find(
      (c) => c.getBoundingClientRect().left >= edge - 0.5,
    );
    return new Date(/** @type {string} */ (cell?.getAttribute('data-start'))).getTime();
  });

for (const viewport of [null, { width: 390, height: 844 }]) {
  test(`on load the now line sits a third of the way in and crosses every row (${viewport ? '390px' : 'desktop'})`, async ({
    page,
  }) => {
    if (viewport) await page.setViewportSize(viewport);
    await seedZones(page, [TOKYO]);
    await page.goto('/');
    await expect(page.locator('[role="row"]')).toHaveCount(3);
    await expectLineAtOneThird(page);

    const { line, first, last } = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[role="row"]')].map((r) =>
        r.getBoundingClientRect(),
      );
      const rect = /** @type {HTMLElement} */ (
        document.querySelector('.grid__now')
      ).getBoundingClientRect();
      return { line: { top: rect.top, bottom: rect.bottom }, first: rows[0], last: rows.at(-1) };
    });
    if (!first || !last) throw new Error('no rows');
    expect(line.top).toBeLessThanOrEqual(first.top + 1);
    expect(line.bottom).toBeGreaterThanOrEqual(last.bottom - 1);
    await expect(page.locator('.grid__now')).toHaveAttribute('aria-hidden', 'true');
    await expect(nowButton(page)).toBeDisabled();
    await expect(nowButton(page)).toHaveText('Now');
  });
}

test('Now and the N key bring the line back', async ({ page }) => {
  await seedZones(page, [TOKYO]);
  await page.goto('/');
  await expect(nowButton(page)).toBeDisabled();

  await grid(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(nowButton(page)).toBeEnabled();
  await nowButton(page).click();
  await expectLineAtOneThird(page);
  await expect(nowButton(page)).toBeDisabled();
  // Focus moved from the button that disabled itself to the grid.
  await expect(grid(page)).toBeFocused();

  await scrollTo(page, 0);
  await expect(nowButton(page)).toBeEnabled();
  await grid(page).focus();
  await page.keyboard.press('n');
  await expectLineAtOneThird(page);
  await expect(nowButton(page)).toBeDisabled();
});

test('N works only while focus is in the grid', async ({ page }) => {
  await seedZones(page, [TOKYO]);
  await page.goto('/');
  await grid(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const far = await scrollLeft(page);
  expect(far).toBeGreaterThan(0);

  const input = page.getByLabel('Time zone', { exact: true });
  await input.focus();
  await page.keyboard.press('n');
  await expect(input).toHaveValue('n');
  expect(await scrollLeft(page)).toBe(far);
  await input.fill('');

  await page.getByRole('button', { name: 'Settings' }).focus();
  await page.keyboard.press('n');
  expect(await scrollLeft(page)).toBe(far);

  const dialog = await openSettings(page);
  await page.keyboard.press('n');
  expect(await scrollLeft(page)).toBe(far);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await scrollLeft(page)).toBe(far);

  await page.getByRole('button', { name: 'Remove Tokyo' }).focus();
  await page.keyboard.press('n');
  await expectLineAtOneThird(page);
});

test('arrow keys scroll one column, six with Shift; Alt+Left is left alone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedZones(page, [TOKYO]);
  await page.goto('/');
  const column = await columnWidth(page);
  expect(column).toBeGreaterThan(0);
  await scrollTo(page, 20 * column);
  await grid(page).focus();

  /** @param {string} key @param {number} columns */
  const expectStep = async (key, columns) => {
    const before = await scrollLeft(page);
    await page.keyboard.press(key);
    await expect
      .poll(async () => Math.abs((await scrollLeft(page)) - before - columns * column))
      .toBeLessThanOrEqual(1);
  };
  await expectStep('ArrowRight', 1);
  await expectStep('Shift+ArrowRight', 6);
  await expectStep('ArrowLeft', -1);

  const before = await scrollLeft(page);
  await page.keyboard.press('Alt+ArrowLeft');
  expect(await scrollLeft(page)).toBe(before);
  await expect(page).toHaveURL(/\/$/);
});

test('a vertical wheel over the grid scrolls it sideways, not the page', async ({ page }) => {
  await seedZones(page, [TOKYO]);
  await page.goto('/');
  const cell = page.locator('[data-zone="Europe/London"] [data-start="2026-06-15T13:00:00.000Z"]');
  await cell.hover();
  const before = await scrollLeft(page);
  const pageY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
});

test('dragging with the mouse scrolls from the cells, not from the headers', async ({ page }) => {
  await seedZones(page, [TOKYO]);
  await page.goto('/');

  /** @param {import('@playwright/test').Locator} from */
  const drag = async (from) => {
    const box = await from.boundingBox();
    if (!box) throw new Error('no box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 150, y, { steps: 10 });
    await page.mouse.up();
  };

  const cell = page.locator('[data-zone="Europe/London"] [data-start="2026-06-15T13:00:00.000Z"]');
  const before = await scrollLeft(page);
  await drag(cell);
  expect(Math.abs((await scrollLeft(page)) - before - 150)).toBeLessThanOrEqual(5);

  const header = page.locator('[data-zone="Europe/London"] .grid__details .grid__name');
  const still = await scrollLeft(page);
  await drag(header);
  expect(await scrollLeft(page)).toBe(still);
  // Header text is still selectable.
  expect(await page.evaluate(() => String(getSelection()))).toContain('14:30');
});

test.describe('rebuilds keep the scroll position', () => {
  test('adding a zone keeps the visible instant; the line and Now still work', async ({ page }) => {
    await seedZones(page, [TOKYO]);
    await page.goto('/');
    await scrollTo(page, 300);
    const before = await visibleLeftInstant(page);
    await addZone(page, 'America/New_York');
    await expect(page.locator('[data-zone="America/New_York"]')).toBeVisible();
    expect(Math.abs((await visibleLeftInstant(page)) - before)).toBeLessThanOrEqual(HOUR);

    await expect(nowButton(page)).toBeEnabled();
    await nowButton(page).click();
    await expectLineAtOneThird(page);
    await expect(nowButton(page)).toBeDisabled();
  });

  test('after midnight a rebuild keeps the window and the instant', async ({ page }) => {
    // 23:58 in London (BST).
    await page.clock.install({ time: new Date('2026-06-15T22:58:00Z') });
    await page.goto('/');
    const firstCell = () =>
      page
        .locator('[data-zone="Europe/London"] [role="gridcell"]')
        .first()
        .getAttribute('data-start');
    const start = await firstCell();
    // Yesterday 06:00 at the visible left edge.
    await scrollTo(page, 6 * (await columnWidth(page)));
    const before = await visibleLeftInstant(page);
    expect(new Date(before).toISOString()).toBe('2026-06-14T05:00:00.000Z');

    await page.clock.runFor(180_000);
    await expect(page.locator('[data-zone="Europe/London"] .grid__details .grid__time')).toHaveText(
      '00:01',
    );
    await addZone(page, 'Asia/Tokyo');
    await expect(page.locator('[data-zone="Asia/Tokyo"]')).toBeVisible();
    expect(await scrollLeft(page)).toBeGreaterThan(0);
    expect(Math.abs((await visibleLeftInstant(page)) - before)).toBeLessThanOrEqual(HOUR);
    expect(await firstCell()).toBe(start);
  });

  test('a zone added in another tab keeps this tab’s position', async ({ page, context }) => {
    await page.goto('/');
    await scrollTo(page, 300);
    const before = await visibleLeftInstant(page);
    // Let this tab's debounced launch save (lastHomeTz) land first, or it
    // would overwrite the other tab's zone.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('tzoverlap.state')))
      .not.toBeNull();

    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto('/');
    await addZone(other, 'Asia/Tokyo');
    await expect(page.locator('[data-zone="Asia/Tokyo"]')).toBeVisible();
    expect(Math.abs((await visibleLeftInstant(page)) - before)).toBeLessThanOrEqual(HOUR);
  });
});

test.describe('the line on the minute tick', () => {
  test('moves by a minute without rebuilding cells', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-06-15T13:30:30Z') });
    await page.goto('/');
    const lineX = () => page.locator('.grid__now').evaluate((el) => el.getBoundingClientRect().x);
    const column = await columnWidth(page);
    const time = page.locator('[data-zone="Europe/London"] .grid__details .grid__time');
    const selector = '[data-zone="Europe/London"] [data-start="2026-06-15T13:00:00.000Z"]';
    const cell = await page.locator(selector).elementHandle();
    // The first tick lands on 14:31:00; measure one whole minute from there.
    await page.clock.runFor(31_000);
    await expect(time).toHaveText('14:31');
    const before = await lineX();
    await page.clock.runFor(60_000);
    await expect(time).toHaveText('14:32');
    expect(Math.abs((await lineX()) - before - column / 60)).toBeLessThanOrEqual(0.1);
    const same = await page.evaluate(
      ([el, sel]) => /** @type {Element} */ (el).isConnected && document.querySelector(sel) === el,
      /** @type {const} */ ([cell, selector]),
    );
    expect(same).toBe(true);
  });
});

test.describe('phone touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('touch scrolls the grid, not the page', async ({ page }) => {
    await seedZones(page, [TOKYO]);
    await page.goto('/');
    const styles = await grid(page).evaluate((el) => {
      const style = getComputedStyle(el);
      return { overscroll: style.overscrollBehaviorX, touch: style.touchAction };
    });
    expect(styles).toEqual({ overscroll: 'contain', touch: 'pan-x pan-y' });

    await grid(page).scrollIntoViewIfNeeded();
    const before = await scrollLeft(page);
    const box = await grid(page).boundingBox();
    if (!box) throw new Error('no grid box');
    const cdp = await page.context().newCDPSession(page);
    const gesture = {
      x: Math.round(box.x + box.width * 0.75),
      y: Math.round(box.y + box.height / 2),
      yDistance: 0,
      gestureSourceType: /** @type {const} */ ('touch'),
      speed: 4000,
    };
    // Past the start, then past the end.
    await cdp.send('Input.synthesizeScrollGesture', { ...gesture, xDistance: 4000 });
    await cdp.send('Input.synthesizeScrollGesture', { ...gesture, xDistance: -6000 });

    const after = await page.evaluate(() => {
      const el = /** @type {HTMLElement} */ (document.querySelector('[role="grid"]'));
      const doc = document.documentElement;
      return {
        scrollLeft: el.scrollLeft,
        pageX: window.scrollX,
        overflow: doc.scrollWidth - doc.clientWidth,
      };
    });
    expect(after.scrollLeft).not.toBe(before);
    expect(after.pageX).toBe(0);
    expect(after.overflow).toBe(0);
  });
});
