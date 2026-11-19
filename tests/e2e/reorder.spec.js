// E2E: drag to reorder user rows (TZO-23, src/ui/reorder.js). Touch goes
// through raw CDP touch events; mouse through page.mouse. Covers the handle and
// header long press, the drop and its persistence, cancelling (Esc, a release
// outside, a resize, a row height change), clamping, hour cells, the lifted
// style, reduced motion, auto-scroll, vibration, large text and accessibility.

import { expect, test } from '@playwright/test';
import {
  LIFT_PX,
  NOW,
  expectNoA11yViolations,
  seedZones,
  setRootFontSize,
  touchscreen,
} from './helpers.js';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const HOME = 'Europe/London';

const A = 'America/New_York';
const B = 'Europe/Paris';
const C = 'Asia/Kolkata';
const D = 'Asia/Tokyo';
/** @type {[string, string, string][]} id, tz, label */
const FOUR = [
  ['a', A, 'New York'],
  ['b', B, 'Paris'],
  ['c', C, 'Kolkata'],
  ['d', D, 'Tokyo'],
];
/** @type {[string, string, string][]} */
const SEVEN = [
  ...FOUR,
  ['e', 'Asia/Dubai', 'Dubai'],
  ['f', 'America/Chicago', 'Chicago'],
  ['g', 'Asia/Singapore', 'Singapore'],
];

/** @param {[string, string, string][]} list */
const seeded = (list) => list.map(([id, tz, label]) => ({ id, kind: 'iana', tz, label }));

/** @typedef {import('@playwright/test').Page} Page */

/** @param {Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {Page} page @param {string} zone data-zone value */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {Page} page @param {string} zone */
const handle = (page, zone) => row(page, zone).locator('.grid__handle');

/** @param {Page} page */
const details = (page) => page.getByRole('group', { name: 'Time zone details' });

/** The data-zone of each user row, in order. @param {Page} page */
const userZones = (page) =>
  page
    .locator('[role="row"][data-id]')
    .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).dataset.zone));

/** The stored zone ids, in order. @param {Page} page */
const storedIds = (page) =>
  page.evaluate(() =>
    /** @type {{ id: string }[]} */ (
      JSON.parse(localStorage.getItem('tzoverlap.state') ?? '{}').zones ?? []
    ).map((z) => z.id),
  );

/** @param {Page} page */
const scrollLeft = (page) => grid(page).evaluate((el) => el.scrollLeft);

/**
 * Record writes of tzoverlap.state once window.__armWrites() has run.
 * @param {Page} page
 */
const spyOnWrites = (page) =>
  page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    const w = /** @type {any} */ (window);
    w.__writes = [];
    w.__armed = false;
    w.__armWrites = () => {
      w.__armed = true;
    };
    Storage.prototype.setItem = function (key, value) {
      if (w.__armed && key === 'tzoverlap.state') w.__writes.push(value);
      return original.call(this, key, value);
    };
  });

/**
 * Let the launch save (lastHomeTz) land, then arm the write spy.
 * @param {Page} page
 */
async function armWrites(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('tzoverlap.state') ?? '{}').meta?.lastHomeTz,
      ),
    )
    .toBe(HOME);
  await page.waitForTimeout(300);
  await page.evaluate(() => /** @type {any} */ (window).__armWrites());
}

/** @param {Page} page */
const writes = (page) => page.evaluate(() => /** @type {any} */ (window).__writes.length);

