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
