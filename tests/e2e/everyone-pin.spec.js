// E2E: the Everyone row stays in view at the bottom of the screen (TZO-34).
// While the grid runs past the visible bottom (the viewport's from --bp-md, the
// top of the phone toolbar or the docked selection bar below it) the row's header and track are raised to it,
// and settle back in place as the grid's end scrolls into view. Checks the
// rendered rects (the row's children), never the row element's own rect, which
// stays its natural place. Device in Sydney, clock fixed at 12:00 on
// Thu 29 Oct 2026, seven zones seeded, install hint dismissed. The US zones'
// clocks change on 1 Nov, so their headers carry a DST badge: with it the grid
// runs past the 1440x900 viewport.

import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, setRootFontSize } from './helpers.js';

/** Thursday 29 Oct 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-10-29T01:00:00Z');
const HOME = 'Australia/Sydney';
const ZONES = [
  'America/New_York',
  'Europe/London',
  'Asia/Kolkata',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Europe/Paris',
  'Asia/Dubai',
];
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
/** A shorter phone: at 390x844 seven zones fit (with the macOS fonts), so nothing pins there. */
const SHORT_PHONE = { width: 375, height: 667 };
/** A small phone with 200% text: the Everyone row is taller than the room under the home row. */
const TINY_PHONE = { width: 320, height: 568 };
const PINNED = [
  ['desktop', DESKTOP],
  ['short phone', SHORT_PHONE],
];

test.use({ timezoneId: HOME, locale: 'en-AU' });

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

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{ top: number, bottom: number }} Extent */

/** @param {Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {Page} page @param {string} zone */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {Page} page @param {string} zone */
const trigger = (page, zone) => row(page, zone).locator('.grid__trigger:visible');

/** @param {Page} page */
const menu = (page) => page.getByRole('group', { name: 'Time zone details' });

/** The data-zone of each user row, in order. @param {Page} page */
const userZones = (page) =>
  page
    .locator('[role="row"][data-id]')
    .evaluateAll((els) => els.map((el) => /** @type {HTMLElement} */ (el).dataset.zone));

/** Two animation frames: the pin's frame has run. @param {Page} page */
const frames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

/** --everyone-lift on the row, 0 when absent. @param {Page} page */
const lift = (page) =>
  row(page, 'everyone').evaluate(
    (el) => Number(/** @type {HTMLElement} */ (el).style.getPropertyValue('--everyone-lift')) || 0,
  );

/**
 * The Everyone row's rendered vertical extent and its parts' rects.
 * @param {Page} page
 */
const rendered = (page) =>
  page.evaluate(() => {
    const everyone = /** @type {HTMLElement} */ (document.querySelector('[data-zone="everyone"]'));
    const header = /** @type {HTMLElement} */ (everyone.querySelector(':scope > .grid__header'));
    const track = /** @type {HTMLElement} */ (everyone.querySelector(':scope > .grid__track'));
    const h = header.getBoundingClientRect();
    const t = track.getBoundingClientRect();
    return {
      top: Math.min(h.top, t.top),
      bottom: Math.max(h.bottom, t.bottom),
      headerTop: h.top,
      trackBottom: t.bottom,
    };
  });

/** @param {Page} page @param {string} selector */
const rectOf = (page, selector) =>
  page.locator(selector).evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    return { top, bottom };
  });

/** @param {Extent} a @param {Extent} b */
const disjoint = (a, b) => a.bottom <= b.top || b.bottom <= a.top;

/** @param {Page} page */
async function gridBottom(page) {
  return (await rectOf(page, '.grid')).bottom;
}

/** The grid's inner bottom: its rect bottom minus its bottom border. @param {Page} page */
const gridInnerBottom = (page) =>
  page.locator('.grid').evaluate((el) => {
    const border = parseFloat(getComputedStyle(el).borderBottomWidth);
    return el.getBoundingClientRect().bottom - border;
  });

/** Pinned: lifted, and the rendered row fully in the viewport. @param {Page} page */
async function expectPinned(page) {
  await expect.poll(() => lift(page)).toBeGreaterThan(0);
  const extent = await rendered(page);
  const height = await page.evaluate(() => innerHeight);
  expect(extent.top).toBeGreaterThanOrEqual(0);
  expect(extent.bottom).toBeLessThanOrEqual(height);
  return extent;
}

