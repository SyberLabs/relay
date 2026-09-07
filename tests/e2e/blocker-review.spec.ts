import { expect, test, type Page } from '@playwright/test';

async function state(page: Page) {
  const r = await page.request.get('/api/workspace');
  expect(r.ok()).toBe(true);
  return r.json();
}
async function setup(page: Page, suffix: string) {
  await page.goto('/signin-with-chatgpt?return_to=/');
  const r = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: ['Review', 'Next'].map((name) => ({
        Name: `Cedar ${suffix} — ${name} Engineer`,
        Job: `https://example.com/jobs/decision-${suffix}-${name}`,
        url: `https://example.com/research/decision-${suffix}-${name}`,
        Status: 'Held',
        Notes:
          'A personal anecdote might strengthen this optional answer. The available evidence already describes a relevant project. Please provide a specific example, your motivation, a detailed timeline, and personal attribution before the assistant continues. This is fictional test research.',
      })),
    },
  });
  expect(r.ok()).toBe(true);
  const imported = (await state(page)).jobs.filter((j: { name: string }) =>
    j.name.startsWith(`Cedar ${suffix} —`),
  );
  for (const job of imported) {
    const staged = await page.request.post('/api/workspace', {
      data: {
        action: 'save',
        id: job.id,
        version: job.version,
        status: 'Held',
        draft: '',
        blocker:
          'A personal anecdote might strengthen this optional answer. The available evidence already describes a relevant project. Please provide a specific example, your motivation, a detailed timeline, and personal attribution before the assistant continues. This is fictional test research.',
      },
    });
    expect(staged.ok()).toBe(true);
  }
  await page.reload();
  await page
    .getByRole('button', {
      name: new RegExp(`Cedar ${suffix} — Review Engineer`),
    })
    .click();
  return (await state(page)).jobs.find(
    (j: { name: string }) => j.name === `Cedar ${suffix} — Review Engineer`,
  );
}
async function decisionResponse(page: Page, click: () => Promise<void>) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/workspace') &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON().action === 'drafting-decision',
  );
  await click();
  return response;
}

