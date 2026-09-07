import { expect, test } from '@playwright/test';

test('apply overlay shows inspect summary without Accept and send', async ({
  page,
}) => {
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
  await expect(page.getByText('Operative status: armed')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Job list' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Applications' })).toHaveCount(0);

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
});