/** @param {import('@playwright/test').Locator} locator */
async function centre(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Each row's untransformed vertical midpoint relative to the grid's top.
 * @param {Page} page
 * @returns {Promise<Record<string, number>>}
 */
const midpoints = (page) =>
  grid(page).evaluate((root) => {
    const top = root.getBoundingClientRect().top;
    /** @type {Record<string, number>} */
    const mids = {};
    for (const el of root.querySelectorAll('[role="row"]')) {
      const rect = el.getBoundingClientRect();
      mids[/** @type {string} */ (/** @type {HTMLElement} */ (el).dataset.zone)] =
        (rect.top + rect.bottom) / 2 - top;
    }
    return mids;
  });

/** @param {Page} page */
const gridTop = (page) => grid(page).evaluate((el) => el.getBoundingClientRect().top);

/**
 * The client y to put a pointer that grabbed row `dragged` at `grabY` so that
 * the row's centre sits `by` px above row `target`'s midpoint (measured
 * before the drag, so shifted rows don't move the target).
 * @param {Page} page
 * @param {Record<string, number>} mids
 * @param {string} dragged
 * @param {number} grabY
 * @param {number} grabTop the grid's top when the row was grabbed
 * @param {string} target
 * @param {number} [by]
 */
async function aboveMid(page, mids, dragged, grabY, grabTop, target, by = 12) {
  const offset = grabY - grabTop - /** @type {number} */ (mids[dragged]);
  return (await gridTop(page)) + /** @type {number} */ (mids[target]) - by + offset;
}

/** No row lifted, shifted or transformed. @param {Page} page */
async function expectRowsAtRest(page) {
  await expect(page.locator('.grid__row--lifted')).toHaveCount(0);
  // A cancel can land while a shift is still transitioning: let it settle.
  await page
    .locator('[role="row"]')
    .evaluateAll((els) =>
      Promise.all(els.flatMap((el) => el.getAnimations().map((a) => a.finished.catch(() => {})))),
    );
  const transforms = await page
    .locator('[role="row"]')
    .evaluateAll((els) =>
      els.map((el) => [
        /** @type {HTMLElement} */ (el).style.transform,
        getComputedStyle(el).transform,
      ]),
    );
  for (const [inline, computed] of transforms) {
    expect(inline).toBe('');
    expect(computed).toBe('none');
  }
  await expect(grid(page)).not.toHaveAttribute('data-reordering');
}

/** @param {Page} page */
const liftedStyle = (page) =>
  page.locator('.grid__row--lifted').evaluate((el) => {
    const style = getComputedStyle(el);
    return { shadow: style.boxShadow, scale: new DOMMatrix(style.transform).a };
  });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test.describe('touch at 390 px', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test('AC-7: dragging a handle to the top reorders, keeps scroll and persists', async ({
    page,
  }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    expect(await userZones(page)).toEqual([A, B, C, D]);
    const before = await scrollLeft(page);

    const touch = await touchscreen(page);
    const mids = await midpoints(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    const top = await gridTop(page);
    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) }, 12);
    expect(await scrollLeft(page)).toBe(before);
    await touch.end();

    await expect.poll(() => userZones(page)).toEqual([C, A, B, D]);
    const order = await page
      .locator('[role="row"]')
      .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).dataset.zone));
    expect(order.slice(0, 3)).toEqual([HOME, 'everyone', C]);
    expect(await scrollLeft(page)).toBe(before);
    await expect(details(page)).toBeHidden();

    await expect.poll(() => storedIds(page)).toEqual(['c', 'a', 'b', 'd']);
    await page.reload();
    await expect(row(page, C)).toBeVisible();
    expect(await userZones(page)).toEqual([C, A, B, D]);
  });

  test('a long press on the header picks the row up; a short tap opens the details', async ({
    page,
  }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const touch = await touchscreen(page);
    const trigger = row(page, C).locator('.grid__trigger:visible');

    // A short tap: the popover, no reorder.
    const tap = await centre(trigger);
    await touch.start(tap);
    await page.waitForTimeout(100);
    await touch.end();
    await expect(details(page)).toBeVisible();
    await expect(details(page).getByRole('button', { name: 'Move up' })).toBeVisible();
    expect(await userZones(page)).toEqual([A, B, C, D]);
    await page.keyboard.press('Escape');
    await expect(details(page)).toBeHidden();

    // A long press, then a drag.
    const mids = await midpoints(page);
    const top = await gridTop(page);
    const grab = await centre(trigger);
    await touch.start(grab);
    await page.waitForTimeout(450);
    await expect(row(page, C)).toHaveClass(/grid__row--lifted/);
    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) });
    await touch.end();
    await expect.poll(() => userZones(page)).toEqual([C, A, B, D]);
    await expect(details(page)).toBeHidden();
  });

  test('Esc cancels a drag and keeps the selection', async ({ page }) => {
    await spyOnWrites(page);
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    // Select a slot first.
    const homeTrack = row(page, HOME).locator('.grid__track');
    const trackBox = await homeTrack.boundingBox();
    const gridBox = await grid(page).boundingBox();
    if (!trackBox || !gridBox) throw new Error('no box');
    await page.touchscreen.tap(gridBox.x + gridBox.width - 40, trackBox.y + trackBox.height / 2);
    const band = page.locator('.grid__selection');
    await expect(band).toBeVisible();
    const start = await band.getAttribute('data-start');
    await armWrites(page);

    const touch = await touchscreen(page);
    const mids = await midpoints(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    const top = await gridTop(page);
    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) });
    await expect(row(page, C)).toHaveClass(/grid__row--lifted/);
    await page.keyboard.press('Escape');
    await expectRowsAtRest(page);
    await touch.end();
    await page.waitForTimeout(500);

    expect(await userZones(page)).toEqual([A, B, C, D]);
    await expectRowsAtRest(page);
    await expect(details(page)).toBeHidden();
    expect(await writes(page)).toBe(0);
    await expect(band).toBeVisible();
    await expect(band).toHaveAttribute('data-start', /** @type {string} */ (start));
  });

  test('a release outside the grid cancels', async ({ page }) => {
    await spyOnWrites(page);
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    await armWrites(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const title = await centre(page.getByRole('heading', { level: 1 }));
    const gridBox = await grid(page).boundingBox();
    if (!gridBox) throw new Error('no box');
    expect(title.y).toBeLessThan(gridBox.y);

    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    await touch.move({ x: grab.x, y: title.y });
    await expect(row(page, C)).toHaveClass(/grid__row--lifted/);
    await touch.end();
    await page.waitForTimeout(500);

    expect(await userZones(page)).toEqual([A, B, C, D]);
    await expectRowsAtRest(page);
    expect(await writes(page)).toBe(0);
  });

  test('a release over the home row lands first among the user rows', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, D)));
    const home = await centre(row(page, HOME).locator('[role="rowheader"]'));
    await touch.move({ x: grab.x, y: home.y });
    await touch.end();
    await expect.poll(() => userZones(page)).toEqual([D, A, B, C]);
    const order = await page
      .locator('[role="row"]')
      .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).dataset.zone));
    expect(order.slice(0, 2)).toEqual([HOME, 'everyone']);
  });

  test('a touch drag on hour cells scrolls and never reorders', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const before = await scrollLeft(page);
    const track = await row(page, C).locator('.grid__track').boundingBox();
    const gridBox = await grid(page).boundingBox();
    if (!track || !gridBox) throw new Error('no box');
    const touch = await touchscreen(page);
    const startPoint = { x: gridBox.x + gridBox.width - 20, y: track.y + track.height / 2 };
    await touch.start(startPoint);
    await touch.move({ x: startPoint.x - 300, y: startPoint.y - 100 }, 20);
    await touch.end();
    await expect.poll(() => scrollLeft(page)).not.toBe(before);
    expect(await userZones(page)).toEqual([A, B, C, D]);
    await expect(page.locator('.grid__row--lifted')).toHaveCount(0);
  });

  test('a drop in place writes nothing', async ({ page }) => {
    await spyOnWrites(page);
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    await armWrites(page);
    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, B)));
    await touch.move({ x: grab.x, y: grab.y + 10 }, 2);
    await expect(row(page, B)).toHaveClass(/grid__row--lifted/);
    await touch.end();
    await page.waitForTimeout(500);
    expect(await userZones(page)).toEqual([A, B, C, D]);
    await expectRowsAtRest(page);
    expect(await writes(page)).toBe(0);
  });

  test('the lifted row is raised and scaled; the others slide', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    await touch.move({ x: grab.x, y: grab.y - 30 }, 3);
    const lifted = await liftedStyle(page);
    expect(lifted.shadow).not.toBe('none');
    expect(lifted.scale).toBeGreaterThan(1);
    const duration = await row(page, A).evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).not.toBe('0s');
    await touch.end();
  });

  test('reduced motion: no scale and no slide, the shadow stays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    await touch.move({ x: grab.x, y: grab.y - 30 }, 3);
    const lifted = await liftedStyle(page);
    expect(lifted.shadow).not.toBe('none');
    expect(lifted.scale).toBe(1);
    for (const zone of [A, B, D]) {
      expect(await row(page, zone).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(
        '0s',
      );
    }
    await touch.end();
  });

  test('a layout shift above the grid mid-drag still drops where the row is drawn', async ({
    page,
  }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const touch = await touchscreen(page);
    const mids = await midpoints(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    const top = await gridTop(page);
    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, B) });
    await expect(row(page, B)).toHaveClass(/grid__row--shifted/);

    const pointerY = await aboveMid(page, mids, C, grab.y, top, B);
    await grid(page).evaluate((el) => {
      const spacer = document.createElement('div');
      spacer.style.height = '200px';
      el.closest('.card')?.before(spacer);
    });
    expect(await gridTop(page)).toBeGreaterThanOrEqual(top + 200);
    // The lifted row follows the unmoved pointer, not the grid.
    await expect
      .poll(async () => {
        const box = await row(page, C).boundingBox();
        return Boolean(box && box.y <= pointerY && pointerY <= box.y + box.height);
      })
      .toBe(true);

    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) }, 4);
    await touch.end();
    await expect.poll(() => userZones(page)).toEqual([C, A, B, D]);
  });

  test('a resize mid-drag cancels', async ({ page }) => {
    await spyOnWrites(page);
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    await armWrites(page);
    const touch = await touchscreen(page);
    const mids = await midpoints(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    const top = await gridTop(page);
    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) });
    await expect(row(page, C)).toHaveClass(/grid__row--lifted/);
    await page.setViewportSize({ width: 430, height: 844 });
    await expectRowsAtRest(page);
    await touch.move({ x: grab.x, y: (await aboveMid(page, mids, C, grab.y, top, A)) - 4 }, 1);
    await touch.end();
    await page.waitForTimeout(500);
    expect(await userZones(page)).toEqual([A, B, C, D]);
    await expectRowsAtRest(page);
    expect(await writes(page)).toBe(0);
  });

  test('a home-row height change mid-drag cancels', async ({ page }) => {
    await spyOnWrites(page);
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    await armWrites(page);
    const touch = await touchscreen(page);
    const mids = await midpoints(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    const top = await gridTop(page);
    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) });
    await expect(row(page, C)).toHaveClass(/grid__row--lifted/);
    const heights = await page
      .locator('[role="row"]')
      .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).offsetHeight));
    await row(page, HOME)
      .locator('[role="rowheader"]')
      .evaluate((el) => {
        const chip = document.createElement('div');
        chip.style.height = '60px';
        el.append(chip);
      });
    const after = await page
      .locator('[role="row"]')
      .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).offsetHeight));
    expect(after[0]).toBeGreaterThan(/** @type {number} */ (heights[0]));
    expect(after.slice(1)).toEqual(heights.slice(1));
    await expectRowsAtRest(page);
    await touch.end();
    await page.waitForTimeout(500);
    expect(await userZones(page)).toEqual([A, B, C, D]);
    await expectRowsAtRest(page);
    expect(await writes(page)).toBe(0);
  });

  test('a touch pickup vibrates once for 10 ms', async ({ page }) => {
    await page.addInitScript(() => {
      const w = /** @type {any} */ (window);
      w.__vibrations = [];
      Navigator.prototype.vibrate = function (pattern) {
        w.__vibrations.push(pattern);
        return true;
      };
    });
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, C)));
    await touch.move({ x: grab.x, y: grab.y - 40 }, 4);
    await touch.end();
    expect(await page.evaluate(() => /** @type {any} */ (window).__vibrations)).toEqual([10]);
  });

  test('without navigator.vibrate a long-press reorder still works', async ({ page }) => {
    /** @type {Error[]} */
    const errors = [];
    page.on('pageerror', (error) => errors.push(error));
    await page.addInitScript(() => {
      // @ts-ignore: removing it, as on iOS
      delete Navigator.prototype.vibrate;
    });
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    expect(await page.evaluate(() => 'vibrate' in navigator)).toBe(false);
    const touch = await touchscreen(page);
    const mids = await midpoints(page);
    const top = await gridTop(page);
    const grab = await centre(row(page, C).locator('.grid__trigger:visible'));
    await touch.start(grab);
    await page.waitForTimeout(450);
    await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) });
    await touch.end();
    await expect.poll(() => userZones(page)).toEqual([C, A, B, D]);
    expect(errors).toEqual([]);
  });

  test('handles: one per user row, named, 44 px, keyboard opens the details', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    for (const [, tz, label] of FOUR) {
      await expect(row(page, tz).getByRole('button', { name: `Reorder ${label}` })).toHaveCount(1);
      const box = await handle(page, tz).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole('button', { name: /^Reorder/ })).toHaveCount(4);
    await expect(row(page, HOME).locator('.grid__handle')).toHaveCount(0);
    await expect(row(page, 'everyone').locator('.grid__handle')).toHaveCount(0);

    await row(page, C).locator('.grid__trigger:visible').focus();
    await page.keyboard.press('Tab');
    await expect(handle(page, C)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(details(page)).toBeVisible();
    await expect(details(page).getByRole('button', { name: 'Move up' })).toBeVisible();
    await expect(details(page).getByRole('button', { name: 'Move down' })).toBeVisible();
  });

  test('phone headers are 144 px wide', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const widths = await page
      .locator('[role="rowheader"]')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(widths).toHaveLength(6);
    for (const width of widths) expect(Math.abs(width - 144)).toBeLessThanOrEqual(2);
  });
});

