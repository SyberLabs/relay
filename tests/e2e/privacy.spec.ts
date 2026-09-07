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
