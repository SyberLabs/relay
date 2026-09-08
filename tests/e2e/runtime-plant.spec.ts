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
  await expect(
    page.getByRole('heading', { name: 'Review queue' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Track jobs', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /All opportunities/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Advanced', exact: true }),
  ).toHaveCount(0);

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

  const saved = await (await page.request.get('/api/workspace')).json();
  const reviewJobs = saved.jobs.filter(
    (job: { status: string; blocker: string }) =>
      job.status === 'Held' && !job.blocker.trim(),
  );
  await expect(page.locator('#workspace-queue .tally')).toHaveText(
    String(reviewJobs.length),
  );
  await expect(page.locator('#workspace-queue button.job')).toHaveCount(
    reviewJobs.length,
  );
  await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
  const allOpportunities = page.getByRole('button', {
    name: `All opportunities ${saved.jobs.length}`,
    exact: true,
  });
  await expect(allOpportunities.locator('span')).toBeVisible();
  await expect(allOpportunities).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.job-sheet tbody tr')).toHaveCount(
    saved.jobs.length,
  );
  await expect(
    page.getByRole('heading', { name: 'Jobs', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Workspace', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Review queue', exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: /Runtime Plant — Held Engineer/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Runtime Plant — Stuck Engineer/ }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: /Runtime Plant — Held Engineer/ })
    .click();
  await expect(page).toHaveURL(/[?&]job=/);
  await expect(
    page.getByRole('heading', { name: 'Runtime Plant — Held Engineer' }),
  ).toBeVisible();
  const evidenceFact = page
    .locator('.facts .fact')
    .filter({ hasText: 'evidence' });
  await expect(evidenceFact).toContainText(/\d+ hit · \d+ miss|not compared/);
  await expect(evidenceFact).not.toContainText('%');
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
  await expect(
    page.getByText('Approval setting: Review every application.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('option', { name: /Automatic for standard/ }),
  ).toHaveCount(0);
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

test('plant blocked answer continues without the remember preference flag', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const seedClaim = 'Fictional verified plant seed for ledger isolation.';
  expect(
    (
      await page.request.post('/api/profile', {
        data: {
          action: 'propose',
          facts: [{ claim: seedClaim, tag: 'detail' }],
        },
      })
    ).ok(),
  ).toBe(true);
  const seeded = await (await page.request.get('/api/profile')).json();
  const seedFact = seeded.facts.find(
    (row: { claim: string }) => row.claim === seedClaim,
  );
  expect(
    (
      await page.request.post('/api/profile', {
        data: { action: 'verify', id: seedFact.id, claim: seedClaim },
      })
    ).ok(),
  ).toBe(true);
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/runtime-plant-blocked-answer',
          Name: 'Runtime Plant — Blocked Answer Engineer',
          Job: 'https://example.com/jobs/runtime-plant-blocked-answer',
          Status: 'Held',
          Notes: 'do not submit until the start date is confirmed.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();
  await page
    .getByRole('button', { name: /Runtime Plant — Blocked Answer Engineer/ })
    .click();
  const before = await (await page.request.get('/api/workspace')).json();
  expect(before.draftingPreference.routine).toBe(false);
  expect(
    before.facts.some((row: { claim: string }) => row.claim === seedClaim),
  ).toBe(true);
  await page.getByRole('button', { name: 'Answer the open question' }).click();
  await expect(
    page.getByRole('heading', { name: 'The agent needs an answer' }),
  ).toBeVisible();
  await expect(page.getByText('Save this as a progress note')).toHaveCount(0);
  const saveBox = page.getByRole('checkbox', {
    name: /Save this to your profile/,
  });
  await expect(saveBox).toBeChecked();
  const answerClaim = 'Start date is 12 June 2027; omit optional anecdotes.';
  await page.getByRole('textbox', { name: 'Your answer' }).fill(answerClaim);
  const posted = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/workspace') &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.action === 'drafting-decision',
  );
  await page.getByRole('button', { name: 'Answer and continue' }).click();
  const response = await posted;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({
    action: 'drafting-decision',
    choice: 'answer',
    remember: false,
    save_profile: true,
    answer: answerClaim,
  });
  await expect(
    page.getByRole('heading', { name: 'The agent needs an answer' }),
  ).toHaveCount(0);
  const after = await (await page.request.get('/api/workspace')).json();
  expect(after.draftingPreference.routine).toBe(false);
  expect(
    after.facts.some((row: { claim: string }) => row.claim === answerClaim),
  ).toBe(false);
  expect(new Set(after.facts.map((row: { id: string }) => row.id))).toEqual(
    new Set(before.facts.map((row: { id: string }) => row.id)),
  );
  const job = after.jobs.find(
    (row: { name: string }) =>
      row.name === 'Runtime Plant — Blocked Answer Engineer',
  );
  expect(job.drafting_direction).toContain('12 June 2027');
  expect(job.status).toBe('Held');
  expect(job.accepted_draft).toBeNull();
  const profile = await (await page.request.get('/api/profile')).json();
  const proposed = profile.facts.find(
    (row: { claim: string; status: string }) =>
      row.claim === answerClaim && row.status === 'Proposed',
  );
  expect(proposed.field_key).toMatch(/^[\w.:-]{1,128}$/);
  expect(proposed).toMatchObject({
    claim: answerClaim,
    status: 'Proposed',
  });
  const verified = await page.request.post('/api/profile', {
    data: { action: 'verify', id: proposed.id, claim: answerClaim },
  });
  expect(verified.ok()).toBe(true);
  const usable = await (await page.request.get('/api/workspace')).json();
  expect(
    usable.facts.some(
      (row: { id: string; claim: string; field_key?: string }) =>
        row.id === proposed.id &&
        row.claim.includes('12 June 2027') &&
        row.field_key === proposed.field_key,
    ),
  ).toBe(true);
});

test('dirty editor asks before Review prepared application and modal Your facts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/runtime-dirty-nav',
          Name: 'Runtime Dirty — Nav Engineer',
          Job: 'https://example.com/jobs/runtime-dirty-nav',
          Status: 'Held',
          Notes: 'Fictional dirty-navigation role.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();
  await page
    .getByRole('button', { name: /Runtime Dirty — Nav Engineer/ })
    .click();
  const draft = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  await draft.fill('Unsaved plant draft before Your facts.');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('link', { name: 'Open Your facts' }).click();
  await expect(page).not.toHaveURL(/\/profile/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(draft).toHaveValue('Unsaved plant draft before Your facts.');

  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByRole('link', { name: 'Review prepared application' }),
  ).toBeVisible();
  await draft.fill('Unsaved plant draft before Applications.');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Review prepared application' }).click();
  await expect(page).not.toHaveURL(/#application-inspect$/);
  await expect(draft).toHaveValue('Unsaved plant draft before Applications.');
  await draft.fill('Unsaved plant draft before Your facts.');
  await page.getByRole('link', { name: 'Review prepared application' }).click();
  await expect(page).toHaveURL(/#application-inspect$/);
  await expect(
    page.getByRole('region', { name: 'Prepared application' }),
  ).toBeVisible();
});
