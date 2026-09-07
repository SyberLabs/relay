import { expect, test } from '@playwright/test';

test('empty workspace onboarding adds a job without visiting Profile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(page.getByRole('heading', { name: 'No jobs yet' })).toBeVisible();
  await expect(
    page.getByText(/Your facts and Advanced tools are optional/),
  ).toBeVisible();
  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('group', { name: 'Job list' })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Your facts' })).toBeVisible();
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Stage Example — Onboarding Engineer');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/stage-onboarding');
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(page.getByRole('heading', { name: 'No jobs yet' })).toHaveCount(
    0,
  );
  await expect(page).not.toHaveURL(/\/profile/);
  await expect(
    page.getByRole('heading', { name: 'Stage Example — Onboarding Engineer' }),
  ).toBeVisible();
  await expect(
    page.getByText('Review research and accept the exact wording for this job.'),
  ).toBeVisible();
  await expect(sidebar.getByRole('group', { name: 'Job list' })).toBeVisible();
});

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
  await page.getByRole('button', { name: /Stage Held — Engineer/ }).click();
  const accept = page.getByRole('button', { name: 'Accept exact draft' });
  await expect(accept).toHaveClass(/primary/);
  const addJob = page.getByRole('button', { name: 'Add job', exact: true });
  await expect(addJob).toHaveClass(/secondary/);
  await expect(addJob).not.toHaveClass(/primary/);
  await expect(
    page.getByRole('heading', { name: 'Advanced', exact: true }),
  ).toHaveCount(0);
  await page.getByText('Prepare this job for an assistant', { exact: true }).click();
  await expect(
    page.getByText(/Packet and draft files for this selected job/),
  ).toBeVisible();
});