for (const width of [1280, 390])
  test(`delegate, resume, review and revoke at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const job = await setup(page, String(width));
    const preferenceVersion = (await state(page)).draftingPreference.version;
    await expect(
      page.getByRole('heading', { name: 'Choose how to continue' }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Blocker or missing fact' }),
    ).toBeHidden();
    await expect(page.locator('.decision-summary')).toHaveText(
      'A personal anecdote might strengthen this optional answer.',
    );
    await page.getByText('Read full context', { exact: true }).click();
    await expect(page.locator('.decision-context')).toContainText(
      'detailed timeline',
    );
    await page.getByText('Read full context', { exact: true }).click();
    await page
      .getByRole('checkbox', {
        name: 'Don’t ask me about routine writing choices again',
      })
      .check();
    await page.screenshot({
      path: `outputs/ci/blocker-review-${width}.png`,
      fullPage: false,
    });
    const r = await decisionResponse(page, () =>
      page.getByRole('button', { name: 'Use your judgment' }).click(),
    );
    expect(r.ok()).toBe(true);
    const once = await state(page);
    expect(once.draftingPreference).toEqual({
      routine: true,
      version: preferenceVersion + 1,
    });
    expect(
      once.jobs.find((j: { id: string }) => j.id === job.id),
    ).toMatchObject({
      draft: job.draft,
      blocker: job.blocker,
      status: 'Held',
      accepted_draft: null,
    });
    await expect(
      page.getByRole('heading', { name: 'Ready for your assistant' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Accept exact draft' }),
    ).toBeDisabled();
    await page.reload();
    await page
      .getByRole('button', {
        name: new RegExp(`Cedar ${width} — Next Engineer`),
      })
      .click();
    await expect(
      page.getByText('Routine writing choices are delegated'),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: new RegExp(`Cedar ${width} — Review Engineer`),
      })
      .click();
    // The existing assistant resumes, chooses grounded wording, and stages it.
    // This exercises persistence and review boundaries, not model quality.
    const current = (await state(page)).jobs.find(
      (j: { id: string }) => j.id === job.id,
    );
    expect(current.drafting_direction).toContain(
      'Omit unsupported optional claims',
    );
    const staged = await page.request.post('/api/workspace', {
      data: {
        action: 'save',
        id: job.id,
        version: current.version,
        status: 'Held',
        draft:
          'I would welcome the opportunity to discuss the engineering role.',
        blocker: '',
      },
    });
    expect(staged.ok()).toBe(true);
    await page.reload();
    await page
      .getByRole('button', {
        name: new RegExp(`Cedar ${width} — Review Engineer`),
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Choose how to continue' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Accept exact draft' }),
    ).toBeEnabled();
    expect(
      (await state(page)).jobs.find((j: { id: string }) => j.id === job.id)
        .accepted_draft,
    ).toBeNull();
    await page.getByRole('button', { name: 'Accept exact draft' }).click();
    await expect(page.getByText('This exact draft is accepted.')).toBeVisible();
    const accepted = (await state(page)).jobs.find(
      (j: { id: string }) => j.id === job.id,
    );
    const reset = await decisionResponse(page, () =>
      page.getByRole('button', { name: 'Ask me again' }).click(),
    );
    expect(reset.ok()).toBe(true);
    const after = await state(page);
    expect(after.draftingPreference).toEqual({
      routine: false,
      version: preferenceVersion + 2,
    });
    expect(
      after.jobs.find((j: { id: string }) => j.id === job.id),
    ).toMatchObject({
      draft: accepted.draft,
      accepted_draft: accepted.accepted_draft,
      status: 'Ready',
    });
    await expect(
      page.getByText('Routine writing choices are delegated'),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

test('a required answer remains saved on refusals, stale conflict and account expiry', async ({
  page,
}) => {
  const job = await setup(page, 'required');
  await page.getByRole('button', { name: 'I’ll add context' }).click();
  const answer = page.getByRole('textbox', {
    name: 'Your answer or direction',
  });
  await answer.fill(
    'Use my confirmed project. I have not supplied the required location answer.',
  );
  for (const status of [403, 429, 503]) {
    const before = await state(page);
    let attempts = 0;
    await page.route('**/api/workspace', async (route) => {
      if (
        route.request().method() === 'POST' &&
        route.request().postDataJSON().action === 'drafting-decision'
      ) {
        attempts++;
        await route.fulfill({
          status,
          json: { error: `Fictional ${status} refusal.` },
        });
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Share with assistant' }).click();
    await expect(page.getByText(`Fictional ${status} refusal.`)).toBeVisible();
    await expect(answer).toHaveValue(
      'Use my confirmed project. I have not supplied the required location answer.',
    );
    expect(attempts).toBe(1);
    expect(await state(page)).toEqual(before);
    await page.unroute('**/api/workspace');
  }
  const newer = await page.request.post('/api/workspace', {
    data: {
      action: 'save',
      id: job.id,
      version: job.version,
      status: 'Held',
      draft: 'Newer saved draft.',
      blocker: 'Which location can you work from? Required by the employer.',
    },
  });
  expect(newer.ok()).toBe(true);
  const before = await state(page);
  const stale = await decisionResponse(page, () =>
    page.getByRole('button', { name: 'Share with assistant' }).click(),
  );
  expect(stale.status()).toBe(409);
  await expect(answer).toHaveValue(
    'Use my confirmed project. I have not supplied the required location answer.',
  );
  expect(await state(page)).toEqual(before);
  await page.route('**/api/workspace', (route) =>
    route.fulfill({ status: 401, json: { error: 'Sign in first.' } }),
  );
  await page.getByRole('button', { name: 'Reload this record' }).click();
  await page.getByRole('button', { name: 'Use your judgment' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Your answer or direction' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Sign in with ChatGPT' }),
  ).toBeVisible();
});

test('short user answer is job-specific and cannot confirm a personal fact or accept a draft', async ({
  page,
}) => {
  const job = await setup(page, 'answer');
  await page.getByRole('button', { name: 'I’ll add context' }).click();
  await page
    .getByRole('textbox', { name: 'Your answer or direction' })
    .fill('Use the existing project example.');
  const before = await state(page);
  const r = await decisionResponse(page, () =>
    page.getByRole('button', { name: 'Share with assistant' }).click(),
  );
  expect(r.ok()).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Ready for your assistant' }),
  ).toBeVisible();
  const after = await state(page);
  expect(after.jobs.find((j: { id: string }) => j.id === job.id)).toMatchObject(
    {
      drafting_direction: 'Use the existing project example.',
      blocker: job.blocker,
      accepted_draft: null,
    },
  );
  expect(after.facts).toEqual(before.facts);
  expect(after.draftingPreference).toEqual(before.draftingPreference);
});
