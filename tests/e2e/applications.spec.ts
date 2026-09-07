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
    .getByRole('combobox', { name: 'Job', exact: true })
    .selectOption({ label: 'Cedar Example — Application Pilot Engineer' });
  await page
    .getByLabel('Exact answer')
    .fill('Avery Example\nExact second line');
  await page.getByLabel('Exact files').setInputFiles({
    name: 'resume.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(148000, 65),
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
  expect(Buffer.concat(chunks).equals(Buffer.alloc(148000, 65))).toBe(true);
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

test('expired application session clears proposed private fields before any work', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.goto('/applications');
  await page.getByText('Prepare an application', { exact: true }).click();
  await page.getByLabel('Exact answer').fill('Private fictional answer');
  await page.route('**/api/applications?after=*', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'text/plain',
      body: 'Unauthorized',
    }),
  );
  await page.getByRole('button', { name: 'Refresh history' }).click();
  await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();
  await expect(page.getByLabel('Exact answer')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save exact proposal' }),
  ).toHaveCount(0);
  await expect(page.getByText('Private fictional answer')).toHaveCount(0);
});

test('late file reads cannot replace the most recent selection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalRead = File.prototype.arrayBuffer;
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let hashFinished: () => void;
    const oldHashDone = new Promise<void>((resolve) => {
      hashFinished = resolve;
    });
    Object.assign(window, { oldHashDone });
    File.prototype.arrayBuffer = function () {
      if (this.name !== 'older.txt') return originalRead.call(this);
      return new Promise<ArrayBuffer>((resolve) => {
        Object.assign(window, {
          releaseOlder: async () => resolve(await originalRead.call(this)),
        });
      });
    };
    crypto.subtle.digest = async (algorithm, data) => {
      const result = await originalDigest(algorithm, data);
      if (data instanceof Uint8Array && data[0] === 65) hashFinished();
      return result;
    };
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.goto('/applications');
  await page.getByText('Prepare an application', { exact: true }).click();
  await page
    .getByLabel('Exact files')
    .setInputFiles({
      name: 'older.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('AAAA'),
    });
  await page
    .getByLabel('Exact files')
    .setInputFiles({
      name: 'newer.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('BBBB'),
    });
  await expect(page.getByText('newer.txt', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const control = window as unknown as {
      releaseOlder: () => Promise<void>;
      oldHashDone: Promise<void>;
    };
    await control.releaseOlder();
    await control.oldHashDone;
    // Observe the render following the older read/hash completion.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect(page.getByText('newer.txt', { exact: true })).toBeVisible();
  await expect(page.getByText('older.txt', { exact: true })).toHaveCount(0);
});
