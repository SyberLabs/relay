import { expect, test, type Page } from '@playwright/test';

type Job = {
  id: string;
  name: string;
  version: number;
  status: string;
  draft: string;
  accepted_draft: string | null;
  blocker: string;
};
type Workspace = {
  jobs: Job[];
  events: { job_id: string; kind: string; note: string }[];
};
async function workspace(page: Page): Promise<Workspace> {
  const response = await page.request.get('/api/workspace');
  expect(response.ok()).toBe(true);
  return response.json();
}
async function prepare(page: Page, suffix: string) {
  await page.goto('/signin-with-chatgpt?return_to=/');
  const response = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: ['Normal', 'Essay', 'Interrupted'].map((label) => ({
        url: `https://example.com/research/progress-${suffix}-${label}`,
        Name: `Progress ${suffix} — ${label} Engineer`,
        Job: `https://example.com/jobs/progress-${suffix}-${label}`,
        Status: 'Held',
        Notes: 'Fictional application recovery fixture.',
      })),
    },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(
    page.locator('section.queue .joblist button').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: /All opportunities/ }).click();
  return (await workspace(page)).jobs.filter((job) =>
    job.name.startsWith(`Progress ${suffix} —`),
  );
}
const draftField = (page: Page) =>
  page.getByRole('textbox', { name: 'Application answer or outreach draft' });
const blockerField = (page: Page) =>
  page.getByRole('textbox', { name: 'Blocker or missing fact' });
const noteField = (page: Page) =>
  page.getByRole('textbox', { name: 'Progress note', exact: true });
async function select(page: Page, job: Job) {
  await page.getByRole('button', { name: new RegExp(job.name) }).click();
  const notes = page.locator('details.review-notes');
  if ((await notes.getAttribute('open')) === null)
    await notes.locator('summary').click();
}
async function saveProgress(page: Page) {
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/workspace') &&
      response.request().method() === 'POST' &&
      response.request().postDataJSON().action === 'progress',
  );
  await page
    .getByRole('button', { name: 'Save progress only', exact: true })
    .click();
  expect((await response).ok()).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Save progress only', exact: true }),
  ).toBeDisabled();
}

for (const width of [1280, 390]) {
  test(`ordinary progress controls preserve accepted work and recover three applications at ${width}px`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const jobs = await prepare(page, `browser-${width}`);
    const normal = jobs.find((job) => job.name.includes('Normal'))!;
    const essay = jobs.find((job) => job.name.includes('Essay'))!;
    const interrupted = jobs.find((job) => job.name.includes('Interrupted'))!;
    const accepted =
      'Exact reviewed fictional application answer.\n\nThank you.';
    await select(page, normal);
    await blockerField(page).fill('');
    await draftField(page).fill(accepted);
    await page.getByRole('button', { name: 'Accept exact draft' }).click();
    await expect(
      page.getByText('Saved. Your review is preserved.'),
    ).toBeVisible();
    await draftField(page).fill(
      'Unsaved alternative wording must remain in this editor.',
    );
    await blockerField(page).fill('Human must complete the employer CAPTCHA.');
    await saveProgress(page);
    await expect(draftField(page)).toHaveValue(
      'Unsaved alternative wording must remain in this editor.',
    );
    let saved = await workspace(page);
    expect(saved.jobs.find((job) => job.id === normal.id)).toMatchObject({
      status: 'Ready',
      draft: accepted,
      accepted_draft: accepted,
      blocker: 'Human must complete the employer CAPTCHA.',
    });
    expect(saved.jobs.find((job) => job.id === essay.id)).toEqual(essay);
    expect(saved.jobs.find((job) => job.id === interrupted.id)).toEqual(
      interrupted,
    );
    await expect(
      page.locator('summary').filter({ hasText: /^Progress saved ·/ }),
    ).toBeVisible();
    await page
      .locator('summary')
      .filter({ hasText: /^Progress saved ·/ })
      .click();
    await expect(
      page.locator('pre').filter({ hasText: 'Blocker updated' }),
    ).toBeVisible();
    await draftField(page).fill(accepted);

    await select(page, essay);
    await blockerField(page).fill(
      'Need a reviewed example of resolving a production incident for the essay.',
    );
    await saveProgress(page);
    await expect(
      page.getByRole('button', { name: new RegExp(essay.name) }),
    ).toContainText(
      'Need a reviewed example of resolving a production incident',
    );
    await select(page, interrupted);
    await draftField(page).fill(
      'Saved essay opening before the worker stopped.',
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page.getByText('Saved. Your review is preserved.'),
    ).toBeVisible();
    await blockerField(page).fill(
      'Browser interrupted. Resume at the essay section; opening is saved.',
    );
    await saveProgress(page);
    saved = await workspace(page);

    // A fresh browser context has no editor or worker memory; only the same authenticated session.
    const resumed = await browser.newContext({
      storageState: await page.context().storageState(),
      viewport: { width, height: 844 },
    });
    try {
      const next = await resumed.newPage();
      await next.goto('/');
      await expect(
        next.getByRole('button', { name: /All opportunities/ }),
      ).toBeVisible();
      await next.getByRole('button', { name: /All opportunities/ }).click();
      await expect(
        next.getByRole('heading', { name: 'Queued opportunities', exact: true }),
      ).toBeVisible();
      for (const original of jobs) {
        const persisted = saved.jobs.find((job) => job.id === original.id)!;
        await select(next, original);
        await expect(draftField(next)).toHaveValue(persisted.draft);
        await expect(blockerField(next)).toHaveValue(persisted.blocker);
        await expect(
          next.locator('summary').filter({ hasText: /^Progress saved ·/ }),
        ).toBeVisible();
      }
      expect((await workspace(next)).jobs).toEqual(saved.jobs);
    } finally {
      await resumed.close();
    }
  });
}

