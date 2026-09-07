import { expect, test } from '@playwright/test';

test('import waits for the authenticated workspace before opening', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(
    page.getByRole('button', { name: 'Import research', exact: true }),
  ).toBeEnabled();
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET' && !intercepted) {
      intercepted = true;
      await pending;
    }
    await route.continue();
  });
  try {
    await page.reload();
    const button = page.getByRole('button', {
      name: 'Import research',
      exact: true,
    });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    release();
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('textbox', { name: 'Research JSON' })
      .fill('Fictional unsaved research');
    await expect(
      page.getByRole('textbox', { name: 'Research JSON' }),
    ).toHaveValue('Fictional unsaved research');
  } finally {
    release();
  }
});
