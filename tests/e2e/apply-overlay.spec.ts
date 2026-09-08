import { expect, test } from '@playwright/test';
import { enableInspectJob } from './enable-inspect-job';

test('apply overlay shows inspect summary without Accept and send', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: undefined,
    });
  });
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Apply Overlay Engineer',
          Job: 'https://employer.example/jobs/apply-overlay',
          url: 'https://scout.example/observations/apply-overlay',
          Status: 'Held',
          Notes: 'Fictional apply-overlay fixture.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Apply Overlay'),
  );
  await enableInspectJob(page, ws.viewer, job.id);
  await page.request.post('/api/applications', {
    data: {
      action: 'prepare',
      preparation_revision: null,
      viewer: ws.viewer,
      job: job.id,
      actor: 'Fictional applying agent',
      destination: job.url,
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
  });
  await page.request.post('/api/applications', {
    data: {
      action: 'arm',
      preparation_revision: (
        await (await page.request.get(`/api/applications?job=${job.id}`)).json()
      ).preparation_revision,
      viewer: ws.viewer,
      job: job.id,
      id: 'op-apply-overlay-1',
      actor: 'Fictional applying agent',
    },
  });
  await page.goto(`/apply?job=${encodeURIComponent(job.id)}`);
  await expect(page.getByRole('heading', { name: 'Inspect' })).toBeVisible();
  await expect(page.getByText(/Destination host/)).toBeVisible();
  await expect(page.getByText('employer.example')).toBeVisible();
  await expect(page.getByText('Full name')).toBeVisible();
  await expect(
    page.getByText('Accept lives on the human workspace, not here.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('status', { name: 'Last verb result' }),
  ).toHaveText('No verb result yet.');
  await expect(page.getByText('Operative status: armed')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save answer' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('group', { name: 'Job list' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Applications' })).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(() => typeof window.relay?.relay_inspect_application),
    )
    .toBe('function');
  await page.evaluate(
    (jobId) => window.relay!.relay_inspect_application({ job: jobId }),
    job.id,
  );
  const lastVerb = page.getByRole('status', { name: 'Last verb result' });
  await expect(lastVerb).toContainText('relay_inspect_application');
  await expect(lastVerb).toContainText(job.id);
  const successfulTranscript = await lastVerb.textContent();
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '60' },
      json: { error: 'Fictional quota refusal.', code: 'usage_limit' },
    }),
  );
  const refusal = await page.evaluate(async () => {
    try {
      await window.relay!.relay_read_profile({});
      return null;
    } catch (error) {
      return JSON.parse(error instanceof Error ? error.message : String(error));
    }
  });
  expect(refusal).toMatchObject({
    status: 429,
    code: 'usage_limit',
    retry_after: '60',
  });
  await expect(lastVerb).toHaveText(successfulTranscript!);
  await page.unroute('**/api/profile');

  const inspect = await (
    await page.request.get(
      `/api/applications?job=${encodeURIComponent(job.id)}`,
    )
  ).json();
  await page.request.post('/api/applications', {
    data: {
      action: 'approve',
      viewer: ws.viewer,
      id: inspect.operation_id,
      digest: inspect.digest,
    },
  });
  await expect(page.getByText('Operative status: waiting')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toHaveCount(0);
  await page.goto('/profile');
  await expect.poll(() => page.evaluate(() => window.relay ?? null)).toBeNull();
});
