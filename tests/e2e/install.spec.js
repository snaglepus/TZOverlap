// E2E: install guidance. The one-time hint and the Settings "Install app"
// button for beforeinstallprompt browsers, the one-time iOS sheet, the
// Settings → Install instructions, and nothing at all when running installed.

import { appendFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { NOW, expectNoA11yViolations, openSettings } from './helpers.js';
import { copyOfSrc, productionBuild } from './production-build.js';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const LAST_IOS_STEP =
  'Open it from the home screen. It runs full screen and works without a connection.';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

/**
 * Dispatch a synthetic beforeinstallprompt whose prompt() counts calls in
 * window.__prompts.
 * @param {import('@playwright/test').Page} page
 */
async function offerInstall(page) {
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__prompts = w.__prompts ?? 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        w.__prompts += 1;
        return Promise.resolve();
      },
    });
    window.dispatchEvent(event);
  });
}

/** @param {import('@playwright/test').Page} page */
const promptCount = (page) => page.evaluate(() => /** @type {any} */ (window).__prompts);

/** @param {import('@playwright/test').Page} page */
const hintDismissed = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('tzoverlap.state') ?? 'null')?.meta?.installHintDismissed,
  );

/** @param {import('@playwright/test').Page} page */
const hint = (page) => page.getByRole('main').getByRole('region', { name: 'Install TZ Overlap' });

test.describe('beforeinstallprompt browsers', () => {
  test('the hint installs once and is then gone, with the Settings button', async ({ page }) => {
    await page.goto('/');
    await expect(hint(page)).toHaveCount(0);
    await offerInstall(page);
    await offerInstall(page);

    await expect(hint(page)).toHaveCount(1);
    await expect(page.locator('main > :first-child h2')).toHaveText('Install TZ Overlap');
    const dialog = await openSettings(page);
    await expect(dialog.getByRole('button', { name: 'Install app' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await hint(page).getByRole('button', { name: 'Install app' }).click();
    expect(await promptCount(page)).toBe(1);
    await expect(hint(page)).toHaveCount(0);
    await expect(page.getByRole('main')).toBeFocused();
    await openSettings(page);
    await expect(dialog.getByRole('button', { name: 'Install app' })).toHaveCount(0);
    await expect.poll(() => hintDismissed(page)).toBe(true);
  });

  test('the hint and the Update available banner show together', async ({ page }) => {
    test.setTimeout(30_000);
    const app = await productionBuild();
    const src = await copyOfSrc();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await page.goto(app.url);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      await page.reload();
      await appendFile(path.join(src, 'index.html'), '<!-- update test -->\n');
      await app.rebuild(src);
      await offerInstall(page);
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });

      await expect(page.getByRole('status').filter({ hasText: 'Update available' })).toBeVisible();
      await expect(hint(page)).toBeVisible();
      await expectNoA11yViolations(page);
      await hint(page).getByRole('button', { name: 'Install app' }).click();
      expect(await promptCount(page)).toBe(1);
      await expect(page.getByRole('status').filter({ hasText: 'Update available' })).toBeVisible();
    } finally {
      await app.close();
      await rm(src, { recursive: true, force: true });
    }
  });

  test('Install app in Settings prompts once and keeps focus in the sheet', async ({ page }) => {
    await page.goto('/');
    await offerInstall(page);
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Install app' }).click();

    expect(await promptCount(page)).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Install app' })).toHaveCount(0);
    await expect(dialog.getByRole('heading', { name: 'Install', exact: true })).toBeFocused();
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await expect(hint(page)).toHaveCount(0);
    await expect.poll(() => hintDismissed(page)).toBe(true);
  });

  test('Not now hides the hint for good, but Settings still offers install', async ({ page }) => {
    await page.goto('/');
    await offerInstall(page);
    await hint(page).getByRole('button', { name: 'Not now' }).click();
    await expect(hint(page)).toHaveCount(0);
    await expect(page.getByRole('main')).toBeFocused();
    expect(await promptCount(page)).toBe(0);
    await expect.poll(() => hintDismissed(page)).toBe(true);

    await page.reload();
    await offerInstall(page);
    const dialog = await openSettings(page);
    await expect(dialog.getByRole('button', { name: 'Install app' })).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
  });

  test('appinstalled removes the hint and the Settings button', async ({ page }) => {
    await page.goto('/');
    await offerInstall(page);
    await expect(hint(page)).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(hint(page)).toHaveCount(0);
    const dialog = await openSettings(page);
    await expect(dialog.getByRole('button', { name: 'Install app' })).toHaveCount(0);
  });

  test('a reset mid-session does not bring the hint back', async ({ page }) => {
    await page.goto('/');
    await offerInstall(page);
    await hint(page).getByRole('button', { name: 'Not now' }).click();
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Reset all data' }).click();
    await dialog.getByRole('button', { name: 'Reset everything' }).click();
    await expect(dialog).toBeHidden();
    await offerInstall(page);
    await expect(hint(page)).toHaveCount(0);
  });
});

