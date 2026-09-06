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

  await page.goto('/signout-with-chatgpt?return_to=/');
  await expect(
    page.getByRole('heading', { name: 'Your private workspace' }),
  ).toBeVisible();
  expect((await page.request.get('/api/workspace')).status()).toBe(401);
  expect(errors).toEqual([]);
});

test('tracker CSV mapping and repeated imports preserve reviewed wording', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/signin-with-chatgpt?return_to=/');
  const panel = page.locator('details').filter({
    has: page.getByText('Import a tracker CSV', { exact: true }),
  });
  await panel.locator('summary').click();
  const csv =
    'Company,Position,Job URL,Status,Notes,Private extra\n' +
    'CSV Browser Example,Engineer,https://example.com/jobs/csv-browser,Applied,"Research, with a comma",OMITTED_MARKER\n';
  const load = async (text: string) => {
    await panel.getByLabel('Choose tracker CSV').setInputFiles({
      name: 'fictional-tracker.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(text),
    });
    await expect(panel.getByText(/Read 1 rows locally/)).toBeVisible();
    await panel
      .getByRole('combobox', { name: 'Role', exact: true })
      .selectOption('Position');
  };
  await load(csv);
  await expect(panel.getByText(/Omitted columns: Private extra/)).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Import 1/ })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Preview tracker records' }).click();
  await expect(
    panel.getByText('Check every record below. Nothing has been saved.'),
  ).toBeVisible();
  let workspace = await (await page.request.get('/api/workspace')).json();
  expect(
    workspace.jobs.some((job: { job_key: string }) =>
      job.job_key.endsWith('/csv-browser'),
    ),
  ).toBe(false);
  await expect(panel.getByText(/Source status: Applied/)).toBeVisible();
  await expect(panel.getByText('OMITTED_MARKER')).toHaveCount(0);

  // Even changing the source label requires another preview of the exact rows.
  await panel.getByLabel('Source tracker').fill('Fictional tracker');
  await expect(panel.getByRole('button', { name: /^Import 1/ })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Preview tracker records' }).click();
  await panel
    .getByRole('button', { name: 'Import 1 research records' })
    .click();
  await expect(panel.getByText(/Imported 1 research records/)).toBeVisible();
  workspace = await (await page.request.get('/api/workspace')).json();
  const job = workspace.jobs.find((item: { job_key: string }) =>
    item.job_key.endsWith('/csv-browser'),
  );
  expect(job.status).toBe('Held');
  expect(
    workspace.sources.filter(
      (item: { job_key: string }) => item.job_key === job.job_key,
    ),
  ).toHaveLength(1);

  await page
    .getByRole('button', { name: /CSV Browser Example — Engineer/ })
    .click();
  const draft = 'My exact reviewed CSV application answer.';
  await page.getByRole('textbox', { name: 'Blocker or missing fact' }).fill('');
  await page
    .getByRole('textbox', { name: 'Application answer or outreach draft' })
    .fill(draft);
  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();

  await load(csv);
  await panel.getByRole('button', { name: 'Preview tracker records' }).click();
  await panel
    .getByRole('button', { name: 'Import 1 research records' })
    .click();
  await expect(panel.getByText(/Imported 1 research records/)).toBeVisible();
  workspace = await (await page.request.get('/api/workspace')).json();
  expect(
    workspace.jobs.find((item: { id: string }) => item.id === job.id),
  ).toMatchObject({
    status: 'Ready',
    draft,
    accepted_draft: draft,
  });
  expect(
    workspace.sources.filter(
      (item: { job_key: string }) => item.job_key === job.job_key,
    ),
  ).toHaveLength(1);
  expect(
    workspace.sources.find(
      (item: { job_key: string }) => item.job_key === job.job_key,
    ).notes,
  ).not.toContain('OMITTED_MARKER');
  await page.reload();
  await page.getByRole('button', { name: /Accepted drafts/ }).click();
  await page
    .getByRole('button', { name: /CSV Browser Example — Engineer/ })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Application answer or outreach draft' }),
  ).toHaveValue(draft);
  expect(errors).toEqual([]);
});
