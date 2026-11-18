// E2E: slot selection (TZO-19): click, tap and keyboard selection, the band,
// the headers' selected times, the selection bar, clearing, and the focused
// slot's name. Device in Sydney, clock fixed at 12:00 on Wed 18 Nov 2026.

import { expect, test } from '@playwright/test';
import { addZone, expectNoA11yViolations, openSettings } from './helpers.js';

/** Wednesday 18 Nov 2026, 12:00 in Sydney (AEDT). */
const SYDNEY_NOON = new Date('2026-11-18T01:00:00Z');
const HOME = 'Australia/Sydney';
const SEEDED = ['Europe/London', 'Asia/Kolkata'];

test.use({ timezoneId: HOME, viewport: { width: 1280, height: 720 } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SYDNEY_NOON);
});

/**
 * Seed `tzoverlap.state` with these IANA zones before the first load only.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} tzs
 * @param {number} [defaultDuration]
 */
async function seed(page, tzs, defaultDuration = 60) {
  await page.addInitScript(
    ({ list, duration }) => {
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
            defaultDuration: duration,
          },
          meta: { installHintDismissed: false, lastHomeTz: null },
        }),
      );
    },
    { list: tzs, duration: defaultDuration },
  );
}

/** @param {import('@playwright/test').Page} page */
const grid = (page) => page.getByRole('grid', { name: /Hours in each time zone/ });

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/**
 * A row's hour cell starting at `iso`.
 * @param {import('@playwright/test').Page} page
 * @param {string} iso
 * @param {string} [zone]
 */
const cell = (page, iso, zone = HOME) =>
  row(page, zone).locator(`[role="gridcell"][data-start="${iso}"]`);

/** @param {import('@playwright/test').Page} page */
const band = (page) => page.locator('.grid__selection');

/** @param {import('@playwright/test').Page} page */
const bar = (page) => page.getByRole('group', { name: 'Selected time' });

/** @param {import('@playwright/test').Page} page */
const roving = (page) => row(page, HOME).locator('[role="gridcell"][tabindex="0"]');

/** @param {import('@playwright/test').Page} page */
const scrollLeft = (page) => grid(page).evaluate((el) => el.scrollLeft);

/**
 * Click `iso`'s home cell at `fraction` of its width, mid-height.
 * @param {import('@playwright/test').Page} page
 * @param {string} iso
 * @param {number} fraction
 */
async function clickAt(page, iso, fraction) {
  const target = cell(page, iso);
  const box = await target.boundingBox();
  if (!box) throw new Error(`no box for ${iso}`);
  await target.click({ position: { x: box.width * fraction, y: box.height / 2 } });
}

/**
 * The desktop "Selected …" line of a row.
 * @param {import('@playwright/test').Page} page
 * @param {string} zone
 */
const selectedLine = (page, zone) => row(page, zone).locator('.grid__details .grid__selected');

/** @param {import('@playwright/test').Page} page */
async function expectCleared(page) {
  await expect(band(page)).toBeHidden();
  await expect(bar(page)).toBeHidden();
  await expect(page.locator('.grid__selected:visible')).toHaveCount(0);
  await expect(page.locator('.grid__time[data-selected]')).toHaveCount(0);
  await expect(grid(page)).toBeFocused();
}

test('a click snaps to the nearest 15 minutes and draws a band across every row', async ({
  page,
}) => {
  await seed(page, SEEDED);
  await page.goto('/');
  await expect(bar(page)).toBeHidden();
  await expect(band(page)).toBeHidden();

  // 10:00 Sydney at 40%: 10:24, nearest 15 minutes 10:30.
  await clickAt(page, '2026-11-17T23:00:00.000Z', 0.4);
  await expect(band(page)).toBeVisible();
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-17T23:30:00.000Z');
  await expect(band(page)).toHaveAttribute('data-duration', '60');
  await expect(band(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(bar(page)).toContainText('Wed 18 Nov, 10:30–11:30 Sydney');
  await expect(page.getByTestId('announcer')).toHaveText(
    /^Selected Wed 18 Nov, 10:30–11:30 Sydney, /,
  );
  // Focus stays on the grid, not in a cell.
  await expect(grid(page)).toBeFocused();

  const geometry = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')].map((r) =>
      r.getBoundingClientRect(),
    );
    const cellBox = /** @type {Element} */ (
      document.querySelector('[role="gridcell"][data-start="2026-11-17T23:00:00.000Z"]')
    ).getBoundingClientRect();
    const b = /** @type {Element} */ (document.querySelector('.grid__selection'));
    const nowLine = /** @type {Element} */ (document.querySelector('.grid__now'));
    return {
      band: b.getBoundingClientRect().toJSON(),
      cellWidth: cellBox.width,
      first: rows[0]?.top ?? 0,
      last: rows.at(-1)?.bottom ?? 0,
      // The band comes after the rows and before the now line.
      order:
        b.previousElementSibling?.getAttribute('role') === 'row' &&
        b.nextElementSibling === nowLine,
    };
  });
  expect(Math.abs(geometry.band.width - geometry.cellWidth)).toBeLessThanOrEqual(1);
  expect(geometry.band.top).toBeLessThanOrEqual(geometry.first + 0.5);
  expect(geometry.band.bottom).toBeGreaterThanOrEqual(geometry.last - 1);
  expect(geometry.order).toBe(true);
});

