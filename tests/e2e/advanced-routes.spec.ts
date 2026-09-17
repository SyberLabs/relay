import { expect, test } from '@playwright/test';

test('legacy plan, preferences, and review bookmarks land under Advanced', async ({
  page,
}) => {
  await page.goto('/signin-with-chatgpt?return_to=/');
  await page.goto('/plan');
  await expect(page).toHaveURL(/\/advanced\/plan$/);
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Runtime' })).toHaveCount(0);
  await page.goto('/preferences');
  await expect(page).toHaveURL(/\/advanced\/preferences$/);
  await expect(
    page.getByRole('heading', { name: 'Preferences' }),
  ).toBeVisible();
  await page.goto('/review');
  await expect(page).toHaveURL(/\/advanced\/review$/);
  await expect(
    page.getByRole('heading', { name: 'Batch review' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toHaveCount(0);
});
