import { expect, test } from '@playwright/test';

test('a Ready job records an already completed submission with its receipt', async ({
  page,
}) => {
  let posted: Record<string, unknown> | null = null;
  let status = 'Ready';
  const job = {
    id: 'ready-job',
    name: 'Ready Example — Backend Engineer',
    version: 4,
    claims: [] as { id: string; claim: string; evidence: string }[],
  };
  await page.route('**/api/outcomes', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          outcomes: [],
          prep: [
            {
              ...job,
              status,
              receipt: posted ? String(posted.receipt) : null,
            },
          ],
          rates: {},
        },
      });
      return;
    }
    if (route.request().method() === 'POST') {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      status = 'Submitted';
      await route.fulfill({ json: { ok: true, status } });
      return;
    }
    await route.fallback();
  });
  await page.goto('/track');
  await expect(
    page.getByText('Ready Example — Backend Engineer'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record submission' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'rejected' })).toHaveCount(0);
  await expect(page.getByText('without a receipt')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Submission receipt' })
    .fill('confirmation https://example.com/receipt/ready');
  await page.getByRole('button', { name: 'Record submission' }).click();
  await expect(page.getByText('Recorded the submission.')).toBeVisible();
  expect(posted).toMatchObject({
    action: 'record',
    id: 'ready-job',
    version: 4,
    kind: 'submitted',
    receipt: 'confirmation https://example.com/receipt/ready',
  });
  await expect(page.getByRole('button', { name: 'rejected' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record submission' }),
  ).toHaveCount(0);
});
