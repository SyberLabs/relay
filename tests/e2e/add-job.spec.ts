import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in with ChatGPT' }),
  ).toHaveCount(0);
}

test('empty workspace adds one job through ordinary fields and keeps it selected after reload', async ({
  page,
}) => {
  await signIn(page);
  const baseline = await (await page.request.get('/api/workspace')).json();
  expect(baseline.jobs).toHaveLength(0);
  await expect(
    page.getByRole('heading', { name: 'No jobs yet' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Your facts and Advanced tools are optional/),
  ).toBeVisible();
  await expect(
    page.locator('aside').getByRole('group', { name: 'Job list' }),
  ).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/profile/);
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Cedar Example — First Job Engineer');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/first-job-entry');
  await page
    .getByRole('textbox', { name: 'Research notes' })
    .fill('Fictional first-job research notes.');
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(
    page.getByText('Job saved. Continue from the selected record.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Review research and accept the exact wording for this job.',
    ),
  ).toBeVisible();
  await expect(
    page.locator('aside').getByRole('group', { name: 'Job list' }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/\/profile/);
  await expect(
    page.getByRole('heading', { name: 'Cedar Example — First Job Engineer' }),
  ).toBeVisible();
  await expect(
    page.getByText('Fictional first-job research notes.'),
  ).toBeVisible();
  const saved = await (await page.request.get('/api/workspace')).json();
  const job = saved.jobs.find(
    (row: { name: string }) =>
      row.name === 'Cedar Example — First Job Engineer',
  );
  expect(job).toMatchObject({
    status: 'Held',
    url: 'https://example.com/jobs/first-job-entry',
    accepted_draft: null,
    draft: '',
  });
  expect(
    saved.sources.filter(
      (row: { job_key: string }) => row.job_key === job.job_key,
    ),
  ).toHaveLength(1);
  await page.reload();
  await page
    .getByRole('button', { name: /Cedar Example — First Job Engineer/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Cedar Example — First Job Engineer' }),
  ).toBeVisible();
  await expect(
    page.getByText('Fictional first-job research notes.'),
  ).toBeVisible();
});

test('invalid first-job fields do not write and keep typed values', async ({
  page,
}) => {
  await signIn(page);
  const before = await (await page.request.get('/api/workspace')).json();
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page.getByRole('textbox', { name: 'Role title' }).fill('   ');
  await page.getByRole('textbox', { name: 'Posting URL' }).fill('not-a-url');
  await page
    .getByRole('textbox', { name: 'Research notes' })
    .fill('Keep this typed research.');
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(page.getByText('Enter a role title.')).toBeVisible();
  await expect(
    page.getByText('Enter an HTTP or HTTPS posting URL.'),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Research notes' }),
  ).toHaveValue('Keep this typed research.');
  const after = await (await page.request.get('/api/workspace')).json();
  expect(after.jobs).toHaveLength(before.jobs.length);
  expect(after.sources).toHaveLength(before.sources.length);
});

test('cancel creates nothing and keeps unsaved editor work', async ({
  page,
}) => {
  await signIn(page);
  const before = await (await page.request.get('/api/workspace')).json();
  await page.getByRole('button', { name: /All opportunities/ }).click();
  await page.locator('section.queue .joblist button').first().click();
  const draft = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  await draft.fill('Unsaved first-job cancel draft.');
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Should Not Persist');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/first-job-cancel');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Add a job' })).toHaveCount(0);
  await expect(draft).toHaveValue('Unsaved first-job cancel draft.');
  const after = await (await page.request.get('/api/workspace')).json();
  expect(after.jobs).toHaveLength(before.jobs.length);
});

test('normalized duplicate URL adds research without losing accepted work', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Pine Example — Duplicate Engineer');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/first-job-duplicate');
  await page
    .getByRole('textbox', { name: 'Research notes' })
    .fill('First fictional look.');
  await page.getByRole('button', { name: 'Save job' }).click();
  await page.getByRole('textbox', { name: 'Blocker or missing fact' }).fill('');
  const draft = 'Exact fictional accepted wording for the duplicate check.';
  await page
    .getByRole('textbox', { name: 'Application answer or outreach draft' })
    .fill(draft);
  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill(
      'https://example.com/jobs/first-job-duplicate?utm_source=board&utm_campaign=x',
    );
  await expect(
    page.getByText(/matches Pine Example — Duplicate Engineer/),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Pine Example — Duplicate Engineer');
  await page
    .getByRole('textbox', { name: 'Research notes' })
    .fill('Second fictional look.');
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(
    page.getByText('Research added to the existing job.'),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Application answer or outreach draft' }),
  ).toHaveValue(draft);
  const workspace = await (await page.request.get('/api/workspace')).json();
  const job = workspace.jobs.find(
    (row: { job_key: string }) =>
      row.job_key === 'https://example.com/jobs/first-job-duplicate',
  );
  expect(job).toMatchObject({
    id: expect.any(String),
    status: 'Ready',
    draft,
    accepted_draft: draft,
  });
  expect(
    workspace.sources.filter(
      (row: { job_key: string }) => row.job_key === job.job_key,
    ),
  ).toHaveLength(2);
});

