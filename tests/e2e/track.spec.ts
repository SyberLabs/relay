import { expect, test } from '@playwright/test';

test('a Ready job records an already completed submission with its receipt', async ({
  page,
}) => {
  let posted: Record<string, unknown> | null = null;
  let status = 'Ready';
  const job = {
    id: 'ready-job',
    name: 'Ready Example — Backend Engineer',
    version: 4,
    claims: [] as { id: string; claim: string; evidence: string }[],
  };
  await page.route('**/api/outcomes', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          outcomes: [],
          prep: [
            {
              ...job,
              status,
              receipt: posted ? String(posted.receipt) : null,
            },
          ],
          rates: {},
        },
      });
      return;
    }
    if (route.request().method() === 'POST') {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      status = 'Submitted';
      await route.fulfill({ json: { ok: true, status } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          viewer: 'track-mock',
          jobs: [
            {
              id: job.id,
              name: job.name,
              status,
            },
          ],
          sources: [],
          events: [],
          facts: [],
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.goto('/track');
  await expect(
    page.getByText('Ready Example — Backend Engineer'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record submission' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'rejected' })).toHaveCount(0);
  await expect(page.getByText('without a receipt')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Submission receipt' })
    .fill('confirmation https://example.com/receipt/ready');
  await page.getByRole('button', { name: 'Record submission' }).click();
  await expect(page.getByText('Recorded the submission.')).toBeVisible();
  expect(posted).toMatchObject({
    action: 'record',
    id: 'ready-job',
    version: 4,
    kind: 'submitted',
    receipt: 'confirmation https://example.com/receipt/ready',
  });
  await expect(page.getByRole('button', { name: 'rejected' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record submission' }),
  ).toHaveCount(0);
});

test('track sheet filters jobs and a row opens the plant', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/track-sheet-held',
          Name: 'Track Sheet Alpha — Unique Held Role',
          Job: 'https://example.com/jobs/track-sheet-held',
          Status: 'Held',
          Notes: 'Fictional held track-sheet role.',
        },
        {
          url: 'https://example.com/research/track-sheet-ready',
          Name: 'Track Sheet Beta — Unique Ready Role',
          Job: 'https://example.com/jobs/track-sheet-ready',
          Status: 'Held',
          Notes: 'Fictional ready track-sheet role.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  const workspace = await (await page.request.get('/api/workspace')).json();
  const ready = workspace.jobs.find(
    (job: { name: string }) =>
      job.name === 'Track Sheet Beta — Unique Ready Role',
  );
  const accepted = await page.request.post('/api/workspace', {
    data: {
      action: 'save',
      id: ready.id,
      version: ready.version,
      status: 'Ready',
      draft: 'Exact reviewed track-sheet draft.',
      blocker: '',
    },
  });
  expect(accepted.ok()).toBe(true);
  const saved = await (await page.request.get('/api/workspace')).json();

  await page.goto('/?queue=All');
  await expect(page).toHaveURL(/\/track$/);
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /All opportunities/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('link', { name: 'Unique Held Role' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Unique Ready Role' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Accepted drafts/ }).click();
  await expect(page).toHaveURL(/queue=Ready/);
  await expect(
    page.getByRole('link', { name: 'Unique Ready Role' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Unique Held Role' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Accepted drafts/ }).click();
  await expect(page).toHaveURL(/\/track$/);
  await page.getByRole('button', { name: /^Submitted/ }).click();
  await expect(
    page.getByRole('link', { name: 'Unique Ready Role' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Unique Held Role' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /All opportunities/ }).click();
  await page.getByRole('link', { name: 'Unique Ready Role' }).click();
  await expect(page).toHaveURL(new RegExp(`job=${ready.id}`));
  await expect(
    page.getByRole('heading', { name: 'Track Sheet Beta — Unique Ready Role' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Track Sheet Beta — Unique Ready Role' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Prepared application' }),
  ).toBeVisible();
  await expect(
    page.locator('#workspace-queue').getByRole('button', {
      name: 'Track Sheet Beta — Unique Ready Role',
    }),
  ).toHaveCount(0);
  const notes = page.locator('details.review-notes');
  if ((await notes.getAttribute('open')) === null)
    await notes.locator('summary').click();
  await expect(
    page.getByRole('textbox', { name: 'Application answer or outreach draft' }),
  ).toHaveValue('Exact reviewed track-sheet draft.');
  const afterNavigation = await (
    await page.request.get('/api/workspace')
  ).json();
  expect(afterNavigation.jobs).toEqual(saved.jobs);
  expect(afterNavigation.events).toEqual(saved.events);
});
