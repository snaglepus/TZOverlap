// E2E: the responsive matrix (TZO-25, PRD 6.3, 6.7, 10.2, AC-12, AC-13). One
// populated state (a long name, Kathmandu's +5:45, the DST banner, the Good
// filter, a selected slot and a toast) at phone, tablet and desktop sizes, at
// 100% and 200% root font size, in Light and Dark: one page load each, every
// check on that load, including reduced motion and increased contrast. Then
// phone landscape against portrait. Device in London, clock fixed at 10:00 on
// Mon 2 Mar 2026; the shown date is Fri 20 Mar, after New York's clock change
// (the banner) and nine days before London's (the home row's warning).

import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, seedZones, setRootFontSize } from './helpers.js';

const TODAY = new Date('2026-03-02T10:00:00Z');
const SHOWN = '2026-03-20';
const HOME = 'Europe/London';
const LONG = 'Tokyo office, Shibuya product design team';
const ZONES = [
  { id: 'a', kind: 'iana', tz: 'America/New_York', label: 'New York' },
  { id: 'b', kind: 'iana', tz: 'Asia/Kathmandu', label: 'Kathmandu' },
  { id: 'c', kind: 'iana', tz: 'Asia/Tokyo', label: LONG },
  { id: 'd', kind: 'iana', tz: 'Australia/Sydney', label: 'Sydney' },
  // Deleted during set-up: its Undo toast is the toast.
  { id: 'e', kind: 'iana', tz: 'Europe/Paris', label: 'Paris' },
];

/** Each row's full name, by data-zone. @type {Record<string, string>} */
const FULL_NAMES = {
  [HOME]: 'London',
  everyone: 'Everyone',
  ...Object.fromEntries(ZONES.map((z) => [z.tz, z.label])),
};

/** Viewports of the matrix; `controls` runs the reachable-controls checks, `text` the text checks. */
const VIEWPORTS = [
  { width: 320, height: 568, controls: 'all', text: true },
  { width: 375, height: 667, controls: 'none', text: true },
  { width: 390, height: 844, controls: 'none', text: true },
  { width: 430, height: 932, controls: 'none', text: true },
  { width: 820, height: 1180, controls: 'page', text: false },
  { width: 1440, height: 900, controls: 'page', text: false },
];

/** Row header widths at default text: 144px on phones, 180px from --bp-md, 220px from --bp-lg. */
/** @param {number} width */
const defaultHeaderWidth = (width) => (width >= 1024 ? 220 : width >= 640 ? 180 : 144);

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

/** @param {Page} page @param {string} zone data-zone value */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {Page} page */
const toast = (page) => page.locator('.toast');

/** @param {Page} page */
const bar = (page) => page.getByRole('group', { name: 'Selected time' });

/**
 * Load the populated state: seeded zones, the shown date (DST banner), the
 * Good filter, a deleted row (its Undo toast) and a selected slot. The pointer
 * ends on the toast, which keeps it up while the checks run.
 * @param {Page} page
 * @param {string} fontSize root font size, set before anything is measured or fitted
 */