test('headers show each zone’s selected time and the bar the range and rating', async ({
  page,
}) => {
  await seed(page, SEEDED);
  await page.goto('/');
  await clickAt(page, '2026-11-17T22:00:00.000Z', 0.05);
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-17T22:00:00.000Z');

  await expect(selectedLine(page, HOME)).toHaveText('Selected 09:00');
  await expect(selectedLine(page, 'Europe/London')).toHaveText('Selected 22:00');
  await expect(selectedLine(page, 'Asia/Kolkata')).toHaveText('Selected 03:30');
  await expect(row(page, 'everyone').locator('.grid__selected')).toHaveCount(0);

  await expect(bar(page)).toContainText('Wed 18 Nov, 09:00–10:00 Sydney');
  await expect(bar(page)).toContainText('Unsuitable for some');
  // The live clocks are still shown.
  await expect(row(page, HOME).locator('.grid__details .grid__time')).toHaveText('12:00');
  await expect(row(page, 'Europe/London').locator('.grid__details .grid__time')).toHaveText(
    '01:00',
  );

  // The 12/24-hour switch rewrites the header times and the bar.
  await page.keyboard.press('t');
  await expect(selectedLine(page, 'Asia/Kolkata')).toHaveText('Selected 3:30 am');
  await expect(bar(page)).toContainText('Wed 18 Nov, 9:00 am–10:00 am Sydney');
  // The minute tick leaves the selected times alone.
  await page.clock.runFor(120_000);
  await expect(selectedLine(page, HOME)).toHaveText('Selected 9:00 am');
});

test('the rating covers the whole duration', async ({ page }) => {
  await page.goto('/');
  // 10:00 Sydney.
  await clickAt(page, '2026-11-17T23:00:00.000Z', 0.05);
  await expect(bar(page)).toContainText('Best for all');
  // 16:30–17:30 crosses Best into Good.
  await clickAt(page, '2026-11-18T05:00:00.000Z', 0.5);
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-18T05:30:00.000Z');
  await expect(bar(page)).toContainText('Good for all');
  // 19:30–20:30 touches 20:00.
  await clickAt(page, '2026-11-18T08:00:00.000Z', 0.5);
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-18T08:30:00.000Z');
  await expect(bar(page)).toContainText('Unsuitable for some');
});

test('the clear button clears the selection and leaves focus on the grid', async ({ page }) => {
  await seed(page, SEEDED);
  await page.goto('/');
  await clickAt(page, '2026-11-17T22:00:00.000Z', 0.05);
  await expect(bar(page)).toBeVisible();
  await bar(page).getByRole('button', { name: 'Clear selection' }).click();
  await expectCleared(page);
  await expect(page.getByTestId('announcer')).toHaveText('Selection cleared');
});

test('Esc clears the selection', async ({ page }) => {
  await seed(page, SEEDED);
  await page.goto('/');
  await clickAt(page, '2026-11-17T22:00:00.000Z', 0.05);
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expectCleared(page);
});

