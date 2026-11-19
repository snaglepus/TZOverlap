// Clock-tick budget against the production build (see playwright.perf.config.js):
// the main-thread scripting of one minute tick with 8 rows (PRD 10.1). The
// clock is Playwright's: paused just before each minute boundary, then left to
// run, so the tick fires as an ordinary page task. CDP's ScriptDuration delta
// across that boundary is its cost (script run from a CDP command, such as
// clock.runFor, counts elsewhere, so the boundary is crossed in real time).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** @type {{ clockTick: { scriptMs: number } }} */
const budget = JSON.parse(readFileSync(new URL('../../perf-budget.json', import.meta.url), 'utf8'));

const TICKS = 7;
/** How long before each boundary the clock is let go, and how long after it the test waits. */
const LEAD_MS = 200;
const SETTLE_MS = 300;
// 14:30:30 in London: half a minute before the first boundary.
const START = new Date('2026-06-15T13:30:30Z');
const ZONES = [
  'America/Los_Angeles',
  'America/New_York',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Tokyo',
  'Australia/Sydney',
];

test.use({ timezoneId: 'Europe/London' });

test('one clock tick with 8 rows stays within the scripting budget', async ({ page }) => {
  await page.addInitScript((list) => {
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
          defaultDuration: 60,
        },
        meta: { installHintDismissed: true, lastHomeTz: 'Europe/London' },
      }),
    );
  }, ZONES);
  await page.clock.install({ time: START });
  await page.goto('/');
  await expect(page.locator('[role="row"][data-zone]:not([data-zone="everyone"])')).toHaveCount(8);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const scriptSeconds = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'ScriptDuration')?.value ?? 0;
  };

  /** @type {number[]} */
  const ticks = [];
  for (let i = 1; i <= TICKS; i++) {
    // 14:3i:00 less LEAD_MS, then real time carries the clock across it.
    await page.clock.pauseAt(new Date(START.getTime() - 30_000 + i * 60_000 - LEAD_MS));
    const before = await scriptSeconds();
    await page.clock.resume();
    await page.waitForTimeout(LEAD_MS + SETTLE_MS);
    ticks.push((await scriptSeconds()) - before);
  }
  const ms = ticks.map((s) => s * 1000);
  const sorted = [...ms].sort((a, b) => a - b);
  const median = /** @type {number} */ (sorted[Math.floor(sorted.length / 2)]);
  console.log(
    `clock tick scripting (8 rows): ${ms.map((t) => `${t.toFixed(2)}ms`).join(' ')} median=${median.toFixed(2)}ms (budget ${budget.clockTick.scriptMs})`,
  );
  // Every tick landed: the home header moved from 14:30 to 14:37.
  await expect(
    page.locator('[role="row"][data-zone="Europe/London"] .grid__details .grid__time'),
  ).toHaveText('14:37');
  expect(median).toBeLessThanOrEqual(budget.clockTick.scriptMs);
});
