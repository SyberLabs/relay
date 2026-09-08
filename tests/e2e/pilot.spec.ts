import { expect, test } from '@playwright/test';

test('pilot navigation keeps facts, exact review and history visible with advanced tools secondary', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(
    page.getByRole('link', { name: 'Track jobs', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByRole('group', { name: 'Outcomes' })).toBeVisible();
  await expect(
    sidebar.getByRole('group', { name: 'Reusable context' }),
  ).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Your facts' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Track jobs' })).toBeVisible();
  await expect(sidebar.getByRole('group', { name: 'Job list' })).toHaveCount(0);
  for (const href of ['/review', '/preferences', '/plan'])
    await expect(sidebar.locator(`a[href="${href}"]`)).toHaveCount(0);

  await sidebar.getByRole('link', { name: 'Your facts' }).click();
  await expect(
    page.getByText(/does not independently verify facts/),
  ).toBeVisible();
  const claim = 'Built a fictional inventory service for Larch Example';
  await page.getByRole('textbox', { name: 'Resume text' }).fill(claim);
  await page.getByRole('button', { name: 'Extract candidate facts' }).click();
  await page.getByRole('button', { name: 'Add 1 to ledger' }).click();
  const factRow = page.locator('article.factrow').filter({ hasText: claim });
  await factRow
    .getByRole('button', { name: 'Confirm fact', exact: true })
    .click();
  await expect(
    page.getByText('Confirmed by you. The agent may now cite this fact.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await page
    .getByRole('button', { name: 'Import research', exact: true })
    .click();
  const rows = [
    {
      url: 'https://example.com/research/pilot-trust',
      Name: 'Larch Example — Pilot Engineer',
      Job: 'https://example.com/jobs/pilot-trust',
      Status: 'Held',
      Notes:
        'Requirements:\nInventory service experience\nMinimum marine navigation experience',
    },
  ];
  await page
    .getByRole('textbox', { name: 'Research JSON' })
    .fill(JSON.stringify(rows));
  await page.getByRole('button', { name: 'Preview matches' }).click();
  await expect(
    page.getByText('Preview complete. No records were imported.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import into workspace' }).click();
  await page
    .getByRole('button', { name: /Larch Example — Pilot Engineer/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Evidence matches' }),
  ).toBeVisible();
  await expect(
    page.locator('.gates').getByText('Possible evidence', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.gates')
      .getByText('No matching evidence found', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/These do not assess your qualifications/),
  ).toBeVisible();
  const editor = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  const draft = 'I built a fictional inventory service for Larch Example.';
  await editor.fill(draft);
  await expect(
    page.getByText(/Saving here does not run the agent citation check/),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
  await expect(editor).toHaveValue(draft);
  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
  await expect(editor).toHaveValue(draft);
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Your review history' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Source history' }),
  ).toBeVisible();
  await editor.fill(draft + ' Thank you for considering my application.');
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeDisabled();
  await page.reload();
  await expect(editor).toHaveValue(
    draft + ' Thank you for considering my application.',
  );
  await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Your facts' }).click();
  await expect(
    page.locator('article.factrow').filter({ hasText: claim }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect(
    page.locator('aside.bar-nav').getByRole('link', { name: 'Track jobs' }),
  ).toBeVisible();
  await page
    .locator('aside.bar-nav')
    .getByRole('link', { name: 'Track jobs' })
    .click();
  await expect(page).toHaveURL(/\/track/);
  await sidebar.getByRole('link', { name: 'Advanced', exact: true }).click();
  await expect(page).toHaveURL(/\/advanced/);
  await expect(
    page.getByRole('heading', { name: 'Advanced', exact: true }),
  ).toBeVisible();
  for (const name of ['Batch review', 'Preferences', 'This week'])
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
});

test('advanced navigation preserves planning, preferences and logged batch review', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/advanced-pilot-a',
          Name: 'Advanced Example — Backend Engineer',
          Job: 'https://example.com/jobs/advanced-pilot-a',
          Status: 'Held',
          Notes: 'Fictional backend role.',
        },
        {
          url: 'https://example.com/research/advanced-pilot-b',
          Name: 'Advanced Example — Data Engineer',
          Job: 'https://example.com/jobs/advanced-pilot-b',
          Status: 'Held',
          Notes: 'Fictional data role.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  const workspace = await (await page.request.get('/api/workspace')).json();
  const job = workspace.jobs.find(
    (row: { name: string }) =>
      row.name === 'Advanced Example — Backend Engineer',
  );
  const logged = await page.request.post('/api/drafts', {
    data: {
      action: 'log',
      job_id: job.id,
      body: 'Thank you for considering my application.',
      cited: [],
    },
  });
  expect(logged.ok()).toBe(true);
  await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
  await page
    .locator('aside.sidebar')
    .getByRole('link', { name: 'Advanced', exact: true })
    .click();
  await expect(
    page.getByText(/Experimental tools for planning and agent batches/),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Batch review', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Batch review', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/It can miss unsupported claims/)).toBeVisible();
  await page.getByRole('button', { name: 'Open review session' }).click();
  await expect(page.getByText('Review session open.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark reviewed as written' }).click();
  await expect(
    page.getByText(
      'Marked reviewed as written. Accept the exact job draft in the workspace.',
    ),
  ).toBeVisible();
  const after = await (await page.request.get('/api/workspace')).json();
  expect(
    after.jobs.find((row: { id: string }) => row.id === job.id).accepted_draft,
  ).toBeNull();
  await page
    .getByRole('button', { name: 'Close review and apply 0 rules' })
    .click();
  await expect(
    page.getByText('Session closed. 0 rules now apply to new drafts.'),
  ).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Advanced', exact: true })
    .click();
  const preferencesLoaded = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/preferences') &&
      response.request().method() === 'GET',
  );
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  const preferences = await (await preferencesLoaded).json();
  await expect(
    page.locator('.stats > div').nth(1).locator('strong'),
  ).toHaveText(String(preferences.pool).padStart(2, '0'));
  await expect(
    page.getByRole('heading', { name: 'Preferences', exact: true }),
  ).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Minutes per week' }).fill('90');
  await page.getByRole('button', { name: 'Save budget' }).click();
  await expect(page.getByText('Budget saved.')).toBeVisible();
  expect(
    (await (await page.request.get('/api/preferences')).json()).minutes,
  ).toBe(90);
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Advanced', exact: true })
    .click();
  await page.getByRole('link', { name: 'This week', exact: true }).click();
  await expect(
    page.getByText('Experimental plan score', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/A reply is not an offer/)).toBeVisible();
  await expect(page.getByText('of 90 minutes', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Expected best offer', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace', exact: true }),
  ).toBeVisible();
});