async function populate(page, fontSize) {
  await page.clock.setFixedTime(TODAY);
  await seedZones(page, ZONES);
  await page.goto('/');
  await expect(page.getByRole('grid')).toBeVisible();
  await setRootFontSize(page, fontSize);

  const date = page.locator('.toolbar input[type="date"]');
  await date.fill(SHOWN);
  await expect(date).toHaveValue(SHOWN);
  await expect(page.locator('main > .banner .banner__message')).toContainText('clocks go forward');

  await page.locator('.toolbar .segmented__option', { hasText: 'Good' }).click();
  await expect(page.getByRole('radio', { name: 'Good' })).toBeChecked();

  await row(page, 'Europe/Paris').locator('.grid__trigger:visible').click();
  await page
    .getByRole('group', { name: 'Time zone details' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(toast(page)).toContainText('Removed Paris.');

  await row(page, HOME).locator('[role="gridcell"][tabindex="0"]').focus();
  await page.keyboard.press('Enter');
  await expect(bar(page)).toBeVisible();
  await expect(page.locator('.grid__selection')).toBeVisible();

  await toast(page).hover();
}

/**
 * Descendants of `scope` (fixed or clipped, so page overflow misses them) that
 * pass its inline edges by more than 1 px.
 * @param {Locator} scope
 */
const outside = (scope) =>
  scope.evaluate((root) => {
    const box = root.getBoundingClientRect();
    return [...root.querySelectorAll('*')]
      .filter((el) => el.checkVisibility() && !el.closest('.visually-hidden'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1);
      })
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
  });

/**
 * Scrolled to the end, how far the footer's bottom passes the fixed toolbar's
 * top (px); the scroll position is restored.
 * @param {Page} page
 */
const footerUnderToolbar = (page) =>
  page.evaluate(() => {
    const y = window.scrollY;
    window.scrollTo(0, document.documentElement.scrollHeight);
    const footer = /** @type {Element} */ (document.querySelector('.shell__footer'));
    const toolbar = /** @type {Element} */ (document.querySelector('.toolbar'));
    const over = footer.getBoundingClientRect().bottom - toolbar.getBoundingClientRect().top;
    window.scrollTo(0, y);
    return over;
  });

/** @param {Page} page */
const pageOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * Every visible text element (own non-whitespace text, not screen-reader
 * text) that overflows its box, apart from city names; and each city name's
 * overflow, ellipsis and row.
 * @param {Page} page
 */
const textReport = (page) =>
  page.evaluate(() => {
    /** @param {Element} el */
    const describe = (el) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${el.textContent?.trim().slice(0, 40)}"`;
    const overflowing = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest('.visually-hidden, .grid__name')) continue;
      const own = [...el.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (!own || !el.checkVisibility({ visibilityProperty: true })) continue;
      if (el.scrollWidth > el.clientWidth + 1) overflowing.push(describe(el));
    }
    const names = [...document.querySelectorAll('.grid__name')]
      .filter((el) => el.checkVisibility({ visibilityProperty: true }))
      .map((el) => ({
        zone: /** @type {HTMLElement} */ (el.closest('[role="row"]')).dataset.zone ?? '',
        truncated: el.scrollWidth > el.clientWidth + 1,
        ellipsis: getComputedStyle(el).textOverflow === 'ellipsis',
      }));
    return { overflowing, names };
  });

/**
 * Pairs of text boxes that overlap by more than 1 px inside a row header:
 * each visible text node's line fragments against every other node's.
 * @param {Page} page
 */
const headerOverlaps = (page) =>
  page.locator('[role="rowheader"]').evaluateAll((headers) =>
    headers.flatMap((header) => {
      /** @type {{ text: string, rects: DOMRect[] }[]} */
      const boxes = [];
      const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!node.textContent?.trim() || !parent) continue;
        if (parent.closest('.visually-hidden')) continue;
        if (!parent.checkVisibility({ visibilityProperty: true })) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        boxes.push({ text: node.textContent.trim(), rects: [...range.getClientRects()] });
      }
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = /** @type {(typeof boxes)[number]} */ (boxes[i]);
          const b = /** @type {(typeof boxes)[number]} */ (boxes[j]);
          const hit = a.rects.some((p) =>
            b.rects.some(
              (q) =>
                Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 &&
                Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1,
            ),
          );
          if (hit) overlaps.push(`${a.text} / ${b.text}`);
        }
      }
      return overlaps;
    }),
  );

/**
 * The message is at most two lines tall and not clipped.
 * @param {Locator} message
 */
async function expectTwoLinesAtMost(message) {
  const box = await message.evaluate((el) => {
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    return {
      height: el.getBoundingClientRect().height,
      max: 2 * lineHeight + 1,
      clippedX: el.scrollWidth > el.clientWidth + 1,
      clippedY: el.scrollHeight > el.clientHeight + 1,
    };
  });
  expect(box.height).toBeLessThanOrEqual(box.max);
  expect(box.clippedX).toBe(false);
  expect(box.clippedY).toBe(false);
}

