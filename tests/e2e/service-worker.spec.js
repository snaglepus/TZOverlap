// E2E: the service worker. Offline and update tests run against real production
// builds served in-process, one origin per test; the last test checks that the
// dev server (src/) registers no worker at all.

import { appendFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { NOW, addZone, chooseAppearance, expectNoA11yViolations } from './helpers.js';
import { copyOfSrc, productionBuild, recordForeignRequests } from './production-build.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} zone data-zone value
 */
const row = (page, zone) => page.locator(`[role="row"][data-zone="${zone}"]`);

/** @param {import('@playwright/test').Page} page */
const workerReady = (page) =>
  page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

/** @param {import('@playwright/test').Page} page */
const isControlled = (page) => page.evaluate(() => navigator.serviceWorker.controller !== null);

/** @param {import('@playwright/test').Page} page */
const appCaches = (page) =>
  page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('tzoverlap-')));

/** @param {string} outDir */
async function builtCacheName(outDir) {
  const worker = await readFile(path.join(outDir, 'sw.js'), 'utf8');
  return /tzoverlap-[0-9a-f]{12}/.exec(worker)?.[0];
}

test('offline: the app, stored zones, settings and city data work after one visit', async ({
  page,
  context,
}) => {
  const app = await productionBuild();
  const foreign = recordForeignRequests(context, app.url);
  try {
    await page.goto(app.url);
    await addZone(page, 'America/New_York');
    await expect(row(page, 'America/New_York')).toBeVisible();
    await workerReady(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'TZ Overlap' })).toBeVisible();
    await expect(row(page, 'America/New_York')).toBeVisible();
    expect(await isControlled(page)).toBe(true);

    // The lazily loaded city data comes from the worker's cache too.
    const specifier = './data/cities.js';
    const [response, count] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith('/data/cities.js')),
      page.evaluate(async (spec) => (await import(spec)).cities.length, specifier),
    ]);
    expect(count).toBeGreaterThan(0);
    expect(response.fromServiceWorker()).toBe(true);

    // Changes made offline are kept across an offline reload.
    await addZone(page, 'Asia/Tokyo');
    await expect(row(page, 'Asia/Tokyo')).toBeVisible();
    await chooseAppearance(page, 'Dark');
    await page.reload();
    await expect(row(page, 'America/New_York')).toBeVisible();
    await expect(row(page, 'Asia/Tokyo')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  } finally {
    await context.setOffline(false);
    await app.close();
  }
  expect(foreign).toEqual([]);
});

test('update: a new build shows a banner and takes over only on Reload', async ({
  page,
  context,
}) => {
  test.setTimeout(30_000);
  const app = await productionBuild();
  const foreign = recordForeignRequests(context, app.url);
  const src = await copyOfSrc();
  // No theme transition, so axe never sees colours mid-fade.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await page.goto(app.url);
    await workerReady(page);
    // The worker never claims clients, so only the next load is controlled.
    await page.reload();
    expect(await isControlled(page)).toBe(true);
    const oldCaches = await appCaches(page);
    expect(oldCaches).toEqual([await builtCacheName(app.outDir)]);

    await appendFile(path.join(src, 'index.html'), '<!-- update test -->\n');
    await app.rebuild(src);
    const newName = await builtCacheName(app.outDir);
    expect(newName).toBeTruthy();
    expect(newName).not.toBe(oldCaches[0]);

    await page.evaluate(() => {
      /** @type {any} */ (window).__beforeUpdate = true;
    });
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });

    const banner = page.getByRole('status').filter({ hasText: 'Update available' });
    await expect(banner).toBeVisible();
    const reload = banner.getByRole('button', { name: 'Reload' });
    await expect(reload).toBeVisible();
    // The page did not reload by itself.
    expect(await page.evaluate(() => /** @type {any} */ (window).__beforeUpdate)).toBe(true);
    await expectNoA11yViolations(page);
    await chooseAppearance(page, 'Dark');
    await expect(banner).toBeVisible();
    await expectNoA11yViolations(page);

    // Reachable by keyboard: Tab from the top of the page to Reload.
    await page.locator('body').focus();
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      if (await reload.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(reload).toBeFocused();

    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    await expect(page.getByRole('heading', { level: 1, name: 'TZ Overlap' })).toBeVisible();
    expect(await page.evaluate(() => /** @type {any} */ (window).__beforeUpdate)).toBeUndefined();
    expect(await isControlled(page)).toBe(true);
    // The new worker serves the new build's index.html, comment and all.
    expect(await page.evaluate(() => document.lastChild?.textContent)).toBe(' update test ');
    await expect.poll(() => appCaches(page)).toEqual([newName]);
    await expect(page.getByText('Update available')).toHaveCount(0);
  } finally {
    await app.close();
    await rm(src, { recursive: true, force: true });
  }
  expect(foreign).toEqual([]);
});

test('dev server (src/): registers no service worker', async ({ page }) => {
  /** @type {string[]} */
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('grid', { name: /Hours in each time zone/ })).toBeVisible();
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => new URL(url).pathname.endsWith('/sw.js'))).toEqual([]);
});
