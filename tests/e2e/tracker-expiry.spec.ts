import { expect, test } from '@playwright/test';

for (const contentType of ['text/plain', 'application/json']) {
  test(`tracker ${contentType} 401 clears the private workspace`, async ({
    page,
  }) => {
    await page.route('**/api/workspace', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            jobs: [
              {
                id: 'expiry-job',
                job_key: 'https://example.com/jobs/expiry',
                name: 'Expiry Example — Engineer',
                url: 'https://example.com/jobs/expiry',
                status: 'Held',
                draft: 'Private draft',
                blocker: '',
                accepted_draft: null,
                version: 1,
              },
            ],
            sources: [],
            events: [],
          },
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType,
          body:
            contentType === 'text/plain'
              ? 'Unauthorized'
              : JSON.stringify({ error: 'Sign in again.' }),
        });
      }
    });
    await page.goto('/');
    await expect(page.locator('.job').first()).toBeVisible();
    await page.getByText('Import a tracker CSV', { exact: true }).click();
    await page.getByLabel('Choose tracker CSV').setInputFiles({
      name: 'expiry.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Company,Role,URL\nExpiry Example,Engineer,https://example.com/jobs/expiry\n',
      ),
    });
    await expect(
      page.getByText('Read 1 rows locally.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Preview tracker records' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your private workspace' }),
    ).toBeVisible();
    await expect(page.locator('.job')).toHaveCount(0);
    await expect(
      page.getByText('Import a tracker CSV', { exact: true }),
    ).toHaveCount(0);
  });
}
