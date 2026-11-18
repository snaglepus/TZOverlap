// Shared E2E helpers for the *.spec.js files.

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// 14:30 in London (BST) on a Monday: deterministic "now" for every test.
export const NOW = new Date('2026-06-15T13:30:00Z');

/**
 * Add a zone through the Add city sheet: search for `query`, choose the first result.
 * @param {import('@playwright/test').Page} page
 * @param {string} query
 */
export async function addZone(page, query) {
  await page.getByRole('button', { name: 'Add city', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add city' });
  await dialog.getByLabel('Search cities, countries or offsets').fill(query);
  await dialog.locator('.add-city__result').first().click();
  await expect(dialog).toBeHidden();
}

/**
 * Delete a user row through its header popover.
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
export async function deleteZone(page, zone) {
  await page.locator(`[role="row"][data-zone="${zone}"] .grid__trigger:visible`).click();
  await page
    .getByRole('group', { name: 'Time zone details' })
    .getByRole('button', { name: 'Delete' })
    .click();
}

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Label in Name (WCAG 2.5.3) is checked everywhere except hour cells other than
 * the roving keyboard slot: such a cell shows the compact "9a" while its name is
 * the fuller "9:00 am, Best", and it can't be activated until it becomes the
 * roving slot, whose name starts with the visible label. See DESIGN.md §8.
 */
const LABEL_IN_NAME = 'label-content-name-mismatch';
const HOUR_CELLS = '.grid__cell[data-hour]:not([tabindex="0"])';

/** @param {import('@playwright/test').Page} page */
export async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules([LABEL_IN_NAME])
    .analyze();
  const labelInName = await new AxeBuilder({ page })
    .withRules([LABEL_IN_NAME])
    .exclude(HOUR_CELLS)
    .analyze();
  expect(
    [...results.violations, ...labelInName.violations].map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`,
    ),
  ).toEqual([]);
}

/**
 * Open Settings from the toolbar and return the sheet.
 * @param {import('@playwright/test').Page} page
 */
export async function openSettings(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Choose an Appearance option in Settings, then close the sheet.
 * @param {import('@playwright/test').Page} page
 * @param {'System default' | 'Light' | 'Dark'} option
 */
export async function chooseAppearance(page, option) {
  const dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: option, exact: true }).check();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Seed `tzoverlap.state` with `zones` before the first load only.
 * @param {import('@playwright/test').Page} page
 * @param {object[]} zones
 */
export async function seedZones(page, zones) {
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

/** A move past the 4 px pickup slop: the lifted row follows the pointer from there. */
export const LIFT_PX = 6;

/** Raw touch input through CDP. @param {import('@playwright/test').Page} page */
export async function touchscreen(page) {
  const cdp = await page.context().newCDPSession(page);
  let at = { x: 0, y: 0 };
  /** @param {'touchStart' | 'touchMove' | 'touchEnd'} type */
  const send = (type) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(at.x), y: Math.round(at.y) }],
    });
  return {
    /** @param {{ x: number, y: number }} point */
    async start(point) {
      at = point;
      await send('touchStart');
    },
    /** Move in `steps` straight steps. @param {{ x: number, y: number }} point */
    async move(point, steps = 10) {
      const from = at;
      for (let i = 1; i <= steps; i++) {
        at = {
          x: from.x + ((point.x - from.x) * i) / steps,
          y: from.y + ((point.y - from.y) * i) / steps,
        };
        await send('touchMove');
      }
    },
    /**
     * Touch `point` and move just past the pickup slop, so the row lifts there.
     * @param {{ x: number, y: number }} point
     */
    async lift(point) {
      await this.start(point);
      await this.move({ x: point.x, y: point.y - LIFT_PX }, 1);
      return at;
    },
    async end() {
      await send('touchEnd');
    },
  };
}

/**
 * Set the root font size, as a user's large-text setting would.
 * @param {import('@playwright/test').Page} page
 * @param {string} size
 */
export const setRootFontSize = (page, size) =>
  page.evaluate((s) => {
    document.documentElement.style.fontSize = s;
  }, size);
