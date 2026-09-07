import { expect, test } from '@playwright/test';

test('the workspace plant shows lanes, Relay tools, and autopilot without sending', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#workspace-queue')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'What the agent knows about you' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sent' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Stuck, needs your answer' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible();

  const held = {
    url: 'https://example.com/research/runtime-plant-held',
    Name: 'Runtime Plant — Held Engineer',
    Job: 'https://example.com/jobs/runtime-plant-held',
    Status: 'Held',
    Notes: 'Fictional plant held role.',
  };
  const stuck = {
    url: 'https://example.com/research/runtime-plant-stuck',
    Name: 'Runtime Plant — Stuck Engineer',
    Job: 'https://example.com/jobs/runtime-plant-stuck',
    Status: 'Held',
    Notes: 'do not submit until the start date is confirmed.',
  };
  const imported = await page.request.post('/api/workspace', {
    data: { action: 'import', rows: [held, stuck] },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();

  await expect(
    page.getByRole('button', { name: /Runtime Plant — Held Engineer/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Runtime Plant — Stuck Engineer/ }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: /Runtime Plant — Held Engineer/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Runtime Plant — Held Engineer' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Inspect what the agent wrote' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Why this job is in core' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /heuristic word and number match, not a qualification score/i,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: /^Tools/ }).click();
  await expect(
    page.getByText('Tracker CSV import. No account sync.'),
  ).toBeVisible();
  await expect(
    page.getByText('Local CLI research import with your credentials.'),
  ).toBeVisible();
  await expect(
    page.getByText('Notes and version-bound draft files from your vault.'),
  ).toBeVisible();
  await expect(page.getByText('Reads listings, submits forms')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();

  await page
    .getByRole('button', { name: /Runtime Plant — Stuck Engineer/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Runtime Plant — Stuck Engineer' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Answer the open question' }).click();
  await expect(
    page.getByRole('heading', { name: 'The agent needs an answer' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const before = await (await page.request.get('/api/applications')).json();
  const auto = page.getByRole('button', { name: 'Autopilot' });
  if ((await auto.getAttribute('aria-pressed')) === 'true') {
    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'false');
  }
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Autopilot on/)).toBeVisible();
  const after = await (await page.request.get('/api/applications')).json();
  expect(after.operations || []).toHaveLength((before.operations || []).length);
  expect(after.policy?.enabled).toBeTruthy();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const heldJob = workspace.jobs.find(
    (job: { name: string }) => job.name === 'Runtime Plant — Held Engineer',
  );
  expect(heldJob).toMatchObject({
    status: 'Held',
    accepted_draft: null,
  });
});