test('Esc closes an open sheet first and keeps the selection', async ({ page }) => {
  await page.goto('/');
  await clickAt(page, '2026-11-17T23:00:00.000Z', 0.05);
  const dialog = await openSettings(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(band(page)).toBeVisible();
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(band(page)).toBeHidden();
  await expect(bar(page)).toBeHidden();
});

test('a mouse drag scrolls and never selects', async ({ page }) => {
  await page.goto('/');

  const drag = async () => {
    const box = await cell(page, '2026-11-18T01:00:00.000Z').boundingBox();
    if (!box) throw new Error('no box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 150, y, { steps: 10 });
    await page.mouse.up();
  };

  const before = await scrollLeft(page);
  await drag();
  expect(Math.abs((await scrollLeft(page)) - before - 150)).toBeLessThanOrEqual(5);
  await expect(band(page)).toBeHidden();
  await expect(bar(page)).toBeHidden();

  await clickAt(page, '2026-11-17T23:00:00.000Z', 0.05);
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-17T23:00:00.000Z');
  await drag();
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-17T23:00:00.000Z');
  await expect(bar(page)).toContainText('10:00–11:00');
});

test('keyboard: Tab to the slot, arrows move it, Enter and Space select', async ({ page }) => {
  await seed(page, SEEDED);
  await page.goto('/');
  await grid(page).focus();
  await page.keyboard.press('Tab');
  await expect(roving(page)).toHaveCount(1);
  await expect(roving(page)).toBeFocused();
  // The slot holding now.
  await expect(roving(page)).toHaveAttribute('data-start', '2026-11-18T01:00:00.000Z');
  expect(await roving(page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');

  await page.keyboard.press('ArrowRight');
  const next = cell(page, '2026-11-18T02:00:00.000Z');
  await expect(next).toBeFocused();
  await expect(next).toHaveAttribute('tabindex', '0');
  await expect(cell(page, '2026-11-18T01:00:00.000Z')).toHaveAttribute('tabindex', '-1');
  const visible = await next.locator('.grid__label').textContent();
  const name = /** @type {string} */ (await next.getAttribute('aria-label'));
  expect(name.startsWith(`${visible}, `)).toBe(true);
  expect(name).toContain('Wednesday 18 November, 13:00 Sydney.');
  expect(name).toMatch(/for (everyone|someone)\./);
  expect(name).toContain('London 02:00, Unsuitable.');
  expect(name).toContain('Kolkata 07:30, Good.');

  await page.keyboard.press('Enter');
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-18T02:00:00.000Z');
  await expect(bar(page)).toContainText('Wed 18 Nov, 13:00–14:00 Sydney');
  await expect(next).toBeFocused();

  await page.keyboard.press('Shift+ArrowRight');
  const later = cell(page, '2026-11-18T08:00:00.000Z');
  await expect(later).toBeFocused();
  const pageY = await page.evaluate(() => window.scrollY);
  await page.keyboard.press(' ');
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-18T08:00:00.000Z');
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
  await expect(later).toBeFocused();

  // The focused slot is fully visible right of the sticky header.
  const clear = await page.evaluate(() => {
    const el = /** @type {Element} */ (document.activeElement);
    const header = /** @type {Element} */ (
      document.querySelector('[role="rowheader"]')
    ).getBoundingClientRect();
    const g = /** @type {Element} */ (
      document.querySelector('[role="grid"]')
    ).getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return box.left >= header.right - 0.5 && box.right <= g.right + 0.5;
  });
  expect(clear).toBe(true);

  // N and Esc work from a slot.
  await page.keyboard.press('Escape');
  await expect(band(page)).toBeHidden();
  await expect(later).toBeFocused();
});

test('keyboard: moving past the window start extends it and keeps focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await roving(page).focus();
  // From 12:00 Wed back to 12:00 Mon: the window opens on Tue 00:00.
  let expected = SYDNEY_NOON.getTime();
  for (let i = 0; i < 8; i++) {
    expected -= 6 * 3600000;
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(roving(page)).toHaveAttribute('data-start', new Date(expected).toISOString());
    await expect(roving(page)).toBeFocused();
  }
  await expect(row(page, HOME).locator('[role="gridcell"]').first()).not.toHaveAttribute(
    'data-start',
    '2026-11-16T13:00:00.000Z',
  );
});

test.describe('the focused slot’s name', () => {
  test('in 24-hour time', async ({ page }) => {
    await seed(page, SEEDED);
    await page.goto('/');
    await roving(page).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    const slot = cell(page, '2026-11-17T22:00:00.000Z');
    await expect(slot).toBeFocused();
    await expect(slot).toHaveAccessibleName(
      '09, Wednesday 18 November, 09:00 Sydney. Unsuitable for someone. London 22:00 Tuesday, Unsuitable. Kolkata 03:30, Unsuitable.',
    );
  });

  test.describe('12-hour', () => {
    test.use({ locale: 'en-US' });

    test('in 12-hour time', async ({ page }) => {
      await seed(page, SEEDED);
      await page.goto('/');
      await roving(page).focus();
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
      const slot = cell(page, '2026-11-17T22:00:00.000Z');
      await expect(slot).toBeFocused();
      await expect(slot).toHaveAccessibleName(
        '9a, Wednesday 18 November, 9:00 am Sydney. Unsuitable for someone. London 10:00 pm Tuesday, Unsuitable. Kolkata 3:30 am, Unsuitable.',
      );
    });
  });
});

test('the selection survives adding a zone, with a selected time on the new row', async ({
  page,
}) => {
  await page.goto('/');
  await clickAt(page, '2026-11-17T23:00:00.000Z', 0.05);
  await expect(bar(page)).toContainText('Best for all');
  // 10:00 Sydney is 18:00 the day before in New York: Good.
  await addZone(page, 'New York');
  await expect(row(page, 'America/New_York')).toBeVisible();
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-17T23:00:00.000Z');
  await expect(selectedLine(page, 'America/New_York')).toHaveText('Selected 18:00');
  await expect(bar(page)).toContainText('Good for all');
});

test('the selection survives a date change; the band shows only inside the window', async ({
  page,
}) => {
  await page.goto('/');
  await clickAt(page, '2026-11-17T23:00:00.000Z', 0.05);
  await page.locator('.toolbar input[type="date"]').fill('2026-11-25');
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  await expect(band(page)).toBeHidden();
  await expect(bar(page)).toContainText('Wed 18 Nov, 10:00–11:00 Sydney');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(band(page)).toBeVisible();
  await expect(band(page)).toHaveAttribute('data-start', '2026-11-17T23:00:00.000Z');
});

test.describe('a duration change refreshes the slot name', () => {
  test('Reset all data', async ({ page }) => {
    await seed(page, [], 120);
    await page.goto('/');
    await roving(page).focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    // 16:00–18:00 reaches Good.
    const slot = cell(page, '2026-11-18T05:00:00.000Z');
    await expect(slot).toBeFocused();
    await expect(slot).toHaveAttribute('aria-label', /Good for everyone/);

    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Reset all data' }).click();
    await dialog.getByRole('button', { name: 'Reset everything' }).click();
    await expect(dialog).toBeHidden();
    await expect(slot).toHaveAttribute('aria-label', /Best for everyone/);
    // The sheet hands focus back to Settings as it closes; then go back to the slot.
    await expect(async () => {
      await slot.focus();
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      await expect(slot).toBeFocused({ timeout: 200 });
    }).toPass();
    await page.keyboard.press('Enter');
    await expect(band(page)).toHaveAttribute('data-duration', '60');
    await expect(bar(page)).toContainText('Best for all');
  });

  test('another tab’s write keeps the existing selection', async ({ page, context }) => {
    await seed(page, [], 120);
    await page.goto('/');
    await roving(page).focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    const slot = cell(page, '2026-11-18T05:00:00.000Z');
    await expect(slot).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(band(page)).toHaveAttribute('data-duration', '120');
    await expect(bar(page)).toContainText('16:00–18:00');
    await expect(slot).toHaveAttribute('aria-label', /Good for everyone/);

    const other = await context.newPage();
    await other.goto('/manifest.webmanifest');
    await other.evaluate(() => {
      const state = JSON.parse(/** @type {string} */ (localStorage.getItem('tzoverlap.state')));
      state.settings.defaultDuration = 60;
      localStorage.setItem('tzoverlap.state', JSON.stringify(state));
    });
    await expect(slot).toHaveAttribute('aria-label', /Best for everyone/);
    await expect(band(page)).toHaveAttribute('data-duration', '120');
    await expect(bar(page)).toContainText('16:00–18:00');
  });
});

test.describe('phone', () => {
  for (const locale of ['en-GB', 'en-US']) {
    const h12 = locale === 'en-US';
    const times = h12
      ? { [HOME]: '12:00 pm', 'Europe/London': '1:00 am', 'Asia/Kolkata': '6:30 am' }
      : { [HOME]: '12:00', 'Europe/London': '01:00', 'Asia/Kolkata': '06:30' };

    for (const [width, fontSize] of /** @type {const} */ ([
      [390, '100%'],
      [320, '100%'],
      [320, '200%'],
    ])) {
      test.describe(`${locale} at ${width} px, root font ${fontSize}`, () => {
        test.use({ locale, viewport: { width, height: 844 } });

        test('the bar is two lines and the headers show the selected time', async ({ page }) => {
          await seed(page, SEEDED);
          await page.goto('/');
          await page.evaluate((size) => {
            document.documentElement.style.fontSize = size;
          }, fontSize);
          // Select 12:00 Sydney from the keyboard.
          await roving(page).focus();
          await page.keyboard.press('Enter');
          await expect(band(page)).toHaveAttribute('data-start', '2026-11-18T01:00:00.000Z');
          await expect(bar(page)).toBeVisible();

          const lines = await bar(page).evaluate((el) => {
            const when = /** @type {Element} */ (el.querySelector('.selection-bar__when'));
            const rating = /** @type {Element} */ (el.querySelector('.selection-bar__rating'));
            return {
              whenBottom: when.getBoundingClientRect().bottom,
              ratingTop: rating.getBoundingClientRect().top,
            };
          });
          expect(lines.ratingTop).toBeGreaterThanOrEqual(lines.whenBottom - 0.5);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
            ),
          ).toBe(true);

          for (const [zone, time] of Object.entries(times)) {
            const trigger = row(page, zone).locator('.grid__trigger');
            const shown = trigger.locator('.grid__time');
            await expect(shown).toHaveText(time);
            await expect(shown).toHaveAttribute('data-selected', 'true');
            await expect(trigger).toHaveAccessibleName(new RegExp(`Selected ${time}`));
            await expect(trigger.locator('.grid__badge')).toBeHidden();
            const report = await shown.evaluate((el) => {
              const header = /** @type {Element} */ (el.closest('[role="rowheader"]'));
              const name = /** @type {Element} */ (
                el.closest('.grid__trigger')?.querySelector('.grid__name')
              );
              const t = el.getBoundingClientRect();
              const box = header.getBoundingClientRect();
              const n = name.getBoundingClientRect();
              const style = getComputedStyle(el);
              return {
                outline: parseFloat(style.outlineWidth) + parseFloat(style.borderTopWidth),
                inside:
                  t.left >= box.left - 0.5 &&
                  t.right <= box.right + 0.5 &&
                  t.top >= box.top - 0.5 &&
                  t.bottom <= box.bottom + 0.5,
                oneLine: t.height <= parseFloat(style.lineHeight) + 0.5,
                nameOneLine: n.height <= parseFloat(getComputedStyle(name).lineHeight) + 0.5,
                below: t.top >= n.bottom - 0.5,
              };
            });
            expect(report, zone).toMatchObject({
              inside: true,
              oneLine: true,
              nameOneLine: true,
              below: true,
            });
            expect(report.outline, zone).toBeGreaterThan(0);
          }
        });
      });
    }
  }

  test.describe('touch', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('a tap selects; a touch scroll does not', async ({ page }) => {
      await seed(page, SEEDED);
      await page.goto('/');
      // 12:00 Sydney, tapped in the middle: 12:30.
      await cell(page, '2026-11-18T01:00:00.000Z').tap();
      await expect(band(page)).toHaveAttribute('data-start', '2026-11-18T01:30:00.000Z');
      await expect(bar(page)).toContainText('12:30–13:30');

      await grid(page).scrollIntoViewIfNeeded();
      const before = await scrollLeft(page);
      const box = await grid(page).boundingBox();
      if (!box) throw new Error('no grid box');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.round(box.x + box.width * 0.75),
        y: Math.round(box.y + box.height / 2),
        xDistance: -300,
        yDistance: 0,
        gestureSourceType: 'touch',
        speed: 2000,
      });
      await expect.poll(() => scrollLeft(page)).not.toBe(before);
      await expect(band(page)).toHaveAttribute('data-start', '2026-11-18T01:30:00.000Z');
      await expect(bar(page)).toContainText('12:30–13:30');
    });
  });
});

test.describe('accessibility', () => {
  for (const locale of ['en-GB', 'en-US']) {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
        test.describe(`${locale} at ${viewport.width} px, ${colorScheme}`, () => {
          test.use({ locale, viewport, colorScheme });

          test('axe passes with a selection shown and a slot focused', async ({ page }) => {
            await seed(page, SEEDED);
            await page.goto('/');
            await roving(page).focus();
            await page.keyboard.press('ArrowLeft');
            await page.keyboard.press('Enter');
            await expect(bar(page)).toBeVisible();
            await expect(band(page)).toBeVisible();
            await expect(roving(page)).toBeFocused();
            await expectNoA11yViolations(page);
          });
        });
      }
    }
  }
});
