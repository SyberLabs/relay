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
    page.getByRole('link', { name: 'Sign in with ChatGPT' }),
  ).toHaveCount(0);
  const baseline = await (await page.request.get('/api/workspace')).json();

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
  expect(workspace.jobs).toHaveLength(baseline.jobs.length);

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
  expect(
    workspace.jobs.find(
      (job: { job_key: string }) => job.job_key === research[0].Job,
    ),
  ).toMatchObject({
    status: 'Ready',
    draft,
    accepted_draft: draft,
  });
  expect(
    workspace.events.filter(
      (event: { kind: string; job_id: string }) =>
        event.kind === 'Draft accepted' &&
        event.job_id ===
          workspace.jobs.find(
            (job: { job_key: string }) => job.job_key === research[0].Job,
          ).id,
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
  expect(workspace.jobs).toHaveLength(baseline.jobs.length + 1);
  expect(workspace.sources).toHaveLength(baseline.sources.length + 1);
  expect(
    workspace.jobs.find(
      (job: { job_key: string }) => job.job_key === research[0].Job,
    ),
  ).toMatchObject({
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
  await expect(page.locator('#workspace-queue')).toBeVisible();
  const importBtn = page.getByRole('button', {
    name: 'Import research',
    exact: true,
  });
  await importBtn.click();
  await expect(importBtn).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('tab', { name: 'Tracker CSV' }).click();
  const panel = page.locator('#import-panel-csv');
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

test('a dirty editor asks before opening the saved facts screen', async ({
  page,
}) => {
  await page.goto('/signin-with-chatgpt?return_to=/');
  await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
  const explore = page.getByRole('button', { name: 'Explore example jobs' });
  if (await explore.isVisible()) {
    await explore.click();
    await expect(page.getByText('Workspace updated.')).toBeVisible();
  }
  await page.getByRole('button', { name: /All opportunities/ }).click();
  await page.locator('section.queue .joblist button').first().click();
  const draft = 'Unsaved dirty-navigation draft.';
  await page
    .getByRole('textbox', { name: 'Application answer or outreach draft' })
    .fill(draft);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Your facts' }).click();
  await expect(page).not.toHaveURL(/\/profile/);
  await expect(
    page.getByRole('textbox', { name: 'Application answer or outreach draft' }),
  ).toHaveValue(draft);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Your facts' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your profile' }),
  ).toBeVisible();
});

test('controls act on the adjacent panel they name', async ({ page }) => {
  await page.goto('/signin-with-chatgpt?return_to=/');
  await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
  await expect(page.locator('#workspace-queue')).toBeVisible();
  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('group', { name: 'Job list' })).toBeVisible();
  await expect(sidebar.getByRole('group', { name: 'Pages' })).toBeVisible();
  await expect(
    sidebar.getByRole('button', { name: /Review queue/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(sidebar.getByRole('link', { name: 'Your facts' })).toBeVisible();
  await expect(
    sidebar.getByRole('link', { name: 'Your facts' }),
  ).not.toHaveAttribute('aria-current', 'page');

  const importBtn = page.getByRole('button', {
    name: 'Import research',
    exact: true,
  });
  await expect(importBtn).toHaveAttribute('aria-expanded', 'false');
  await importBtn.click();
  await expect(importBtn).toHaveAttribute('aria-expanded', 'true');
  await importBtn.click();
  await expect(importBtn).toHaveAttribute('aria-expanded', 'true');
  const dock = page.locator('#import-dock');
  await expect(
    dock.getByRole('heading', { name: 'Import research' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      const panel = document.getElementById('import-dock');
      const queue = document.getElementById('workspace-queue');
      return !!(
        panel &&
        queue &&
        panel.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);
  await page.getByRole('tab', { name: 'Tracker CSV' }).click();
  await expect(
    dock.getByRole('heading', { name: 'Import a tracker CSV' }),
  ).toBeVisible();

  await sidebar.getByRole('button', { name: /All opportunities/ }).click();
  await expect(page.locator('#workspace-queue h2')).toHaveText(
    'All opportunities',
  );
  await expect(page).toHaveURL(/\?queue=All/);

  await sidebar.getByRole('link', { name: 'Your facts' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your profile' }),
  ).toBeVisible();
  await expect(
    page.locator('aside').getByRole('link', { name: 'Your facts' }),
  ).toHaveAttribute('aria-current', 'page');
  await page
    .locator('aside')
    .getByRole('group', { name: 'Job list' })
    .getByRole('link', { name: /Review queue/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
});

test('tracker import actions stay inside the window after a long preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto('/signin-with-chatgpt?return_to=/');
  await expect(page.locator('#workspace-queue')).toBeVisible();
  await page
    .getByRole('button', { name: 'Import research', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Tracker CSV' }).click();
  const rows = Array.from(
    { length: 24 },
    (_, i) =>
      `CsvCo${i},Engineer,https://example.com/jobs/csv-view-${i},"Note ${i}"`,
  );
  await page.getByLabel('Choose tracker CSV').setInputFiles({
    name: 'fictional-long-tracker.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(['Company,Role,URL,Notes', ...rows].join('\n')),
  });
  await expect(page.getByText(/Read 24 rows locally/)).toBeVisible();
  await page.getByRole('button', { name: 'Preview tracker records' }).click();
  const importAction = page.getByRole('button', {
    name: 'Import 24 research records',
  });
  await expect(importAction).toBeVisible();
  const box = await importAction.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(640);

  await page.setViewportSize({ width: 390, height: 720 });
  await importAction.scrollIntoViewIfNeeded();
  await expect(importAction).toBeVisible();
  const narrow = await importAction.boundingBox();
  expect(narrow).toBeTruthy();
  expect(narrow!.y).toBeGreaterThanOrEqual(0);
  expect(narrow!.y + narrow!.height).toBeLessThanOrEqual(720);
});

async function openImportDock(
  page: import('@playwright/test').Page,
  how: 'pointer' | 'keyboard' = 'pointer',
) {
  await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
  await expect(page.locator('#workspace-queue')).toBeVisible();
  const importBtn = page.getByRole('button', {
    name: 'Import research',
    exact: true,
  });
  await expect(importBtn).toBeVisible();
  await expect(importBtn).toBeEnabled();
  await expect(importBtn).toHaveAttribute('aria-expanded', 'false');
  if (how === 'keyboard') {
    await importBtn.focus();
    await expect(importBtn).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await importBtn.click();
  }
  await expect(importBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#import-dock')).toBeVisible();
}

test('keyboard users can reach and use both import modes', async ({ page }) => {
  await page.goto('/signin-with-chatgpt?return_to=/');
  await openImportDock(page, 'keyboard');
  const jsonTab = page.getByRole('tab', { name: 'Research JSON' });
  const csvTab = page.getByRole('tab', { name: 'Tracker CSV' });
  await jsonTab.focus();
  await expect(jsonTab).toHaveAttribute('aria-selected', 'true');
  await expect(jsonTab).toHaveAttribute('tabindex', '0');
  await expect(csvTab).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('ArrowRight');
  await expect(csvTab).toHaveAttribute('aria-selected', 'true');
  await expect(csvTab).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Import a tracker CSV' }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Source tracker')).toBeFocused();
  await csvTab.focus();
  await page.keyboard.press('Home');
  await expect(jsonTab).toHaveAttribute('aria-selected', 'true');
  await expect(jsonTab).toBeFocused();
  await expect(
    page.getByRole('textbox', { name: 'Research JSON' }),
  ).toBeVisible();
  await page.keyboard.press('End');
  await expect(csvTab).toBeFocused();
  await page.getByLabel('Choose tracker CSV').setInputFiles({
    name: 'fictional-keyboard-tracker.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Company,Role,URL,Notes\nKeyboard Co,Engineer,https://example.com/jobs/csv-keyboard,Keyboard research\n',
    ),
  });
  await expect(page.getByText(/Read 1 rows locally/)).toBeVisible();
  await page.getByRole('button', { name: 'Preview tracker records' }).click();
  await expect(
    page.getByText('Check every record below. Nothing has been saved.'),
  ).toBeVisible();
  await csvTab.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(jsonTab).toBeFocused();
  await page.getByRole('textbox', { name: 'Research JSON' }).fill(
    JSON.stringify([
      {
        url: 'https://example.com/research/keyboard-json',
        Name: 'Keyboard JSON — Engineer',
        Job: 'https://example.com/jobs/keyboard-json',
        Status: 'Held',
        Notes: 'Fictional keyboard JSON research.',
      },
    ]),
  );
  await page.getByRole('button', { name: 'Preview matches' }).click();
  await expect(
    page.getByText('Preview complete. No records were imported.'),
  ).toBeVisible();
});

test('delayed tracker preview cannot replace a saved import', async ({
  page,
}) => {
  await page.goto('/signin-with-chatgpt?return_to=/');
  await openImportDock(page);
  await page.getByRole('tab', { name: 'Tracker CSV' }).click();
  const panel = page.locator('#import-panel-csv');
  await panel.getByLabel('Choose tracker CSV').setInputFiles({
    name: 'fictional-delayed-tracker.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Company,Role,URL,Notes\nDelay Co,Engineer,https://example.com/jobs/csv-delayed,Delayed research\n',
    ),
  });
  await expect(panel.getByText(/Read 1 rows locally/)).toBeVisible();
  await panel.getByRole('button', { name: 'Preview tracker records' }).click();
  await expect(
    panel.getByText('Check every record below. Nothing has been saved.'),
  ).toBeVisible();
  await page.route('**/api/workspace', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { action?: string };
      if (body.action === 'preview')
        await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  const latePreview = page.waitForResponse((response) => {
    if (!response.url().includes('/api/workspace')) return false;
    if (response.request().method() !== 'POST') return false;
    const body = response.request().postDataJSON() as { action?: string };
    return body.action === 'preview';
  });
  await panel.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons
      .find((button) =>
        /Preview tracker records/.test(button.textContent || ''),
      )
      ?.click();
    buttons
      .find((button) =>
        /Import 1 research records/.test(button.textContent || ''),
      )
      ?.click();
  });
  await expect(panel.getByText(/Imported 1 research records/)).toBeVisible();
  await latePreview;
  await expect(
    panel.getByText('Check every record below. Nothing has been saved.'),
  ).toHaveCount(0);
  await expect(panel.getByText(/Imported 1 research records/)).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const job = workspace.jobs.find((item: { job_key: string }) =>
    item.job_key.endsWith('/csv-delayed'),
  );
  expect(job).toBeTruthy();
  expect(
    workspace.sources.filter(
      (item: { job_key: string }) => item.job_key === job.job_key,
    ),
  ).toHaveLength(1);
});
