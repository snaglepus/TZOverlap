import { expect, test } from '@playwright/test';

test.describe('first load', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('detects and shows the browser time zone, loading only first-party files', async ({
    page,
    baseURL,
  }) => {
    /** @type {string[]} */
    const foreign = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(/** @type {string} */ (baseURL))) foreign.push(req.url());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('TZ Overlap');
    await expect(page.getByTestId('local-zone')).toHaveText('Asia/Tokyo');
    expect(foreign).toEqual([]);
  });
});
