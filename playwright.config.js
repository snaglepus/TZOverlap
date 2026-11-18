// End-to-end tests: drive the dev server (serving src/) in headless Chromium.
// Port: E2E_PORT env var (default 4173), passed to the server as --port.
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 15_000,
  outputDir: 'test-results/e2e',
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/serve.js --port ${port} --host 127.0.0.1 --dir src`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