/** Each grid row's height by data-zone. @param {Page} page */
const rowHeights = (page) =>
  page
    .locator('[role="row"][data-zone]')
    .evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((el) => [
          /** @type {HTMLElement} */ (el).dataset.zone,
          el.getBoundingClientRect().height,
        ]),
      ),
    );

/** @param {Page} page */
const homeHeaderWidth = (page) =>
  row(page, HOME)
    .locator('[role="rowheader"]')
    .evaluate((el) => el.getBoundingClientRect().width);

/**
 * Every visible, enabled control in `scope` passes the click actionability
 * checks (scrolled into view, nothing covering it), and with `size` its hit
 * target is at least 44 × 44. A native input inside a label (a visually hidden
 * radio, a switch) is measured and checked by that label. The controls are
 * listed and measured in one call, then trial-clicked one by one.
 * @param {Locator} scope
 * @param {{ size: boolean }} options
 */
async function expectReachable(scope, { size }) {
  const controls = scope.locator(
    ':is(button, a[href], input, select, textarea):not(.shell__skip):not(:disabled)',
  );
  const found = await controls.evaluateAll((els) =>
    els.map((el, index) => {
      const inLabel = el.matches('input') && !!el.closest('label');
      const target = inLabel ? /** @type {Element} */ (el.closest('label')) : el;
      const { width, height } = target.getBoundingClientRect();
      return {
        index,
        inLabel,
        visible: target.checkVisibility({ visibilityProperty: true }) && width > 0 && height > 0,
        name:
          target.getAttribute('aria-label') ||
          target.textContent?.trim() ||
          target.outerHTML.slice(0, 60),
        width,
        height,
      };
    }),
  );
  const shown = found.filter((c) => c.visible);
  expect(shown.length).toBeGreaterThan(0);
  for (const c of shown) {
    const control = controls.nth(c.index);
    const target = c.inLabel ? control.locator('xpath=ancestor::label[1]') : control;
    await target.click({ trial: true, timeout: 5000 });
    if (!size) continue;
    expect(c.width, `${c.name} width`).toBeGreaterThanOrEqual(44);
    expect(c.height, `${c.name} height`).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Under reduced motion every element's transitions and animations take no
 * time and the lifted row keeps its size; under increased contrast borders
 * take the strong border colour.
 * @param {Page} page
 */
async function expectPreferences(page) {
  const motion = await page.evaluate(() => {
    const zero = (/** @type {string} */ list) => list.split(',').every((d) => parseFloat(d) === 0);
    const moving = [...document.querySelectorAll('*')]
      .filter((el) => {
        const style = getComputedStyle(el);
        return !zero(style.transitionDuration) || !zero(style.animationDuration);
      })
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
    const root = getComputedStyle(document.documentElement);
    return { moving, liftScale: root.getPropertyValue('--lift-scale').trim() };
  });
  expect(motion.moving).toEqual([]);
  expect(motion.liftScale).toBe('1');
  const colours = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      border: root.getPropertyValue('--color-border').trim(),
      strong: root.getPropertyValue('--color-border-strong').trim(),
    };
  });
  expect(colours.border).toBe(colours.strong);
}

