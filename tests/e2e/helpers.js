// Shared E2E helpers for the *.spec.js files.

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// 14:30 in London (BST) on a Monday: deterministic "now" for every test.
export const NOW = new Date('2026-06-15T13:30:00Z');

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone
 */
export async function addZone(page, zone) {
  await page.getByLabel('Time zone', { exact: true }).fill(zone);
  await page.getByLabel('Time zone', { exact: true }).press('Enter');
}

/** @param {import('@playwright/test').Page} page */
export async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
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
