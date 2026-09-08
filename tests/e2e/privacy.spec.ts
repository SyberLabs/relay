import { expect, test } from '@playwright/test';

test('signed-out workspace and About open the data notice', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your private workspace' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'How Relay uses your data' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole('heading', { name: 'How Relay uses your data' }),
  ).toBeVisible();
  await expect(page.getByText(/does not sell/i)).toBeVisible();
  await expect(
    page.getByText('Relay does not POST the employer form.'),
  ).toBeVisible();

  await page.goto('/about');
  await page.getByRole('link', { name: 'How Relay uses your data' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('dirty editor asks before opening the data notice', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/privacy-dirty-nav',
          Name: 'Privacy Dirty — Nav Engineer',
          Job: 'https://example.com/jobs/privacy-dirty-nav',
          Status: 'Held',
          Notes: 'Fictional dirty-navigation notice check.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();
  await page
    .getByRole('button', { name: /Privacy Dirty — Nav Engineer/ })
    .click();
  const draft = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  await draft.fill('Unsaved plant draft before the data notice.');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'How Relay uses your data' }).click();
  await expect(page).not.toHaveURL(/\/privacy/);
  await expect(draft).toHaveValue(
    'Unsaved plant draft before the data notice.',
  );
});
