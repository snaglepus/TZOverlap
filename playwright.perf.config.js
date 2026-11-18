// Performance tests: build to dist-perf/, serve it, and measure web vitals in
// headless Chromium against perf-budget.json. Port: PERF_PORT (default 4174).
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PERF_PORT ?? 4174);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/perf',
  testMatch: '*.spec.js',
  retries: 0,
  reporter: 'list',
  timeout: 15_000,
  outputDir: 'test-results/perf',
  use: { baseURL, headless: true, timezoneId: 'Europe/London', locale: 'en-GB' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/build.js --out dist-perf && node scripts/serve.js --port ${port} --host 127.0.0.1 --dir dist-perf`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