for (const viewport of VIEWPORTS) {
  for (const fontSize of ['100%', '200%']) {
    for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
      test.describe(`${viewport.width}×${viewport.height}, ${fontSize} text, ${colorScheme}`, () => {
        test.use({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme,
          timezoneId: HOME,
        });

        test('the populated state fits, reads and passes axe', async ({ page }) => {
          test.setTimeout(90_000);
          await populate(page, fontSize);
          await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

          // AC-12: only the grid scrolls sideways.
          expect(await pageOverflow(page)).toBe(0);

          // Header width: 40% of the viewport at most at large text; unchanged at default.
          const headerWidth = await homeHeaderWidth(page);
          if (fontSize === '200%') {
            expect(headerWidth).toBeLessThanOrEqual(viewport.width * 0.4);
          } else {
            expect(Math.abs(headerWidth - defaultHeaderWidth(viewport.width))).toBeLessThanOrEqual(
              1,
            );
          }

          if (viewport.width >= 640) {
            // Tall enough for the wide header: its trigger and details show.
            const wide = row(page, 'Asia/Kathmandu');
            await expect(wide.locator('.grid__trigger--wide')).toBeVisible();
            await expect(wide.locator('.grid__details')).toBeVisible();
            await expect(wide.locator('.grid__trigger:not(.grid__trigger--wide)')).toBeHidden();
            await expect(row(page, HOME).locator('button.grid__warning')).toBeVisible();
          }

          if (viewport.text) {
            // AC-13: nothing but city names overflows; those truncate with an
            // ellipsis and keep the full name in the accessible name.
            const report = await textReport(page);
            expect(report.overflowing).toEqual([]);
            const truncated = report.names.filter((n) => n.truncated);
            expect(truncated.map((n) => n.zone)).toContain('Asia/Tokyo');
            for (const name of truncated) {
              expect(name.ellipsis, name.zone).toBe(true);
              const full = FULL_NAMES[name.zone];
              expect(full, name.zone).toBeDefined();
              await expect(row(page, name.zone).locator('[role="rowheader"]')).toHaveAccessibleName(
                new RegExp(full ?? ''),
              );
            }
            expect(await headerOverlaps(page)).toEqual([]);
            // The fixed phone toolbar: every part inside the viewport, and
            // scrolled to the end the footer ends above it.
            expect(await outside(page.getByRole('group', { name: 'Toolbar' }))).toEqual([]);
            expect(await footerUnderToolbar(page)).toBeLessThanOrEqual(1);
            await expectTwoLinesAtMost(page.locator('main > .banner .banner__message'));
            await expectTwoLinesAtMost(page.locator('.toast__message'));
          }

          // At 320×568 with 200% text the toolbar wraps to four rows and
          // leaves less room above it than the toast needs, so while the toast
          // shows it covers the page above the toolbar and the toolbar's first
          // row (a follow-up: the toolbar needs a large-text layout). There
          // the toast's own controls are checked now, the page's once it goes.
          // Reachability and hit targets don't depend on the theme, so they
          // run on the Light load only: at 320 px at both text sizes, at 820
          // and 1440 px at default text.
          const controls =
            colorScheme === 'dark' || (viewport.controls === 'page' && fontSize !== '100%')
              ? 'none'
              : viewport.controls;
          const crowded = controls !== 'none' && viewport.width === 320 && fontSize === '200%';
          if (crowded) {
            const [t, bar] = await Promise.all([
              toast(page).boundingBox(),
              page.getByRole('group', { name: 'Toolbar' }).boundingBox(),
            ]);
            expect(t && bar && t.y + t.height > bar.y).toBe(true);
            await expectReachable(toast(page), { size: false });
          } else if (controls !== 'none') {
            // AC-12: every control on the page, row headers included (from
            // --bp-md the wide triggers and the home row's clock-change button).
            await expectReachable(page.locator('body'), { size: fontSize === '100%' });
          }

          await expect(toast(page)).toBeVisible();
          await expectNoA11yViolations(page);

          if (fontSize === '200%') {
            // Rows grow taller at large text: compare with 100% in the same state.
            const large = await rowHeights(page);
            await setRootFontSize(page, '100%');
            const normal = await rowHeights(page);
            await setRootFontSize(page, fontSize);
            for (const [zone, height] of Object.entries(large)) {
              expect(height, zone).toBeGreaterThan(/** @type {number} */ (normal[zone]));
            }
          }

          // Same load, with reduced motion and increased contrast.
          const before = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim(),
          );
          await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
          await expectPreferences(page);
          expect(
            await page.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim(),
            ),
          ).not.toBe(before);
          await expect(toast(page)).toBeVisible();
          await expectNoA11yViolations(page);

          if (controls !== 'all') return;
          const size = fontSize === '100%';
          if (crowded) {
            // Undo takes the toast away (and puts Paris back).
            await toast(page).getByRole('button', { name: 'Undo' }).click();
            await expect(toast(page)).toBeHidden();
            await expectReachable(page.locator('body'), { size });
          }
          // The rest of the controls at 320 px: a row popover, Edit mode, then
          // the sheets, opened from the keyboard.
          await row(page, 'Asia/Kathmandu').locator('.grid__trigger:visible').focus();
          await page.keyboard.press('Enter');
          const popover = page.getByRole('group', { name: 'Time zone details' });
          await expect(popover).toBeVisible();
          // Above the fixed toolbar, scrolling when taller than the room there.
          const [pop, bar] = await Promise.all([
            popover.boundingBox(),
            page.getByRole('group', { name: 'Toolbar' }).boundingBox(),
          ]);
          expect(pop && bar && pop.y + pop.height <= bar.y + 1).toBe(true);
          await expectReachable(popover, { size });
          await page.keyboard.press('Escape');
          await expect(popover).toBeHidden();

          await page.getByRole('button', { name: 'Edit time zones', exact: true }).focus();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(crowded ? 5 : 4);
          await expectReachable(page.getByRole('grid'), { size });
          await expectReachable(page.locator('.card__header'), { size });
          expect(await pageOverflow(page)).toBe(0);
          await page.getByRole('button', { name: 'Done editing time zones', exact: true }).focus();
          await page.keyboard.press('Enter');

          for (const name of ['Settings', 'Add city']) {
            await page.getByRole('button', { name, exact: true }).focus();
            await page.keyboard.press('Enter');
            const dialog = page.getByRole('dialog', { name });
            await expect(dialog).toBeVisible();
            if (name === 'Add city')
              await expect(dialog.locator('.add-city__result').first()).toBeVisible();
            await expectReachable(dialog, { size });
            expect(await outside(dialog)).toEqual([]);
            expect(await pageOverflow(page)).toBe(0);
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
          }
        });
      });
    }
  }
}

