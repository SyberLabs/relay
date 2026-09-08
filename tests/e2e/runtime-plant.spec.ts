import { expect, test } from '@playwright/test';
import { openDraftTools } from './open-draft-tools';

test('the workspace workbench shows a full-width queue and review without sending', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#workspace-queue')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Review queue' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'What the agent knows about you' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Track jobs', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'History', exact: true }),
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
  await expect(page.locator('#workspace-queue .tally')).toHaveText(
    String(saved.jobs.length),
  );
  await expect(page.locator('#workspace-queue button.job')).toHaveCount(
    saved.jobs.length,
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
  await expect(page.locator('.workbench')).not.toContainText(/\d+%/);
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeDisabled();
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

test('workbench keeps Approve & send in view without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/runtime-workbench-viewport',
          Name: 'Runtime Workbench — Viewport Engineer',
          Job: 'https://example.com/jobs/runtime-workbench-viewport',
          Status: 'Held',
          Notes: 'Fictional viewport role.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();
  await page
    .getByRole('button', { name: /Runtime Workbench — Viewport Engineer/ })
    .click();

  for (const size of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
    { width: 720, height: 450 },
  ]) {
    await page.setViewportSize(size);
    const overflowX = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflowX, `${size.width}x${size.height} overflow`).toBe(false);
    const approve = page.getByRole('button', { name: 'Approve & send' });
    await expect(approve).toBeVisible();
    const box = await approve.boundingBox();
    expect(box, `${size.width}x${size.height} approve box`).toBeTruthy();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      size.height + 1,
    );
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const overflows = await page.evaluate(() => {
    const queue = document.querySelector('.q-list');
    const col = document.querySelector('.review-col');
    const style = (el: Element | null) =>
      el ? getComputedStyle(el).overflowY : '';
    return { queue: style(queue), col: style(col) };
  });
  expect(overflows.queue).toMatch(/auto|scroll/);
  expect(overflows.col).toMatch(/auto|scroll/);
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

test('History dialog traps focus, closes on Escape, and returns to the trigger', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/runtime-history-modal',
          Name: 'Runtime History — Modal Engineer',
          Job: 'https://example.com/jobs/runtime-history-modal',
          Status: 'Held',
          Notes: 'Fictional history dialog role.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();
  await page
    .getByRole('button', { name: /Runtime History — Modal Engineer/ })
    .click();
  const trigger = page.getByRole('button', { name: 'History', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'History' });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (node) => node instanceof HTMLDialogElement && node.matches(':modal'),
    ),
  ).toBe(true);
  await expect(page.locator('#history-title')).toBeFocused();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => {
      const dialog = document.querySelector('dialog.veil');
      return !!dialog && dialog.contains(document.activeElement);
    }),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('terminal inspect recovers after one failed workspace read without losing a dirty draft', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/runtime-terminal-refresh',
          Name: 'Runtime Terminal — Queue Engineer',
          Job: 'https://example.com/jobs/runtime-terminal-refresh',
          Status: 'Held',
          Notes: 'Fictional terminal queue refresh role.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  await page.reload();
  await page
    .getByRole('button', { name: /Runtime Terminal — Queue Engineer/ })
    .click();
  await openDraftTools(page);
  const draft = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  await draft.fill('Unsaved terminal queue draft.');
  const jobName = 'Runtime Terminal — Queue Engineer';
  await expect(
    page.locator('#workspace-queue').getByRole('button', { name: jobName }),
  ).toBeVisible();
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((row: { name: string }) => row.name === jobName);
  let failNextGet = false;
  let failedGets = 0;
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (failNextGet && failedGets === 0) {
      failedGets += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unable to load.' }),
      });
      return;
    }
    const current = await route.fetch();
    const body = await current.json();
    await route.fulfill({
      status: 200,
      json: {
        ...body,
        jobs: body.jobs.map(
          (row: { id: string; status: string; version: number }) =>
            row.id === job.id
              ? { ...row, status: 'Submitted', version: job.version + 1 }
              : row,
        ),
      },
    });
  });
  failNextGet = true;
  await page.route('**/api/applications?job=*', async (route) => {
    await route.fulfill({
      json: {
        viewer: ws.viewer,
        job_id: job.id,
        destination: 'https://employer.example/fictional',
        preparation_revision: 'revision-terminal',
        fields: [
          {
            label: 'Full name',
            value: 'Avery Example',
            unknown: false,
            filled: true,
          },
        ],
        files: [],
        ready: true,
        armed: false,
        operation_id: 'op-terminal-queue',
        digest: 'b'.repeat(64),
        state: 'submitted',
        recorded_result: 'submitted',
        accept_enabled: false,
      },
    });
  });
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(
    page.locator('#workspace-queue').getByRole('button', { name: jobName }),
  ).toContainText('Submitted');
  await expect(
    page.getByText('This record changed. Reload before saving.'),
  ).toBeVisible();
  await expect(draft).toHaveValue('Unsaved terminal queue draft.');
  expect(failedGets).toBe(1);
  await expect(page).not.toHaveURL(/signin-with-chatgpt/);
});

test('dirty editor asks before leaving to Your facts', async ({ page }) => {
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
  await openDraftTools(page);
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
    page.getByRole('region', { name: 'Prepared application' }),
  ).toBeVisible();
  await draft.fill('Unsaved plant draft before Track.');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
  await expect(page).not.toHaveURL(/\/track/);
  await expect(draft).toHaveValue('Unsaved plant draft before Track.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
  await expect(page).toHaveURL(/\/track/);
});