test.describe('auto-scroll at 390 × 600', () => {
  test.use({ viewport: { width: 390, height: 600 }, hasTouch: true });

  test('holding the row at the bottom edge scrolls the page', async ({ page }) => {
    await seedZones(page, seeded(SEVEN));
    await page.goto('/');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const toolbar = await page.getByRole('group', { name: 'Toolbar' }).boundingBox();
    if (!toolbar) throw new Error('no toolbar');
    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, A)));
    await touch.move({ x: grab.x, y: toolbar.y - 10 }, 10);
    await expect(row(page, A)).toHaveClass(/grid__row--lifted/);
    const before = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    // Back over the grid's last row, then release.
    const last = await centre(row(page, 'Asia/Singapore').locator('[role="rowheader"]'));
    await touch.move({ x: grab.x, y: last.y }, 4);
    await touch.end();
    await expect.poll(async () => (await storedIds(page)).indexOf('a')).toBeGreaterThan(0);
  });
});

test.describe('large text', () => {
  for (const viewport of [PHONE, { width: 320, height: 740 }]) {
    test.describe(`at ${viewport.width} px`, () => {
      test.use({ viewport, hasTouch: true });

      test('headers keep their width and handles wrap inside the grid', async ({ page }) => {
        await seedZones(page, seeded(FOUR));
        await page.goto('/');
        await setRootFontSize(page, '200%');
        const report = await grid(page).evaluate((root) => {
          const rect = root.getBoundingClientRect();
          const headers = [...root.querySelectorAll('[role="rowheader"]')].map(
            (el) => el.getBoundingClientRect().width,
          );
          const handles = [...root.querySelectorAll('[role="row"][data-id]')].map((el) => {
            const box = /** @type {Element} */ (
              el.querySelector('.grid__handle')
            ).getBoundingClientRect();
            const trigger = /** @type {Element} */ (
              el.querySelector('.grid__trigger:not(.grid__trigger--wide)')
            ).getBoundingClientRect();
            return {
              inside: box.left >= rect.left && box.right <= rect.right,
              width: box.width,
              height: box.height,
              wrapped: box.top >= trigger.bottom,
            };
          });
          return { headers, handles, visible: root.clientWidth - (headers[0] ?? 0) };
        });
        // At most 40% of the viewport (PRD 6.7), every header as wide as home's.
        for (const width of report.headers) {
          expect(width).toBeLessThanOrEqual(viewport.width * 0.4);
          expect(Math.abs(width - (report.headers[0] ?? 0))).toBeLessThanOrEqual(2);
        }
        if (viewport.width === 390) expect(report.visible).toBeGreaterThan(0);
        expect(report.handles).toHaveLength(4);
        for (const box of report.handles) {
          expect(box.inside).toBe(true);
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.wrapped).toBe(true);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBe(0);

        if (viewport.width !== 390) return;
        // Rows are taller than the space above the toolbar: bring C's handle
        // just above the toolbar, lift it, hold it at the top edge until the
        // page has scrolled A's midpoint into view, then drop above it.
        await handle(page, C).evaluate((el) => {
          const toolbar = /** @type {Element} */ (document.querySelector('.toolbar'));
          const room = toolbar.getBoundingClientRect().top - el.getBoundingClientRect().bottom;
          window.scrollBy(0, 60 - room);
        });
        const touch = await touchscreen(page);
        const mids = await midpoints(page);
        const grab = await touch.lift(await centre(handle(page, C)));
        const top = await gridTop(page);
        await touch.move({ x: grab.x, y: 10 });
        await expect.poll(() => aboveMid(page, mids, C, grab.y, top, A)).toBeGreaterThan(60);
        await touch.move({ x: grab.x, y: await aboveMid(page, mids, C, grab.y, top, A) }, 2);
        await touch.end();
        await expect.poll(() => userZones(page)).toEqual([C, A, B, D]);
      });
    });
  }
});

