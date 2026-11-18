// Web vitals budget against the production build (see playwright.perf.config.js).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** @type {{ webVitals: { lcpMs: number, cls: number } }} */
const budget = JSON.parse(readFileSync(new URL('../../perf-budget.json', import.meta.url), 'utf8'));

test('LCP and CLS stay within budget on first load', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const vitals = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) lcp = Math.max(lcp, entry.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = /** @type {PerformanceEntry & { value: number, hadRecentInput: boolean }} */ (entry);
            if (!shift.hadRecentInput) cls += shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        // Let buffered entries flush.
        setTimeout(() => resolve({ lcp, cls }), 500);
      }),
  );

  const { lcp, cls } = /** @type {{ lcp: number, cls: number }} */ (vitals);
  console.log(`LCP=${Math.round(lcp)}ms (budget ${budget.webVitals.lcpMs}) CLS=${cls.toFixed(3)} (budget ${budget.webVitals.cls})`);
  expect(lcp, 'LCP should have been recorded').toBeGreaterThan(0);
  expect(lcp).toBeLessThanOrEqual(budget.webVitals.lcpMs);
  expect(cls).toBeLessThanOrEqual(budget.webVitals.cls);
});
