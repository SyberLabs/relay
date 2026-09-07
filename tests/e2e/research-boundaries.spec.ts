import { expect, test } from '@playwright/test';

test('imported holds refuse acceptance and About You qualifications remain visible after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  const name = 'Northstar Research Boundaries — Backend Engineer';
  const imported = await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          url: 'https://example.com/research/boundaries',
          Name: name,
          Job: 'https://example.com/jobs/boundaries',
          Status: 'Held',
          Notes:
            'Do not submit until the location question is resolved.\nAbout You\n- Practical Node.js service development\n- SQL database experience\nBenefits\n- Lunch provided',
        },
      ],
    },
  });
  expect(imported.ok()).toBe(true);
  const before = await (await page.request.get('/api/workspace')).json();
  const job = before.jobs.find((row: { name: string }) => row.name === name);
  expect(job.blocker).toContain('restriction recorded');
  const refused = await page.request.post('/api/workspace', {
    data: {
      action: 'save',
      id: job.id,
      version: job.version,
      draft: 'A fictional draft for review.',
      blocker: job.blocker,
      status: 'Ready',
    },
  });
  expect(refused.status()).toBe(400);
  const after = await (await page.request.get('/api/workspace')).json();
  expect(after.jobs.find((row: { id: string }) => row.id === job.id)).toEqual(
    job,
  );
  const history = await (
    await page.request.post('/api/workspace', {
      data: { action: 'history', id: job.id, limit: 50 },
    })
  ).json();
  expect(history.events).toHaveLength(0);
  await page.reload();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(
    page.getByRole('textbox', { name: 'Blocker or missing fact' }),
  ).toHaveValue(job.blocker);
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeDisabled();
  const evidence = page
    .getByRole('list')
    .filter({ hasText: 'Practical Node.js service development' });
  await expect(evidence).toContainText('SQL database experience');
  await expect(evidence).not.toContainText('Lunch provided');
});