test('double-submit does not duplicate the job or identical notes', async ({
  page,
}) => {
  await signIn(page);
  const before = await (await page.request.get('/api/workspace')).json();
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Birch Example — Double Submit Engineer');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/first-job-double');
  await page
    .getByRole('textbox', { name: 'Research notes' })
    .fill('Identical fictional notes.');
  const save = page.getByRole('button', { name: 'Save job' });
  await save.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(
    page.getByText('Job saved. Continue from the selected record.'),
  ).toBeVisible();
  const after = await (await page.request.get('/api/workspace')).json();
  const matches = after.jobs.filter(
    (row: { name: string }) =>
      row.name === 'Birch Example — Double Submit Engineer',
  );
  expect(matches).toHaveLength(1);
  expect(
    after.sources.filter(
      (row: { job_key: string }) => row.job_key === matches[0].job_key,
    ),
  ).toHaveLength(1);
  expect(after.jobs.length).toBe(before.jobs.length + 1);
});

test('delayed add-job save keeps in-flight draft edits and still adds the job', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Cedar Example — Existing Role');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/first-job-existing');
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(
    page.getByRole('heading', { name: 'Cedar Example — Existing Role' }),
  ).toBeVisible();
  let releaseImport = () => {};
  const heldImport = new Promise<void>((resolve) => {
    releaseImport = resolve;
  });
  await page.route('**/api/workspace', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { action?: string };
      if (body.action === 'import') {
        await heldImport;
      }
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Willow Example — Added Role');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/first-job-added');
  await page.getByRole('button', { name: 'Save job' }).click();
  const draft = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  await draft.fill('Typed while add-job was in flight.');
  releaseImport();
  await expect(page.getByText(/Job saved/)).toBeVisible();
  await expect(draft).toHaveValue('Typed while add-job was in flight.');
  await expect(
    page.getByRole('heading', { name: 'Cedar Example — Existing Role' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Willow Example — Added Role/ }),
  ).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).json();
  expect(
    workspace.jobs.some(
      (row: { name: string }) => row.name === 'Willow Example — Added Role',
    ),
  ).toBe(true);
  expect(
    workspace.jobs.some(
      (row: { name: string }) => row.name === 'Cedar Example — Existing Role',
    ),
  ).toBe(true);
});

test('add-job form from another account is not written after the viewer changes', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('Owner A private title');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/owner-a-private');
  await page
    .getByRole('textbox', { name: 'Research notes' })
    .fill('Owner A private notes.');
  const imports: unknown[] = [];
  const ownerBJob = {
    id: 'owner-b-job',
    job_key: 'https://example.com/jobs/owner-b',
    name: 'Maple Example — Owner B',
    url: 'https://example.com/jobs/owner-b',
    status: 'Held',
    blocker: '',
    draft: 'Owner B selected draft.',
    accepted_draft: null,
    version: 1,
  };
  await page.route('**/api/workspace', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        json: {
          viewer: 'owner-b',
          jobs: [ownerBJob],
          sources: [],
          events: [],
          facts: [],
        },
      });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        action?: string;
        rows?: unknown;
      };
      if (body.action === 'import') imports.push(body);
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        json: { error: 'This add-job form belongs to a different account.' },
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(page.getByText('Owner A private notes.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Add a job' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Maple Example — Owner B/ }),
  ).toBeVisible();
  expect(imports).toHaveLength(0);
});

test('first-job save 401 clears private fields and forged import cannot write', async ({
  page,
  request,
}) => {
  const denied = await request.post('/api/workspace', {
    headers: {
      'oai-authenticated-user-id': 'forged-owner',
      'oai-authenticated-user-email': 'forged@example.com',
    },
    data: {
      action: 'import',
      rows: [
        {
          url: 'first-job:https://example.com/jobs/forged',
          Name: 'Forged Example',
          Job: 'https://example.com/jobs/forged',
          Status: 'Held',
          Notes: 'Must not persist.',
        },
      ],
    },
  });
  expect(denied.status()).toBe(401);
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { jobs: [], sources: [], events: [], facts: [] },
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Sign in first.' }),
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No jobs yet' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Role title' })
    .fill('PRIVATE_FIRST_JOB_TITLE');
  await page
    .getByRole('textbox', { name: 'Posting URL' })
    .fill('https://example.com/jobs/first-job-expiry');
  await page
    .getByRole('textbox', { name: 'Research notes' })
    .fill('PRIVATE_FIRST_JOB_NOTES');
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace' }),
  ).toBeVisible();
  await expect(page.getByText('PRIVATE_FIRST_JOB_TITLE')).toHaveCount(0);
  await expect(page.getByText('PRIVATE_FIRST_JOB_NOTES')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add job', exact: true }),
  ).toHaveCount(0);
});
