import { expect, test } from '@playwright/test';

test('scout research becomes an exact reviewed application with one execution and persistent evidence', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const response = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Application Pilot Engineer',
          Job: 'https://employer.example/jobs/pilot',
          url: 'https://scout.example/observations/pilot',
          Status: 'Held',
          Notes:
            'Fictional scouting evidence; source status cannot authorize work.',
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/applications');
  await page.getByText('Application permissions · disabled').click();
  await page.getByLabel('Enable application execution').check();
  await page
    .getByLabel('Cedar Example — Application Pilot Engineer · Held')
    .check();
  await page.getByRole('button', { name: 'Save permissions' }).click();
  await expect(page.getByRole('status')).toContainText('Permissions saved');
  await page.getByText('Prepare an application', { exact: true }).click();
  await page
    .getByLabel('Job', { exact: true })
    .selectOption({ label: 'Cedar Example — Application Pilot Engineer' });
  await page
    .getByLabel('Exact answer')
    .fill('Avery Example\nExact second line');
  await page
    .getByLabel('Exact files')
    .setInputFiles({
      name: 'resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Fictional exact resume\nSecond line'),
    });
  await expect(
    page.getByRole('button', { name: 'Save exact proposal' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Save exact proposal' }).click();
  await expect(page.getByRole('status')).toContainText('Exact proposal saved');
  await expect(page.getByRole('article')).toContainText('Review required');
  await page
    .getByRole('button', { name: 'Approve this exact application' })
    .click();
  await expect(page.getByRole('article')).toContainText(
    'Explicit approval recorded',
  );
  await page
    .getByRole('button', { name: 'Begin this application once' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Execution permitted once',
  );
  await expect(
    page.getByRole('button', { name: 'Begin this application once' }),
  ).toHaveCount(0);
  // Interruption recovery reopens persisted evidence without issuing a permit.
  await page.reload();
  await page
    .getByRole('button', {
      name: 'Cedar Example — Application Pilot Engineer · executing · ChatGPT',
    })
    .click();
  await expect(page.getByRole('article')).toContainText(
    'Avery Example\nExact second line',
  );
  const download = page.waitForEvent('download');
  await page
    .getByRole('link', { name: 'resume.txt · download exact file' })
    .click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(
    'Fictional exact resume\nSecond line',
  );
  await page
    .getByLabel('Employer confirmation or reason for uncertainty')
    .fill('Fictional employer accepted application ABC-123');
  await page
    .getByRole('button', { name: 'Record confirmed submission' })
    .click();
  await expect(page.getByRole('article')).toContainText('submitted');
  await page.reload();
  await page
    .getByRole('button', {
      name: 'Cedar Example — Application Pilot Engineer · submitted · ChatGPT',
    })
    .click();
  await expect(page.getByRole('article')).toContainText('ABC-123');
  const data = await (await page.request.get('/api/applications')).json();
  const op = data.operations.find(
    (o: { state: string }) => o.state === 'submitted',
  );
  const repeated = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: data.viewer,
      id: op.id,
      digest: op.digest,
    },
  });
  expect(repeated.status()).toBe(409);
  const workspace = await (await page.request.get('/api/workspace')).json();
  const job = workspace.jobs.find((j: { id: string }) => j.id === op.job_id);
  expect(job.status).toBe('Submitted');
  expect(job.accepted_draft).toBeNull();
});
