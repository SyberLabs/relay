import { expect, test, type Page } from '@playwright/test';
import { enableInspectJob } from './enable-inspect-job';

const question = 'Which fictional incident should the agent describe?';
const answer = 'PRIVATE_FICTIONAL_UNSAVED_ANSWER';

async function fixture(page: Page, suffix: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const name = `Runtime expiry — ${suffix}`;
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: name,
          url: `https://example.com/research/runtime-expiry-${suffix}`,
          Job: `https://example.com/jobs/runtime-expiry-${suffix}`,
          Status: 'Held',
          Notes: 'Fictional runtime privacy regression.',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  const workspace = await (await page.request.get('/api/workspace')).json();
  const job = workspace.jobs.find((row: { name: string }) => row.name === name);
  expect(job).toBeTruthy();
  await enableInspectJob(page, workspace.viewer, job.id);
  const reply = {
    viewer: workspace.viewer,
    mode: 'memory',
    session: {
      session_id: `fictional-session-${suffix}`,
      job_id: job.id,
      provider: 'memory',
      status: 'requires_action',
      turn_id: `fictional-turn-${suffix}`,
      park: { kind: 'answer', arguments: { question } },
      operation_id: null,
      digest: null,
      authorized: false,
      begin: false,
      capabilities: [],
    },
  };
  await page.route('**/api/agents?*', (route) =>
    route.fulfill({ json: reply }),
  );
  await page.goto(`/?job=${encodeURIComponent(job.id)}`);
  const panel = page.getByRole('region', { name: 'Agent session' });
  await expect(panel).toContainText(question);
  await panel.getByRole('textbox', { name: 'Your answer' }).fill(answer);
  return { panel, reply };
}

for (const method of ['GET', 'POST']) {
  test(`runtime ${method} 401 clears private workspace before parsing its body`, async ({
    page,
  }) => {
    const { panel } = await fixture(page, method.toLowerCase());
    await page.route(
      method === 'GET' ? '**/api/agents?*' : '**/api/agents',
      (route) =>
        route.fulfill({
          status: 401,
          contentType: 'text/plain',
          body: 'Sign in.',
        }),
    );
    if (method === 'GET') {
      await page.evaluate(() =>
        document.dispatchEvent(new Event('visibilitychange')),
      );
    } else {
      await panel
        .getByRole('button', { name: 'Return answer to agent' })
        .click();
    }
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Your private workspace' }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Your answer' }),
    ).toHaveCount(0);
    await expect(page.getByText(question, { exact: true })).toHaveCount(0);
  });
}

test('late runtime read cannot restore content after another read expires the session', async ({
  page,
}) => {
  const { panel, reply } = await fixture(page, 'late');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    started = resolve;
  });
  let first = true;
  await page.route('**/api/agents?*', async (route) => {
    if (first) {
      first = false;
      started();
      await pending;
      await route.fulfill({ json: reply });
    } else {
      await route.fulfill({ status: 401, json: { error: 'Sign in.' } });
    }
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await held;
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(panel).toHaveCount(0);
  const late = page.waitForResponse(
    (response) =>
      response.url().includes('/api/agents?') && response.status() === 200,
  );
  release();
  await late;
  await expect(
    page.getByRole('heading', { name: 'Your private workspace' }),
  ).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(question, { exact: true })).toHaveCount(0);
});

test('runtime mutation refusal preserves the parked question and unsaved answer without retry', async ({
  page,
}) => {
  const { panel } = await fixture(page, 'refusal');
  let attempts = 0;
  await page.route('**/api/agents', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 503,
      json: { error: 'Runtime temporarily unavailable.' },
    });
  });
  await panel.getByRole('button', { name: 'Return answer to agent' }).click();
  await expect(panel).toContainText('Runtime temporarily unavailable.');
  await expect(panel).toContainText(question);
  await expect(panel.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
    answer,
  );
  expect(attempts).toBe(1);
});
