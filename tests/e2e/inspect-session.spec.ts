import { expect, test, type Page } from '@playwright/test';
import { openDraftTools } from './open-draft-tools';

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
      page.getByRole('button', { name: 'Approve & send' }),
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

async function bumpJobVersionBySavingDraft(page: Page) {
  await openDraftTools(page);
  await page
    .getByRole('textbox', { name: 'Application answer or outreach draft' })
    .fill('Fictional draft for inspect freshness.');
  await page
    .locator('.core')
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
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
    } else await page.getByRole('button', { name: 'Approve & send' }).click();
    await expect(
      page.getByRole('link', { name: 'Sign in with ChatGPT' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Approve & send' }),
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
          await page.getByRole('button', { name: 'Approve & send' }).click();
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
        page.getByRole('button', { name: 'Approve & send' }),
      ).toBeDisabled();
      pending[1].release();
      await expect(
        page.getByText('Current job refusal', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Approve & send' }),
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

test('same-job version refresh disables stale approval without dropping a typed answer', async ({
  page,
}) => {
  await inspectFixture(page, 'version-refresh');
  const answer = page.getByRole('textbox', {
    name: 'Fictional project',
    exact: true,
  });
  await answer.fill('Keep my unsaved wording');
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeEnabled();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/applications?job=*', async (route) => {
    await held;
    await route.fallback();
  });
  await expect(
    page.getByRole('heading', { name: /Fictional version-refresh A/ }),
  ).toBeVisible();
  await openDraftTools(page);
  await page
    .getByRole('textbox', { name: 'Application answer or outreach draft' })
    .fill('Fictional draft for inspect freshness.');
  await page
    .locator('.core')
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeDisabled();
  await expect(answer).toHaveValue('Keep my unsaved wording');
  release();
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeEnabled();
  await expect(answer).toHaveValue('Keep my unsaved wording');
});

for (const action of ['approve', 'answer']) {
  for (const status of [200, 409, 401]) {
    test(`same-job version refresh still applies held Inspect ${action} ${status}`, async ({
      page,
    }) => {
      const fixture = await inspectFixture(
        page,
        `held-refresh-${action}-${status}`,
      );
      const answer = page.getByRole('textbox', {
        name: 'Fictional project',
        exact: true,
      });
      const saveAnswer = page.getByRole('button', { name: 'Save answer' });
      const approve = page.getByRole('button', { name: 'Approve & send' });
      await answer.fill('Keep my unsaved wording');
      if (action === 'answer') {
        fixture.changeRevision();
        await expect
          .poll(() => fixture.polls.includes('revision-after-edit'))
          .toBe(true);
      }
      const writes: Record<string, unknown>[] = [];
      const pending: { release: () => void }[] = [];
      await page.route('**/api/applications', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        writes.push(route.request().postDataJSON());
        await new Promise<void>((release) => pending.push({ release }));
        if (status === 401) {
          await route.fulfill({
            status: 401,
            contentType: 'text/html',
            body: '<h1>Sign in</h1>',
          });
          return;
        }
        await route.fulfill({
          status,
          json: status === 409 ? { error: 'Current inspect refusal' } : {},
        });
      });
      if (action === 'answer') await saveAnswer.click();
      else await approve.click();
      await expect.poll(() => pending.length).toBe(1);
      await expect(saveAnswer).toBeDisabled();
      const pollsBefore = fixture.polls.length;
      await bumpJobVersionBySavingDraft(page);
      await expect
        .poll(() => fixture.polls.length)
        .toBeGreaterThan(pollsBefore);
      await expect(saveAnswer).toBeDisabled();
      await expect(answer).toHaveValue('Keep my unsaved wording');
      const heldResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/applications') &&
          response.status() === status,
      );
      pending[0].release();
      await heldResponse;
      if (status === 401) {
        await expect(
          page.getByRole('link', { name: 'Sign in with ChatGPT' }),
        ).toBeVisible();
        await expect(approve).toHaveCount(0);
        await expect(
          page.getByText('Keep my unsaved wording', { exact: true }),
        ).toHaveCount(0);
        expect(writes).toHaveLength(1);
        if (action === 'answer')
          expect(writes[0].preparation_revision).toBe('revision-before-edit');
        return;
      }
      if (status === 409) {
        await expect(
          page.getByText('Current inspect refusal', { exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByText('Current inspect refusal', { exact: true }),
        ).toHaveCount(0);
      }
      await expect(saveAnswer).toBeEnabled();
      await expect(approve).toBeEnabled();
      await expect(answer).toHaveValue('Keep my unsaved wording');
      if (action !== 'answer') return;
      expect(writes[0].preparation_revision).toBe('revision-before-edit');
      if (status !== 409) return;
      await saveAnswer.click();
      await expect.poll(() => pending.length).toBe(2);
      pending[1].release();
      await expect(
        page.getByText('Current inspect refusal', { exact: true }),
      ).toBeVisible();
      await expect(saveAnswer).toBeEnabled();
      await expect(answer).toHaveValue('Keep my unsaved wording');
      expect(writes).toHaveLength(2);
      expect(writes[1].preparation_revision).toBe('revision-before-edit');
    });
  }
}
