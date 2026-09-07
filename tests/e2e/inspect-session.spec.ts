import { expect, test, type Page } from '@playwright/test';

async function inspectFixture(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: ['A', 'B'].map((suffix) => ({
        Name: `Fictional ${name} ${suffix}`,
        Job: `https://employer.example/inspect-session/${name}/${suffix}`,
        url: `https://evidence.example/inspect-session/${name}/${suffix}`,
        Status: 'Held',
        Notes: 'Fictional callback test; no employer action.',
      })),
    },
  });
  expect(imported.ok()).toBe(true);
  const ws = await (await page.request.get('/api/workspace')).json();
  const jobs = ['A', 'B'].map((suffix) =>
    ws.jobs.find(
      (job: { name: string }) => job.name === `Fictional ${name} ${suffix}`,
    ),
  );
  let revision = 'revision-before-edit';
  const polls: string[] = [];
  await page.route('**/api/applications?job=*', async (route) => {
    const jobId = new URL(route.request().url()).searchParams.get('job');
    polls.push(revision);
    await route.fulfill({
      json: {
        viewer: ws.viewer,
        job_id: jobId,
        destination: 'https://employer.example/fictional',
        preparation_revision: revision,
        fields: [
          {
            label: 'Fictional project',
            value: '',
            unknown: true,
            filled: false,
          },
        ],
        files: [],
        ready: true,
        armed: true,
        operation_id: `operation-${jobId}`,
        digest: 'a'.repeat(64),
        state: 'proposed',
        accept_enabled: true,
      },
    });
  });
  await page.goto('/');
  const choose = async (index: number) => {
    await page
      .getByRole('button', {
        name: new RegExp(`Fictional ${name} ${index ? 'B' : 'A'}`),
      })
      .click();
    await expect(
      page.getByRole('button', { name: 'Accept and send' }),
    ).toBeEnabled();
  };
  await choose(0);
  return {
    jobs,
    choose,
    polls,
    changeRevision: () => {
      revision = 'revision-after-edit';
    },
  };
}

for (const action of ['approve', 'answer']) {
  test(`Inspect ${action} handles non-JSON 401 by expiring the whole workspace`, async ({
    page,
  }) => {
    await inspectFixture(page, `expiry-${action}`);
    let writes = 0;
    await page.route('**/api/applications', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      writes += 1;
      await route.fulfill({
        status: 401,
        contentType: 'text/html',
        body: '<h1>Sign in</h1>',
      });
    });
    if (action === 'answer') {
      await page
        .getByRole('textbox', { name: 'Fictional project', exact: true })
        .fill('Private unsaved answer');
      await page.getByRole('button', { name: 'Save answer' }).click();
    } else await page.getByRole('button', { name: 'Accept and send' }).click();
    await expect(
      page.getByRole('link', { name: 'Sign in with ChatGPT' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Accept and send' }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Private unsaved answer', { exact: true }),
    ).toHaveCount(0);
    expect(writes).toBe(1);
  });
}

for (const action of ['approve', 'answer']) {
  for (const oldStatus of [200, 409]) {
    test(`late Inspect ${action} ${oldStatus} completion cannot change the next job's mutation`, async ({
      page,
    }) => {
      const fixture = await inspectFixture(page, `late-${action}-${oldStatus}`);
      const pending: { release: () => void }[] = [];
      await page.route('**/api/applications', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const index = pending.length;
        await new Promise<void>((release) => pending.push({ release }));
        await route.fulfill({
          status: index === 0 ? oldStatus : 409,
          json: {
            error: index === 0 ? 'Old job refusal' : 'Current job refusal',
          },
        });
      });
      const act = async () => {
        if (action === 'answer') {
          await page
            .getByRole('textbox', { name: 'Fictional project', exact: true })
            .fill('Fictional typed answer');
          await page.getByRole('button', { name: 'Save answer' }).click();
        } else
          await page.getByRole('button', { name: 'Accept and send' }).click();
      };
      await act();
      await expect.poll(() => pending.length).toBe(1);
      await fixture.choose(1);
      await act();
      await expect.poll(() => pending.length).toBe(2);
      // Observe completion before inspecting real component state.
      const oldResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/applications') &&
          response.status() === oldStatus,
      );
      pending[0].release();
      await oldResponse;
      await expect(
        page.getByText('Old job refusal', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Accept and send' }),
      ).toBeDisabled();
      pending[1].release();
      await expect(
        page.getByText('Current job refusal', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Accept and send' }),
      ).toBeEnabled();
      expect(pending.length).toBe(2);
    });
  }
}

test('a refused answer preserves text and the revision from when typing began', async ({
  page,
}) => {
  const fixture = await inspectFixture(page, 'answer-revision');
  const answer = page.getByRole('textbox', {
    name: 'Fictional project',
    exact: true,
  });
  await answer.fill('Keep my unsaved wording');
  fixture.changeRevision();
  await expect
    .poll(() => fixture.polls.includes('revision-after-edit'))
    .toBe(true);
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/applications', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes.push(route.request().postDataJSON());
    await route.fulfill({
      status: 403,
      json: { error: 'Complete verification before retrying.' },
    });
  });
  await page.getByRole('button', { name: 'Save answer' }).click();
  await expect(
    page.getByText('Complete verification before retrying.', { exact: true }),
  ).toBeVisible();
  await expect(answer).toHaveValue('Keep my unsaved wording');
  expect(writes).toHaveLength(1);
  expect(writes[0].preparation_revision).toBe('revision-before-edit');
});
