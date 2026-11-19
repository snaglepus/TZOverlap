// E2E: Edit mode (TZO-24): the Timelines card's Edit / Done button, each user
// row's Delete button and enlarged handle, the two-line header layout (also at
// large text), delete focus and Undo, the automatic end with no user rows,
// drag to reorder while editing, Esc order, announcements and accessibility.

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
const THREE = [
  ['a', A, 'New York'],
  ['b', B, 'Paris'],
  ['c', C, 'Kolkata'],
];
/** @type {[string, string, string][]} */
const FOUR = [...THREE, ['d', D, 'Tokyo']];

/** @param {[string, string, string][]} list */
const seeded = (list) => list.map(([id, tz, label]) => ({ id, kind: 'iana', tz, label }));

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/** @param {Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/** @param {Page} page @param {string} zone data-zone value */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {Page} page @param {string} zone */
const handle = (page, zone) => row(page, zone).locator('.grid__handle');

/** @param {Page} page */
const editButton = (page) => page.getByRole('button', { name: 'Edit time zones', exact: true });

/** @param {Page} page */
const doneButton = (page) =>
  page.getByRole('button', { name: 'Done editing time zones', exact: true });

/** @param {Page} page @param {string} name */
const deleteButton = (page, name) =>
  page.getByRole('button', { name: `Delete ${name}`, exact: true });

/** @param {Page} page */
const anyDelete = (page) => page.getByRole('button', { name: /^Delete / });

/** @param {Page} page */
const details = (page) => page.getByRole('group', { name: 'Time zone details' });

/** @param {Page} page */
const announcer = (page) => page.getByTestId('announcer');

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