test.describe('mouse at 1280 px', () => {
  test.use({ viewport: DESKTOP });

  test('dragging the handle reorders; a click on it opens the details', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const mids = await midpoints(page);
    const top = await gridTop(page);
    const grab = await centre(handle(page, C));
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x, grab.y - LIFT_PX);
    const lifted = grab.y - LIFT_PX;
    await page.mouse.move(grab.x, await aboveMid(page, mids, C, lifted, top, A), { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => userZones(page)).toEqual([C, A, B, D]);
    await expect(details(page)).toBeHidden();

    await handle(page, B).click();
    await expect(details(page)).toBeVisible();
    await expect(details(page).getByRole('button', { name: 'Move up' })).toBeVisible();
    await expect(details(page).getByRole('button', { name: 'Move down' })).toBeVisible();
    await handle(page, B).click();
    await expect(details(page)).toBeHidden();

    await row(page, D)
      .locator('[role="rowheader"]')
      .click({ button: 'right', position: { x: 4, y: 4 } });
    await expect(details(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details(page)).toBeHidden();

    await row(page, A).locator('.grid__trigger:visible').click();
    await expect(details(page)).toBeVisible();
  });

  test('a mouse drag on hour cells scrolls and never reorders', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    const before = await scrollLeft(page);
    const track = await row(page, C).locator('.grid__track').boundingBox();
    const above = await row(page, A).locator('.grid__track').boundingBox();
    const gridBox = await grid(page).boundingBox();
    if (!track || !above || !gridBox) throw new Error('no box');
    const x = gridBox.x + gridBox.width - 100;
    await page.mouse.move(x, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(x - 200, above.y + above.height / 2, { steps: 10 });
    await page.mouse.up();
    expect(await scrollLeft(page)).not.toBe(before);
    expect(await userZones(page)).toEqual([A, B, C, D]);
  });

  test('handles are at least 44 px', async ({ page }) => {
    await seedZones(page, seeded(FOUR));
    await page.goto('/');
    for (const [, tz] of FOUR) {
      const box = await handle(page, tz).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`accessibility, ${colorScheme}`, () => {
    test.use({ colorScheme });

    for (const viewport of [PHONE, DESKTOP]) {
      test(`axe passes with four user rows at ${viewport.width} px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await seedZones(page, seeded(FOUR));
        await page.goto('/');
        await expect(page.locator('.grid__handle')).toHaveCount(4);
        await expectNoA11yViolations(page);
      });
    }
  });
}