test('nonblocking notes survive history and reload without preventing exact acceptance', async ({
  page,
}) => {
  const [job] = await prepare(page, 'notes');
  await select(page, job);
  const exact = 'A complete fictional draft, ready for human review.';
  const note = 'Draft complete. Next action: review the exact wording.';
  await draftField(page).fill(exact);
  await noteField(page).fill(note);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
  await expect(noteField(page)).toHaveValue(note);
  expect(JSON.stringify((await workspace(page)).events)).not.toContain(note);
  await saveProgress(page);
  await expect(noteField(page)).toHaveValue('');
  const saved = (await workspace(page)).jobs.find((row) => row.id === job.id)!;
  expect(saved).toMatchObject({
    draft: exact,
    blocker: '',
    accepted_draft: null,
    status: 'Held',
  });
  await page.reload();
  await page.getByRole('button', { name: /All opportunities/ }).click();
  await select(page, job);
  await page
    .locator('summary')
    .filter({ hasText: /^Progress saved ·/ })
    .click();
  await expect(page.locator('pre').filter({ hasText: note })).toBeVisible();
  const accept = page.getByRole('button', { name: 'Accept exact draft' });
  await expect(accept).toBeEnabled();
  // Synthetic regression only; this does not establish personal approval.
  await accept.click();
  await expect(page.getByText('This exact draft is accepted.')).toBeVisible();
  await noteField(page).fill('Review recorded; prepare the next application.');
  await expect(page.getByText('This exact draft is accepted.')).toBeVisible();
  await saveProgress(page);
  await expect(page.getByText('This exact draft is accepted.')).toBeVisible();
  expect(
    (await workspace(page)).jobs.find((row) => row.id === job.id),
  ).toMatchObject({
    draft: exact,
    accepted_draft: exact,
    status: 'Ready',
    blocker: '',
  });
});

