import { expect, test } from '@playwright/test';

test('held job primary control is accept, not Advanced or add job', async ({
  page,
}) => {
  await page.goto('/signin-with-chatgpt?return_to=/');
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/stage-held',
          Name: 'Stage Held — Engineer',
          Job: 'https://example.com/jobs/stage-held',
          Status: 'Held',
          Notes: 'Fictional held role.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();
  const addJob = page.getByRole('button', { name: 'Add job', exact: true });
  await expect(addJob).toHaveClass(/primary/);
  await expect(
    page.getByText(
      'Select a job to continue its review. Adding or importing is between jobs.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Select a role' }),
  ).toBeVisible();
  await expect(
    page.getByText('Prepare this job for an assistant', { exact: true }),
  ).toBeVisible();
  await page
    .getByText('Prepare this job for an assistant', { exact: true })
    .click();
  await expect(page.getByText(/Select a job to bind a packet/)).toBeVisible();
  await expect(
    page.getByRole('status', { name: 'Browser assistant tools' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download selected job packet' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /Stage Held — Engineer/ }).click();
  await expect(addJob).toHaveClass(/secondary/);
  await expect(addJob).not.toHaveClass(/primary/);
  const accept = page.getByRole('button', { name: 'Accept exact draft' });
  await expect(accept).toHaveClass(/primary/);
  await expect(
    page.getByText(
      'Review research and accept the exact wording for this job.',
    ),
  ).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: 'Advanced', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('status', { name: 'Browser assistant tools' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Packet and draft files for this selected job/),
  ).toBeVisible();
});