test('Settings → Install lists the steps for every platform', async ({ page }) => {
  await page.goto('/');
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('heading', { name: 'Install', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Install app' })).toHaveCount(0);

  const groups = dialog.locator('.install__group');
  await expect(groups.getByRole('heading', { level: 4 })).toHaveText([
    'iPhone or iPad',
    'Android (Chrome)',
    'Mac, Windows or Linux desktop',
  ]);
  await expect(groups.nth(0).locator('ol > li')).toHaveText([
    'Open the app’s address in Safari.',
    'Tap the Share button (square with an up arrow).',
    'Scroll down and tap Add to Home Screen (you may need to tap “View More” first).',
    'Check that “Open as Web App” is on if shown, then tap Add.',
    LAST_IOS_STEP,
  ]);
  await expect(groups.nth(1).locator('ol > li')).toHaveText([
    'Open the app’s address in Chrome.',
    'Tap Install app in the app’s Settings, or the browser’s ⋮ menu → Add to Home screen / Install app.',
    'Confirm with Install.',
  ]);
  await expect(groups.nth(2).locator('ul > li')).toHaveText([
    'Chrome or Edge: click the install icon in the address bar (or menu → Install TZ Overlap).',
    'Safari on Mac: File → Add to Dock.',
  ]);

  // After Appearance, Time format and the weekends switch, before Reset all data.
  const order = await dialog.evaluate((el) =>
    [...(el.querySelector('.settings')?.children ?? [])].map((c) => c.className),
  );
  expect(order).toEqual([
    'radio-group',
    'radio-group',
    'settings__section',
    'settings__section install',
    'settings__section',
  ]);

  // The Install heading matches its sibling label, the Appearance legend.
  /** @param {import('@playwright/test').Locator} el */
  const type = (el) =>
    el.evaluate((node) => {
      const { fontSize, fontWeight, lineHeight } = getComputedStyle(node);
      return { fontSize, fontWeight, lineHeight };
    });
  expect(await type(dialog.getByRole('heading', { name: 'Install', exact: true }))).toEqual(
    await type(dialog.locator('legend', { hasText: 'Appearance' })),
  );
  await expectNoA11yViolations(page);
});

test.describe('iPhone', () => {
  test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    test(`the iOS sheet opens once with the Share steps (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const sheet = page.getByRole('dialog', { name: 'Install TZ Overlap' });
      await expect(sheet).toBeVisible();
      const steps = sheet.locator('ol > li');
      await expect(steps).toHaveCount(5);
      await expect(steps.nth(1)).toHaveText('Tap the Share button (square with an up arrow).');
      await expect(steps.nth(2)).toHaveText(/^Scroll down and tap Add to Home Screen /);
      await expect(steps.last()).toHaveText(LAST_IOS_STEP);
      await expect(sheet.locator('svg.icon')).toBeVisible();
      await expect(sheet.locator('svg.icon')).toHaveAttribute('aria-hidden', 'true');
      await expectNoA11yViolations(page);

      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toBeHidden();
      await expect.poll(() => hintDismissed(page)).toBe(true);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Timelines' })).toBeVisible();
      await expect(sheet).toHaveCount(0);
    });
  }

  test('Esc also dismisses the iOS sheet for good', async ({ page }) => {
    await page.goto('/');
    const sheet = page.getByRole('dialog', { name: 'Install TZ Overlap' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect.poll(() => hintDismissed(page)).toBe(true);
  });
});

test.describe('installed (standalone)', () => {
  test('display-mode standalone: no hint and no Install section', async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) =>
        query === '(display-mode: standalone)'
          ? /** @type {MediaQueryList} */ (/** @type {unknown} */ ({ matches: true, media: query }))
          : original(query);
    });
    await page.goto('/');
    await offerInstall(page);
    await expect(page.getByRole('heading', { name: 'Timelines' })).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
    const dialog = await openSettings(page);
    await expect(dialog.getByRole('heading', { name: 'Install', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Install app' })).toHaveCount(0);
  });

  test.describe('iPhone home-screen app', () => {
    test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, hasTouch: true });

    test('navigator.standalone: no iOS sheet', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Timelines' })).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Install TZ Overlap' })).toHaveCount(0);
    });
  });
});
