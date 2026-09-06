import { expect, test } from '@playwright/test';

test('private history requires sign-in and ignores forged identity headers', async ({
  page,
  request,
}) => {
  const denied = await request.get('/api/workspace', {
    headers: {
      'oai-authenticated-user-id': 'forged-owner',
      'oai-authenticated-user-email': 'forged@example.com',
    },
  });
  expect(denied.status()).toBe(401);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your private workspace' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Explore example jobs' }),
  ).toHaveCount(0);
});

test('import, acceptance, reload and rediscovery preserve the exact reviewed draft', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(
    page.getByRole('button', { name: 'Explore example jobs' }),
  ).toBeVisible();

  const research = [
    {
      url: 'https://example.com/research/ci-browser',
      Name: 'Browser Example — Reliability Engineer',
      Job: 'https://example.com/jobs/ci-browser',
      Status: 'Held',
      Notes: 'Fictional CI acceptance record.',
    },
  ];
  await page
    .getByRole('button', { name: 'Import research', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Research JSON' })
    .fill(JSON.stringify(research));
  await expect(
    page.getByRole('button', { name: 'Import into workspace' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Preview matches' }).click();
  await expect(
    page.getByText('Preview complete. No records were imported.'),
  ).toBeVisible();
  let workspace = await (await page.request.get('/api/workspace')).json();
  expect(workspace.jobs).toHaveLength(0);

  await page.getByRole('button', { name: 'Import into workspace' }).click();
  await expect(page.getByText('Workspace updated.')).toBeVisible();
  await page
    .getByRole('button', { name: /Browser Example — Reliability Engineer/ })
    .click();
  const draft =
    'I reviewed this exact answer against the fictional role requirements.';
  await page.getByRole('textbox', { name: 'Blocker or missing fact' }).fill('');
  await page
    .getByRole('textbox', { name: 'Application answer or outreach draft' })
    .fill(draft);
  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Accepted drafts/ }).click();
  await page
    .getByRole('button', { name: /Browser Example — Reliability Engineer/ })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Application answer or outreach draft' }),
  ).toHaveValue(draft);
  workspace = await (await page.request.get('/api/workspace')).json();
  expect(workspace.jobs[0]).toMatchObject({
    status: 'Ready',
    draft,
    accepted_draft: draft,
  });
  expect(
    workspace.events.filter(
      (event: { kind: string }) => event.kind === 'Draft accepted',
    ),
  ).toHaveLength(1);

  await page
    .getByRole('button', { name: 'Import research', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Research JSON' })
    .fill(JSON.stringify(research));
  await expect(
    page.getByRole('button', { name: 'Import into workspace' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Preview matches' }).click();
  await expect(
    page.getByText('Preview complete. No records were imported.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import into workspace' }).click();
  await expect(page.getByText('Workspace updated.')).toBeVisible();
  workspace = await (await page.request.get('/api/workspace')).json();
  expect(workspace.jobs).toHaveLength(1);
  expect(workspace.sources).toHaveLength(1);
  expect(workspace.jobs[0]).toMatchObject({
    status: 'Ready',
    draft,
    accepted_draft: draft,
  });

  await expect(page.getByRole('link', { name: 'Sign out' })).toBeVisible();
  await page.goto('/signout-with-chatgpt?return_to=/');
  await expect(
    page.getByRole('heading', { name: 'Your private workspace' }),
  ).toBeVisible();
  await expect(page.getByText(draft)).toHaveCount(0);
  expect((await page.request.get('/api/workspace')).status()).toBe(401);
  expect(errors).toEqual([]);
});
