import { expect, test } from '@playwright/test';
import { enableInspectJob } from './enable-inspect-job';

test('inspect accept stays off until armed then authorizes send without beginning', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Inspect Send Engineer',
          Job: 'https://employer.example/jobs/inspect-send',
          url: 'https://scout.example/observations/inspect-send',
          Status: 'Held',
          Notes: 'Fictional inspect-accept fixture.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Inspect Send'),
  );
  await enableInspectJob(page, ws.viewer, job.id);
  await page.goto('/');
  await page.getByRole('button', { name: /Inspect Send/ }).click();
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeDisabled();
  const prepared = await page.request.post('/api/applications', {
    data: {
      action: 'prepare',
      viewer: ws.viewer,
      job: job.id,
      actor: 'Fictional applying agent',
      destination: job.url,
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
  });
  expect(prepared.ok()).toBe(true);
  const armed = await page.request.post('/api/applications', {
    data: {
      action: 'arm',
      viewer: ws.viewer,
      job: job.id,
      id: 'op-inspect-1',
      actor: 'Fictional applying agent',
    },
  });
  expect(armed.ok()).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Accept and send' }).click();
  await expect(
    page.getByText(/waiting for the operative to send/i),
  ).toBeVisible();
  await expect(page.getByText('Operative is not on the page')).toHaveCount(0);
  const data = await (await page.request.get('/api/applications')).json();
  const op = data.operations.find(
    (o: { id: string }) => o.id === 'op-inspect-1',
  );
  expect(op.state).toBe('authorized');
  const begun = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: ws.viewer,
      id: op.id,
      digest: op.digest,
    },
  });
  expect(begun.ok()).toBe(true);
  expect((await begun.json()).execute).toBe(true);
});
