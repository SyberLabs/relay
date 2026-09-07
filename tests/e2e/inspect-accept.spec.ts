import { expect, test } from '@playwright/test';

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
  await page.request.post('/api/applications', {
    data: {
      action: 'policy',
      viewer: ws.viewer,
      version: 0,
      enabled: true,
      review: 'all',
      jobs: [job.id],
      maximum: 10,
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Inspect Send/ }).click();
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeDisabled();
  await page.request.post('/api/applications', {
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
  await page.request.post('/api/applications', {
    data: {
      action: 'arm',
      viewer: ws.viewer,
      job: job.id,
      id: 'op-inspect-1',
      actor: 'Fictional applying agent',
    },
  });
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Accept and send' }).click();
  await expect(
    page.getByText(/waiting for the operative to send/i),
  ).toBeVisible();
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