test.describe('phone landscape', () => {
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: HOME });

  test('844×390 shows more hours than portrait, in rows no taller', async ({ page }) => {
    await populate(page, '100%');
    /** Home hour columns at least partly in view beside the sticky header. */
    const columns = () =>
      page.getByRole('grid').evaluate((grid) => {
        const box = grid.getBoundingClientRect();
        const header = /** @type {Element} */ (
          grid.querySelector('[role="rowheader"]')
        ).getBoundingClientRect();
        const home = /** @type {Element} */ (grid.querySelector('[role="row"]'));
        return [...home.querySelectorAll('.grid__cell[data-hour]')].filter((cell) => {
          const r = cell.getBoundingClientRect();
          return r.right > header.right && r.left < box.right;
        }).length;
      });
    const portrait = { columns: await columns(), heights: await rowHeights(page) };

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(bar(page)).toBeVisible();
    // Short: the phone header stays, with its trigger and no inline details.
    const kathmandu = row(page, 'Asia/Kathmandu');
    await expect(kathmandu.locator('.grid__trigger:not(.grid__trigger--wide)')).toBeVisible();
    await expect(kathmandu.locator('.grid__details')).toBeHidden();
    await expect(row(page, HOME).locator('.grid__details')).toBeHidden();
    expect(await pageOverflow(page)).toBe(0);

    expect(await columns()).toBeGreaterThan(portrait.columns);
    const heights = await rowHeights(page);
    expect(Object.keys(heights)).toEqual(Object.keys(portrait.heights));
    for (const [zone, height] of Object.entries(heights)) {
      expect(height, zone).toBeLessThanOrEqual(/** @type {number} */ (portrait.heights[zone]));
    }
  });
});