/** Scroll to the page bottom: the row is back in its place at the end of the grid. @param {Page} page */
async function expectSettledAtEnd(page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await frames(page);
  await expect.poll(() => lift(page)).toBe(0);
  const { trackBottom } = await rendered(page);
  expect(Math.abs(trackBottom - (await gridInnerBottom(page)))).toBeLessThanOrEqual(1);
}

/** A point on the home track, just right of the sticky header. @param {Page} page */
const homeTrackPoint = (page) =>
  page.evaluate(() => {
    const home = /** @type {HTMLElement} */ (document.querySelector('.grid > [role="row"]'));
    const header = /** @type {HTMLElement} */ (home.firstElementChild).getBoundingClientRect();
    const track = /** @type {HTMLElement} */ (home.lastElementChild).getBoundingClientRect();
    return { x: header.right + 40, y: (track.top + track.bottom) / 2 };
  });

/** @param {Page} page */
async function open(page) {
  await page.goto('/');
  await expect(grid(page)).toBeVisible();
  await frames(page);
}

/** The header trigger's bottom is clear of the Everyone header, or nothing is pinned. @param {Page} page */
async function expectClear(page) {
  await frames(page);
  const bottom = await page.evaluate(
    () => /** @type {HTMLElement} */ (document.activeElement).getBoundingClientRect().bottom,
  );
  const { headerTop } = await rendered(page);
  if ((await lift(page)) > 0) expect(bottom).toBeLessThanOrEqual(headerTop + 0.5);
}

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('AC-2: pinned to the viewport bottom, settled at the end', async ({ page }) => {
    await open(page);
    expect(await gridBottom(page)).toBeGreaterThan(DESKTOP.height);
    const extent = await expectPinned(page);
    expect(Math.abs(extent.trackBottom - DESKTOP.height)).toBeLessThanOrEqual(1);
    await expectSettledAtEnd(page);
  });

  test('AC-3: no jump as the grid end crosses the viewport bottom', async ({ page }) => {
    await open(page);
    const start = await gridBottom(page);
    /** @param {number} below px the grid bottom is below the viewport bottom */
    const at = async (below) => {
      await page.evaluate((y) => window.scrollTo(0, y), start - DESKTOP.height - below);
      await frames(page);
      expect(Math.abs((await gridBottom(page)) - DESKTOP.height - below)).toBeLessThanOrEqual(0.5);
      return (await rendered(page)).headerTop;
    };
    const below = await at(1);
    const above = await at(-1);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(3);
  });

  test('AC-9: Tab onto the last user row’s trigger leaves it clear', async ({ page }) => {
    await open(page);
    await expectPinned(page);
    const last = /** @type {string} */ (ZONES.at(-1));
    const { headerTop } = await rendered(page);
    const { bottom } = await rectOf(page, `[data-zone="${last}"]`);
    expect(bottom).toBeGreaterThan(headerTop);
    // Start from the previous row's trigger, then Tab forward to the last row's.
    await trigger(page, /** @type {string} */ (ZONES.at(-2))).evaluate((el) =>
      /** @type {HTMLElement} */ (el).focus({ preventScroll: true }),
    );
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      if (await trigger(page, last).evaluate((el) => el === document.activeElement)) break;
    }
    await expect(trigger(page, last)).toBeFocused();
    await expectClear(page);
  });
});

test.describe('phone', () => {
  test.use({ viewport: PHONE });

  test('AC-4: in view above the toolbar at 390x844, settled at the end', async ({ page }) => {
    await open(page);
    const toolbar = await rectOf(page, '.toolbar');
    // Seven zones fit with the macOS fonts; Linux's wider DejaVu Sans runs the grid past the toolbar.
    if ((await gridBottom(page)) <= toolbar.top) expect(await lift(page)).toBe(0);
    else await expectPinned(page);
    const extent = await rendered(page);
    expect(extent.top).toBeGreaterThanOrEqual(0);
    expect(extent.bottom).toBeLessThanOrEqual(PHONE.height);
    expect(extent.bottom).toBeLessThanOrEqual(toolbar.top);
    await expectSettledAtEnd(page);
  });
});

test.describe('short phone', () => {
  test.use({ viewport: SHORT_PHONE });

  test('AC-5: pinned above the toolbar, settled at the end', async ({ page }) => {
    await open(page);
    const toolbar = await rectOf(page, '.toolbar');
    expect(await gridBottom(page)).toBeGreaterThan(toolbar.top);
    const extent = await expectPinned(page);
    expect(Math.abs(extent.trackBottom - toolbar.top)).toBeLessThanOrEqual(1);
    expect(disjoint(extent, toolbar)).toBe(true);
    await expectSettledAtEnd(page);
  });
});