/** @param {import('@playwright/test').Locator} locator @returns {Promise<Box>} */
async function box(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/** @param {import('@playwright/test').Locator} locator */
async function centre(locator) {
  const b = await box(locator);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** @param {Page} page */
async function expectEditing(page) {
  await expect(doneButton(page)).toBeVisible();
  await expect(doneButton(page)).toHaveText('Done', { useInnerText: true });
  await expect(editButton(page)).toHaveCount(0);
}

/** @param {Page} page */
async function expectNotEditing(page) {
  await expect(editButton(page)).toBeVisible();
  await expect(editButton(page)).toHaveText('Edit', { useInnerText: true });
  await expect(doneButton(page)).toHaveCount(0);
  await expect(anyDelete(page)).toHaveCount(0);
}

/**
 * The boxes of every user row's header, visible trigger, Delete button and
 * handle, and the grid's box.
 * @param {Page} page
 */
const headerLayout = (page) =>
  grid(page).evaluate((root) => {
    /** @param {Element | null} el */
    const rect = (el) => {
      if (!el) throw new Error('missing');
      const { left, right, top, bottom, width, height } = el.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const rows = [...root.querySelectorAll('[role="row"][data-id]')].map((el) => {
      const trigger = [...el.querySelectorAll('.grid__trigger')].find(
        (t) => getComputedStyle(t).display !== 'none',
      );
      return {
        header: rect(el.querySelector('.grid__header')),
        trigger: rect(trigger ?? null),
        remove: rect(el.querySelector('.grid__delete')),
        handle: rect(el.querySelector('.grid__handle')),
      };
    });
    return {
      grid: rect(root),
      rows,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

/** @typedef {{ left: number, right: number, top: number, bottom: number }} Rect */

/** @param {Rect} inner @param {Rect} outer */
function expectInside(inner, outer) {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 0.5);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 0.5);
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
 * Scroll the page so the grid sits near the viewport's top: the taller Edit-mode
 * rows then stay clear of the auto-scroll band above the phone toolbar.
 * @param {Page} page
 */
const gridToTop = (page) =>
  grid(page).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 8));

/** Click near the right edge of the home track: selects a slot. @param {Page} page */
async function selectSlot(page) {
  const track = await box(row(page, HOME).locator('.grid__track'));
  const g = await box(grid(page));
  await page.mouse.click(g.x + g.width - 40, track.y + track.height / 2);
  await expect(page.locator('.grid__selection')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

for (const viewport of [DESKTOP, PHONE]) {
  test.describe(`at ${viewport.width} px`, () => {
    test.use({ viewport });

    test('AC-1: Edit shows Delete buttons and enlarged handles; Done hides them', async ({
      page,
    }) => {
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await expectNotEditing(page);
      const handlesBefore = await Promise.all([A, B, C].map((z) => box(handle(page, z))));
      const homeBefore = await box(row(page, HOME));
      const everyoneBefore = await box(row(page, 'everyone'));

      await editButton(page).click();
      await expectEditing(page);
      for (const [i, [, zone, name]] of THREE.entries()) {
        const remove = deleteButton(page, name);
        await expect(remove).toBeVisible();
        await expect(row(page, zone).getByRole('button', { name: `Delete ${name}` })).toBeVisible();
        const r = await box(remove);
        expect(r.width).toBeGreaterThanOrEqual(44);
        expect(r.height).toBeGreaterThanOrEqual(44);
        const h = await box(handle(page, zone));
        const before = /** @type {Box} */ (handlesBefore[i]);
        expect(h.width).toBeGreaterThanOrEqual(44);
        expect(h.height).toBeGreaterThanOrEqual(44);
        expect(h.width).toBeGreaterThan(before.width);
        expect(h.height).toBeGreaterThan(before.height);
        expect(Math.round(h.width)).toBe(52);
        expect(Math.round(h.height)).toBe(52);
      }
      for (const zone of [HOME, 'everyone']) {
        await expect(row(page, zone).locator('.grid__delete')).toHaveCount(0);
        await expect(row(page, zone).locator('.grid__handle')).toHaveCount(0);
      }
      expect((await box(row(page, HOME))).height).toBe(homeBefore.height);
      expect((await box(row(page, 'everyone'))).height).toBe(everyoneBefore.height);

      await doneButton(page).click();
      await expectNotEditing(page);
      await expect(page.locator('.grid__delete:visible')).toHaveCount(0);
      for (const [i, zone] of [A, B, C].entries()) {
        const h = await box(handle(page, zone));
        const before = /** @type {Box} */ (handlesBefore[i]);
        expect(h.width).toBe(before.width);
        expect(h.height).toBe(before.height);
      }
    });

    test('AC-3: Delete removes the row, focuses the next Delete; Undo keeps the mode', async ({
      page,
    }) => {
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await editButton(page).click();
      await deleteButton(page, 'Paris').click();
      expect(await userZones(page)).toEqual([A, C]);
      const toast = page.locator('.toast');
      await expect(toast).toContainText('Removed Paris.');
      await expect(deleteButton(page, 'Kolkata')).toBeFocused();
      await expectEditing(page);

      await toast.getByRole('button', { name: 'Undo' }).click();
      await expect.poll(() => userZones(page)).toEqual([A, B, C]);
      await expect.poll(() => storedIds(page)).toEqual(['a', 'b', 'c']);
      await expectEditing(page);
      await expect(deleteButton(page, 'Paris')).toBeVisible();
    });

    test('deleting the last row focuses the previous row’s Delete', async ({ page }) => {
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await editButton(page).click();
      await deleteButton(page, 'Kolkata').click();
      expect(await userZones(page)).toEqual([A, B]);
      await expect(deleteButton(page, 'Paris')).toBeFocused();
    });

    test('AC-4: deleting the only row ends the mode; Undo shows Edit again', async ({ page }) => {
      await seedZones(page, seeded(THREE.slice(0, 1)));
      await page.goto('/');
      await editButton(page).click();
      await expectEditing(page);
      await deleteButton(page, 'New York').click();
      expect(await userZones(page)).toEqual([]);
      await expect(editButton(page)).toHaveCount(0);
      await expect(doneButton(page)).toHaveCount(0);
      await expect(anyDelete(page)).toHaveCount(0);
      await expect(announcer(page)).toHaveText('Finished editing time zones.');
      await expect(page.getByRole('button', { name: 'Add city', exact: true })).toBeFocused();

      await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
      await expect.poll(() => userZones(page)).toEqual([A]);
      await expectNotEditing(page);
    });

    test('AC-8: Esc leaves Edit mode, after a selection or popover has had its turn', async ({
      page,
    }) => {
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await editButton(page).click();
      await expectEditing(page);
      await page.keyboard.press('Shift+Escape');
      await expectEditing(page);
      await page.keyboard.press('Escape');
      await expectNotEditing(page);

      // A selection first, then the mode.
      await editButton(page).click();
      await selectSlot(page);
      await page.keyboard.press('Escape');
      await expect(page.locator('.grid__selection')).toBeHidden();
      await expectEditing(page);
      await page.keyboard.press('Escape');
      await expectNotEditing(page);

      // The details popover closes; the mode stays.
      await editButton(page).click();
      await row(page, B).locator('.grid__trigger:visible').click();
      await expect(details(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(details(page)).toBeHidden();
      await expectEditing(page);

      // Focus on a Delete button goes to the Edit button.
      await deleteButton(page, 'Paris').focus();
      await page.keyboard.press('Escape');
      await expectNotEditing(page);
      await expect(editButton(page)).toBeFocused();
    });

    test('AC-8: a tap or click on the trigger or handle still opens the details', async ({
      page,
    }) => {
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await editButton(page).click();
      await handle(page, B).click();
      await expect(details(page)).toBeVisible();
      await expect(details(page).getByRole('button', { name: 'Move up' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(details(page)).toBeHidden();
      await expectEditing(page);
    });

    test('AC-9: entering and leaving are announced', async ({ page }) => {
      await seedZones(page, seeded(THREE));
      await page.goto('/');
      await editButton(page).click();
      await expect(announcer(page)).toHaveText(
        'Editing time zones. Each row has a Delete button and a reorder handle.',
      );
      await doneButton(page).click();
      await expect(announcer(page)).toHaveText('Finished editing time zones.');
    });
  });
}

test.describe('phone layout', () => {
  test.use({ viewport: PHONE });

  test('AC-2: the trigger takes the first line, Delete and the handle the next', async ({
    page,
  }) => {
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    const rowsBefore = await Promise.all([A, B, C].map((z) => box(row(page, z))));
    await editButton(page).click();
    const { rows } = await headerLayout(page);
    expect(rows).toHaveLength(3);
    for (const [i, { header, trigger, remove, handle: grip }] of rows.entries()) {
      expect(Math.round(header.width)).toBe(144);
      for (const part of [trigger, remove, grip]) expectInside(part, header);
      expect(remove.top).toBeGreaterThanOrEqual(trigger.bottom);
      expect(grip.top).toBeGreaterThanOrEqual(trigger.bottom);
      expect(remove.left).toBeLessThanOrEqual(grip.left);
      // User rows grow taller.
      expect(header.height).toBeGreaterThan(/** @type {Box} */ (rowsBefore[i]).height);
    }
  });
});

test.describe('large text', () => {
  for (const viewport of [PHONE, { width: 320, height: 740 }]) {
    test.describe(`at ${viewport.width} px`, () => {
      test.use({ viewport, hasTouch: true });

      test('AC-2: Edit-mode controls stay inside the header and the visible grid', async ({
        page,
      }) => {
        await seedZones(page, seeded(FOUR));
        await page.goto('/');
        await setRootFontSize(page, '200%');
        await editButton(page).click();
        await expectEditing(page);
        const { grid: g, rows, overflow } = await headerLayout(page);
        expect(rows).toHaveLength(4);
        const home = await row(page, HOME)
          .locator('[role="rowheader"]')
          .evaluate((el) => el.getBoundingClientRect().width);
        for (const { header, trigger, remove, handle: grip } of rows) {
          // At most 40% of the viewport (PRD 6.7), as wide as the home header.
          expect(header.width).toBeLessThanOrEqual(viewport.width * 0.4);
          expect(Math.abs(header.width - home)).toBeLessThanOrEqual(2);
          for (const part of [trigger, remove, grip]) {
            expectInside(part, header);
            expect(part.left).toBeGreaterThanOrEqual(g.left);
            expect(part.right).toBeLessThanOrEqual(g.right);
          }
          for (const control of [remove, grip]) {
            expect(control.width).toBeGreaterThanOrEqual(44);
            expect(control.height).toBeGreaterThanOrEqual(44);
            expect(control.top).toBeGreaterThanOrEqual(trigger.bottom);
          }
          if (viewport.width === 320) expect(grip.top).toBeGreaterThanOrEqual(remove.bottom);
        }
        expect(overflow).toBe(0);
      });
    });
  }
});

/** The card header's and the Edit button's boxes, relative to the header. @param {Page} page */
const cardHeader = (page) =>
  page.locator('.card__header').evaluate((el) => {
    const header = el.getBoundingClientRect();
    const legend = /** @type {Element} */ (el.querySelector('.legend')).getBoundingClientRect();
    const toggle = /** @type {Element} */ (
      el.querySelector('.edit-toggle')
    ).getBoundingClientRect();
    // Whether the legend and the button fit side by side depends on the
    // fonts installed (DejaVu Sans on Linux CI is wider than SF or Roboto).
    const fits = legend.width + parseFloat(getComputedStyle(el).columnGap) + toggle.width;
    return {
      height: header.height,
      button: { x: toggle.x - header.x, y: toggle.y - header.y, width: toggle.width },
      sameLine: toggle.top <= legend.bottom && toggle.bottom >= legend.top,
      roomForBoth: fits <= el.clientWidth,
    };
  });

test.describe('card header', () => {
  for (const viewport of [PHONE, { width: 320, height: 740 }]) {
    for (const size of ['100%', '200%']) {
      test(`Edit and Done keep the header's layout at ${viewport.width} px, ${size} text`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await seedZones(page, seeded(THREE));
        await page.goto('/');
        await setRootFontSize(page, size);
        const before = await cardHeader(page);
        await editButton(page).click();
        await expectEditing(page);
        expect(await cardHeader(page)).toEqual(before);
        await doneButton(page).click();
        await expectNotEditing(page);
        expect(await cardHeader(page)).toEqual(before);
        // At 390 px with default text the button shares the legend's line
        // whenever the two fit side by side.
        if (viewport.width === PHONE.width && size === '100%') {
          expect(before.sameLine).toBe(before.roomForBoth);
        }
      });
    }
  }
});

test.describe('touch at 390 px', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test('AC-5: dragging an enlarged handle reorders and keeps the mode until reload', async ({
    page,
  }) => {
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    await editButton(page).click();
    await expectEditing(page);
    await gridToTop(page);

    const touch = await touchscreen(page);
    const mids = await midpoints(page);
    const top = await gridTop(page);
    const grab = await touch.lift(await centre(handle(page, A)));
    // The dragged row's centre 12 px below Kolkata's midpoint.
    const offset = grab.y - top - /** @type {number} */ (mids[A]);
    const target = (await gridTop(page)) + /** @type {number} */ (mids[C]) + 12 + offset;
    await touch.move({ x: grab.x, y: target }, 12);
    await touch.end();

    await expect.poll(() => userZones(page)).toEqual([B, C, A]);
    await expect.poll(() => storedIds(page)).toEqual(['b', 'c', 'a']);
    await expectEditing(page);

    await page.reload();
    await expect(row(page, A)).toBeVisible();
    expect(await userZones(page)).toEqual([B, C, A]);
    await expectNotEditing(page);
  });

  test('AC-8: Esc cancels a touch drag and keeps the mode', async ({ page }) => {
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    await editButton(page).click();
    await gridToTop(page);
    const touch = await touchscreen(page);
    const grab = await touch.lift(await centre(handle(page, A)));
    await touch.move({ x: grab.x, y: grab.y + 80 });
    await expect(row(page, A)).toHaveClass(/grid__row--lifted/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.grid__row--lifted')).toHaveCount(0);
    await touch.end();
    expect(await userZones(page)).toEqual([A, B, C]);
    await expectEditing(page);
  });
});

test.describe('mouse at 1280 px', () => {
  test.use({ viewport: DESKTOP });

  test('AC-8: Esc cancels a mouse drag and keeps the mode', async ({ page }) => {
    await seedZones(page, seeded(THREE));
    await page.goto('/');
    await editButton(page).click();
    const grab = await centre(handle(page, A));
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x, grab.y + LIFT_PX);
    await page.mouse.move(grab.x, grab.y + 80, { steps: 8 });
    await expect(row(page, A)).toHaveClass(/grid__row--lifted/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.grid__row--lifted')).toHaveCount(0);
    await page.mouse.up();
    expect(await userZones(page)).toEqual([A, B, C]);
    await expectEditing(page);
  });
});

test('AC-6: no Edit button without user rows, or with only a stored copy of home', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add city', exact: true })).toBeVisible();
  await expect(editButton(page)).toHaveCount(0);
});

test('AC-6: a stored copy of the home zone alone shows no Edit button', async ({ page }) => {
  await seedZones(page, [{ id: 'h', kind: 'iana', tz: HOME, label: 'Home' }]);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add city', exact: true })).toBeVisible();
  expect(await userZones(page)).toEqual([]);
  await expect(editButton(page)).toHaveCount(0);
});

test('AC-7: Edit mode is off after a reload', async ({ page }) => {
  await seedZones(page, seeded(THREE));
  await page.goto('/');
  await editButton(page).click();
  await expectEditing(page);
  await page.reload();
  await expect(row(page, A)).toBeVisible();
  await expectNotEditing(page);
});

for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`${colorScheme} scheme`, () => {
    test.use({ colorScheme });

    for (const viewport of [PHONE, DESKTOP]) {
      test(`AC-10: axe passes in Edit mode at ${viewport.width} px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await seedZones(page, seeded(THREE));
        await page.goto('/');
        await editButton(page).click();
        await expect(page.locator('.grid__delete:visible')).toHaveCount(3);
        await expectNoA11yViolations(page);
      });
    }
  });
}
