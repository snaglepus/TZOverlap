// E2E: the city data is lazy-loaded, so the first page load never requests it.

import { expect, test } from '@playwright/test';

const NOW = new Date('2026-06-15T13:30:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('page load does not request the city data', async ({ page }) => {
  /** @type {string[]} */
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: 'TZ Overlap' })).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => url.includes('/data/cities'))).toEqual([]);
});