test.describe('tiny phone, 200% text', () => {
  test.use({ viewport: TINY_PHONE });

  test('no pin when the row can’t fit under the home row', async ({ page }) => {
    await open(page);
    await setRootFontSize(page, '200%');
    await frames(page);
    await frames(page);
    const toolbar = await rectOf(page, '.toolbar');
    const home = await rectOf(page, `[data-zone="${HOME}"]`);
    const natural = await rectOf(page, '[data-zone="everyone"]');
    // Precondition: the grid runs past the toolbar, and the row would only
    // reach the toolbar top by rising over the home row.
    expect(await gridBottom(page)).toBeGreaterThan(toolbar.top);
    expect(natural.bottom - natural.top).toBeGreaterThan(toolbar.top - home.bottom);
    expect(await lift(page)).toBe(0);
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--everyone-pin-room'),
      ),
    ).toBe('');
    // In its natural place, so never over the home row.
    const extent = await rendered(page);
    expect(Math.abs(extent.top - natural.top)).toBeLessThanOrEqual(1);
    expect(extent.top).toBeGreaterThanOrEqual(home.bottom);
  });

  test('pinned with no room for a raised toast: the toast keeps its usual place', async ({
    page,
  }) => {
    await open(page);
    await setRootFontSize(page, '200%');
    await frames(page);
    await trigger(page, /** @type {string} */ (ZONES[0])).click();
    await menu(page).getByRole('button', { name: 'Delete', exact: true }).click();
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    // Scroll the home row off the top: the row now fits under it, so it pins.
    const home = await rectOf(page, `[data-zone="${HOME}"]`);
    await page.evaluate((y) => window.scrollBy(0, y), home.bottom);
    await frames(page);
    const extent = await expectPinned(page);
    const room = await page.evaluate(() => ({
      pin: Number(document.documentElement.style.getPropertyValue('--everyone-pin-room')),
      toast: document.documentElement.style.getPropertyValue('--everyone-toast-room'),
      half: innerHeight / 2,
    }));
    // Precondition: the pinned row and the toolbar take over half the viewport.
    expect(room.pin).toBeGreaterThan(room.half);
    expect(room.toast).toBe('');
    // Its usual place: directly above the toolbar, over the pinned row.
    const toolbar = await rectOf(page, '.toolbar');
    const t = await rectOf(page, '.toast');
    expect(t.bottom).toBeLessThanOrEqual(toolbar.top);
    expect(t.bottom).toBeGreaterThan(extent.top);
  });
});