test('nonblocking progress cannot clear a genuine hold or create acceptance', async ({
  page,
}) => {
  const [job] = await prepare(page, 'hold');
  await select(page, job);
  const hold =
    'Do not submit until the candidate confirms the required work location.';
  await blockerField(page).fill(hold);
  await saveProgress(page);
  await draftField(page).fill(
    'Fictional draft awaiting location confirmation.',
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
  await noteField(page).fill(
    'Research is complete; wording is ready to review.',
  );
  await saveProgress(page);
  await expect(blockerField(page)).toHaveValue(hold);
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeDisabled();
  const before = await workspace(page);
  const current = before.jobs.find((row) => row.id === job.id)!;
  const refusal = await page.request.post('/api/workspace', {
    data: {
      action: 'save',
      id: job.id,
      version: current.version,
      draft: current.draft,
      blocker: current.blocker,
      status: 'Ready',
    },
  });
  expect(refusal.status()).toBe(400);
  expect(await workspace(page)).toEqual(before);
  expect(
    before.events.filter(
      (event) => event.job_id === job.id && event.kind === 'Draft accepted',
    ),
  ).toHaveLength(0);
});

test('stale progress and gateway refusals preserve unsaved inputs and newer saved work', async ({
  page,
}) => {
  const [job] = await prepare(page, 'refusal');
  await select(page, job);
  await draftField(page).fill('Local unsaved draft stays visible.');
  await blockerField(page).fill('Local next action stays visible.');
  await noteField(page).fill('Nonblocking local progress stays visible.');
  const newer = await page.request.post('/api/workspace', {
    data: {
      action: 'save',
      id: job.id,
      version: job.version,
      status: 'Ready',
      draft: 'Newer exact reviewed draft from another session.',
      blocker: '',
    },
  });
  expect(newer.ok()).toBe(true);
  const before = await workspace(page);
  const refusal = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.request().postDataJSON().action === 'progress',
  );
  await page
    .getByRole('button', { name: 'Save progress only', exact: true })
    .click();
  expect((await refusal).status()).toBe(409);
  await expect(
    page.getByText('This record changed. Reload before saving.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(draftField(page)).toHaveValue(
    'Local unsaved draft stays visible.',
  );
  await expect(blockerField(page)).toHaveValue(
    'Local next action stays visible.',
  );
  expect(await workspace(page)).toEqual(before);
  await expect(noteField(page)).toHaveValue(
    'Nonblocking local progress stays visible.',
  );

  await page.getByRole('button', { name: 'Reload this record' }).click();
  for (const status of [403, 429, 503]) {
    await draftField(page).fill(`Unsaved draft after ${status}.`);
    await blockerField(page).fill(`Next action after ${status}.`);
    await noteField(page).fill(`Nonblocking note after ${status}.`);
    let attempts = 0;
    await page.route('**/api/workspace', async (route) => {
      if (
        route.request().method() === 'POST' &&
        route.request().postDataJSON().action === 'progress'
      ) {
        attempts++;
        await route.fulfill({
          status,
          json: { error: `Fictional ${status} refusal.` },
        });
      } else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Save progress only', exact: true })
      .click();
    await expect(page.getByText(`Fictional ${status} refusal.`)).toBeVisible();
    await expect(draftField(page)).toHaveValue(
      `Unsaved draft after ${status}.`,
    );
    await expect(blockerField(page)).toHaveValue(
      `Next action after ${status}.`,
    );
    expect(await workspace(page)).toEqual(before);
    expect(attempts).toBe(1);
    await expect(noteField(page)).toHaveValue(
      `Nonblocking note after ${status}.`,
    );
    await page.unroute('**/api/workspace');
  }
});

type RegisteredTool = {
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};
async function tool(page: Page, name: string, input: Record<string, unknown>) {
  await page.waitForFunction(
    (name) =>
      !!(window as Window & { relayTestTools?: Record<string, RegisteredTool> })
        .relayTestTools?.[name],
    name,
  );
  return page.evaluate(
    async ({ name, input }) => {
      const tools = (
        window as unknown as Window & {
          relayTestTools: Record<string, RegisteredTool>;
        }
      ).relayTestTools;
      return tools[name].execute(input);
    },
    { name, input },
  );
}

test('registered progress tool survives reload and an ambiguous reply without duplicate history', async ({
  page,
}) => {
  // This supplies the browser registration surface, not an external Grok or ChatGPT client.
  await page.addInitScript(() => {
    const tools: Record<string, unknown> = {};
    Object.assign(window, { relayTestTools: tools });
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: (
          entry: { name: string },
          { signal }: { signal: AbortSignal },
        ) => {
          tools[entry.name] = entry;
          signal.addEventListener('abort', () => {
            if (tools[entry.name] === entry) delete tools[entry.name];
          });
        },
      },
    });
  });
  const jobs = await prepare(page, 'registered');
  const job = jobs.find((job) => job.name.includes('Interrupted'))!;
  await tool(page, 'relay_stage_draft', {
    id: job.id,
    version: job.version,
    draft: 'Saved wording before the agent browser disappeared.',
    blocker: '',
  });
  const staged = (await workspace(page)).jobs.find((row) => row.id === job.id)!;
  const input = {
    id: job.id,
    version: staged.version,
    operation_id: 'browser-interrupted-progress-1',
    note: 'Essay opening is saved. Browser stopped before the final section.',
    blocker: 'Resume the final essay section.',
  };
  // Discard the first successful response, as a disconnected caller might.
  await tool(page, 'relay_save_progress', input);
  const once = await workspace(page);
  await page.reload();
  const replay = await tool(page, 'relay_save_progress', input);
  expect(replay).toMatchObject({ ok: true, replayed: true });
  expect(await workspace(page)).toEqual(once);
  const recovered = (await tool(page, 'relay_read_workspace', {})) as {
    jobs: Job[];
  };
  expect(recovered.jobs.find((row) => row.id === job.id)).toMatchObject({
    draft: staged.draft,
    status: staged.status,
    accepted_draft: null,
    blocker: input.blocker,
  });
  for (const other of jobs.filter((row) => row.id !== job.id))
    expect(recovered.jobs.find((row) => row.id === other.id)).toEqual(other);
  expect(
    once.events.filter(
      (event) => event.job_id === job.id && event.kind === 'Progress saved',
    ),
  ).toHaveLength(1);
  await page.getByRole('button', { name: /All opportunities/ }).click();
  await select(page, job);
  await expect(draftField(page)).toHaveValue(staged.draft);
  await expect(blockerField(page)).toHaveValue(input.blocker);
  await page
    .locator('summary')
    .filter({ hasText: /^Progress saved ·/ })
    .click();
  await expect(
    page.locator('pre').filter({ hasText: input.note }),
  ).toBeVisible();
});