for (const [name, viewport] of /** @type {[string, {width: number, height: number}][]} */ (
  PINNED
)) {
  test.describe(`${name} while pinned`, () => {
    test.use({ viewport });

    test('AC-6: Everyone segments line up with the home columns', async ({ page }) => {
      await open(page);
      await expectPinned(page);
      const aligned = () =>
        page.evaluate(() => {
          const home = /** @type {HTMLElement} */ (
            document.querySelector('.grid__row[data-zone]:first-child > .grid__track')
          );
          const track = /** @type {HTMLElement} */ (
            document.querySelector('[data-zone="everyone"] > .grid__track')
          );
          const segment = [...track.children].find((el) =>
            home.querySelector(
              `:scope > [data-start="${/** @type {HTMLElement} */ (el).dataset.start}"]`,
            ),
          );
          const cell = /** @type {HTMLElement} */ (
            home.querySelector(
              `:scope > [data-start="${/** @type {HTMLElement} */ (segment).dataset.start}"]`,
            )
          );
          const a = home.getBoundingClientRect();
          const b = track.getBoundingClientRect();
          return {
            segment:
              /** @type {HTMLElement} */ (segment).getBoundingClientRect().left -
              cell.getBoundingClientRect().left,
            left: b.left - a.left,
            width: b.width - a.width,
          };
        });
      /** @param {Awaited<ReturnType<typeof aligned>>} d */
      const expectAligned = (d) => {
        expect(Math.abs(d.segment)).toBeLessThanOrEqual(1);
        expect(Math.abs(d.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(d.width)).toBeLessThanOrEqual(1);
      };
      const root = page.locator('.grid');
      const hours = () =>
        root.evaluate((el) => getComputedStyle(el).getPropertyValue('--grid-hours'));
      await root.evaluate((el) => {
        const column = /** @type {HTMLElement} */ (el.querySelector('.grid__cell')).offsetWidth;
        el.scrollLeft += 5 * column;
      });
      await frames(page);
      expectAligned(await aligned());
      // Scrolling to the end extends the window by a day.
      const before = await hours();
      await root.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await expect.poll(hours).not.toBe(before);
      await frames(page);
      await expectPinned(page);
      expectAligned(await aligned());
    });

    test('AC-10: focus after Move down, Undo and an Edit-mode delete is clear', async ({
      page,
    }) => {
      await open(page);
      await expectPinned(page);
      const secondLast = /** @type {string} */ (ZONES.at(-2));
      const last = /** @type {string} */ (ZONES.at(-1));

      await trigger(page, secondLast).click();
      await menu(page).getByRole('button', { name: 'Move down', exact: true }).click();
      await expect(trigger(page, secondLast)).toBeFocused();
      expect((await userZones(page)).at(-1)).toBe(secondLast);
      await expectClear(page);

      await page.evaluate(() => window.scrollTo(0, 0));
      await frames(page);
      await trigger(page, secondLast).click();
      await menu(page).getByRole('button', { name: 'Delete', exact: true }).click();
      const toast = page.locator('.toast');
      await toast.getByRole('button', { name: 'Undo' }).click();
      await expect(trigger(page, secondLast)).toBeFocused();
      await expectClear(page);

      await page.evaluate(() => window.scrollTo(0, 0));
      await frames(page);
      await page.getByRole('button', { name: 'Edit time zones', exact: true }).click();
      // The second-to-last row is now `last` (moved up above).
      await page.getByRole('button', { name: `Delete ${last.split('/')[1]}`, exact: true }).click();
      await expect(
        page.getByRole('button', { name: `Delete ${secondLast.split('/')[1]}`, exact: true }),
      ).toBeFocused();
      await expectClear(page);
    });

    test('AC-11: a drop over the pinned row lands last', async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: 'Edit time zones', exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await frames(page);
      await expectPinned(page);
      const first = /** @type {string} */ (ZONES[0]);
      const handle = await row(page, first).locator('.grid__handle').boundingBox();
      if (!handle) throw new Error('no handle');
      const target = await page.evaluate(() => {
        const root = /** @type {HTMLElement} */ (document.querySelector('.grid'));
        const everyone = /** @type {HTMLElement} */ (root.querySelector('[data-zone="everyone"]'));
        const header = /** @type {HTMLElement} */ (
          everyone.querySelector(':scope > .grid__header')
        );
        const track = /** @type {HTMLElement} */ (everyone.querySelector(':scope > .grid__track'));
        const g = root.getBoundingClientRect();
        const t = track.getBoundingClientRect();
        const toolbar = /** @type {HTMLElement} */ (document.querySelector('.toolbar'));
        const bar = toolbar.getBoundingClientRect();
        const fixed = getComputedStyle(toolbar).position === 'fixed';
        const left = header.getBoundingClientRect().right;
        const right = g.left + root.clientLeft + root.clientWidth;
        const top = Math.max(t.top, 0);
        const bottom = Math.min(t.bottom, innerHeight, fixed ? bar.top : innerHeight);
        return {
          x: (left + right) / 2,
          y: (top + bottom) / 2,
          natural: everyone.getBoundingClientRect().top,
        };
      });
      expect(target.y).toBeLessThan(target.natural);
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 10 });
      await page.mouse.up();
      await expect.poll(() => userZones(page)).toEqual([...ZONES.slice(1), first]);
      const stored = () =>
        page.evaluate(() =>
          /** @type {{ tz: string }[]} */ (
            JSON.parse(localStorage.getItem('tzoverlap.state') ?? '{}').zones
          ).map((z) => z.tz),
        );
      await expect.poll(stored).toEqual([...ZONES.slice(1), first]);
      const lastRow = await page.locator('.grid > [role="row"]').last().getAttribute('data-zone');
      expect(lastRow).toBe('everyone');
    });

    test('AC-12: focusing the grid root never scrolls the page', async ({ page }) => {
      await open(page);
      await expectPinned(page);
      const scrollY = () => page.evaluate(() => window.scrollY);
      const start = await scrollY();
      const { x, y } = await homeTrackPoint(page);

      await page.mouse.click(x, y);
      await frames(page);
      await expect(page.locator('.selection-bar')).toBeVisible();
      expect(await scrollY()).toBe(start);

      const left = await grid(page).evaluate((el) => el.scrollLeft);
      await page.mouse.move(x + 100, y);
      await page.mouse.down();
      await page.mouse.move(x, y, { steps: 10 });
      await page.mouse.up();
      await frames(page);
      expect(await grid(page).evaluate((el) => el.scrollLeft)).not.toBe(left);
      expect(await scrollY()).toBe(start);

      await page.keyboard.press('Escape');
      await frames(page);
      await expect(page.locator('.selection-bar')).toBeHidden();
      expect(await scrollY()).toBe(start);

      await page.mouse.click(x, y);
      await frames(page);
      await expect(page.locator('.selection-bar')).toBeVisible();
      // A script click: Playwright's own would scroll the button into view first.
      await page
        .getByRole('button', { name: 'Clear selection' })
        .evaluate((el) => /** @type {HTMLElement} */ (el).click());
      await frames(page);
      await expect(page.locator('.selection-bar')).toBeHidden();
      await expect(grid(page)).toBeFocused();
      expect(await scrollY()).toBe(start);
    });

    test('AC-13: one Everyone row, nine rows', async ({ page }) => {
      await open(page);
      await expectPinned(page);
      await expect(page.locator('[data-zone="everyone"]')).toHaveCount(1);
      await expect(grid(page).getByRole('row')).toHaveCount(9);
    });

    for (const scheme of /** @type {const} */ (['light', 'dark'])) {
      test(`AC-14: axe is clean while pinned, ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page);
        await expectPinned(page);
        await expectNoA11yViolations(page);
      });
    }
  });
}

for (const [name, viewport] of /** @type {[string, {width: number, height: number}][]} */ ([
  ['phone', PHONE],
  ['short phone', SHORT_PHONE],
])) {
  test.describe(`${name}: other bottom content`, () => {
    test.use({ viewport });

    test('AC-7: the row never covers the toolbar or the selection bar', async ({ page }) => {
      await open(page);
      const { x, y } = await homeTrackPoint(page);
      await page.mouse.click(x, y);
      const bar = page.locator('.selection-bar');
      await expect(bar).toBeVisible();
      await frames(page);
      const check = async () => {
        const extent = await rendered(page);
        expect(disjoint(extent, await rectOf(page, '.toolbar'))).toBe(true);
        expect(disjoint(extent, await rectOf(page, '.selection-bar'))).toBe(true);
      };
      await check();
      await bar.scrollIntoViewIfNeeded();
      await frames(page);
      await check();
    });

    test('AC-8: a toast sits clear of the row and the toolbar', async ({ page }) => {
      await open(page);
      await trigger(page, /** @type {string} */ (ZONES[0])).click();
      await menu(page).getByRole('button', { name: 'Delete', exact: true }).click();
      const toast = page.locator('.toast');
      await expect(toast).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await frames(page);
      if (viewport === SHORT_PHONE) await expectPinned(page);
      await expect
        .poll(async () => {
          const t = await rectOf(page, '.toast');
          const extent = await rendered(page);
          return (
            disjoint(t, extent) &&
            disjoint(t, await rectOf(page, '.toolbar')) &&
            (viewport !== SHORT_PHONE || t.bottom <= extent.top)
          );
        })
        .toBe(true);
    });
  });
}

test.describe('short phone with a selection', () => {
  test.use({ viewport: SHORT_PHONE });

  test('a toast sits clear of the row and the docked selection bar', async ({ page }) => {
    await open(page);
    const { x, y } = await homeTrackPoint(page);
    await page.mouse.click(x, y);
    await expect(page.locator('.selection-bar')).toBeVisible();
    await trigger(page, /** @type {string} */ (ZONES[0])).click();
    await menu(page).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.toast')).toBeVisible();
    await expect(page.locator('.selection-bar')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page);
    await expectPinned(page);
    await expect
      .poll(async () => {
        const t = await rectOf(page, '.toast');
        const bar = await rectOf(page, '.selection-bar');
        const extent = await rendered(page);
        return (
          disjoint(extent, bar) &&
          disjoint(t, extent) &&
          disjoint(t, bar) &&
          disjoint(t, await rectOf(page, '.toolbar')) &&
          t.bottom <= extent.top
        );
      })
      .toBe(true);
  });
});
