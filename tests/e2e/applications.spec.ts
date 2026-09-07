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
  const approveName = 'Approve this exact application';
  const beginName = 'Begin this application once';
  await expect(page.getByRole('button', { name: approveName })).toHaveCount(0);
  await expect(page.getByRole('button', { name: beginName })).toHaveCount(0);
  const ledger = await (await page.request.get('/api/applications')).json();
  const proposed = ledger.operations.find(
    (o: { state: string }) => o.state === 'proposed',
  );
  const detail = await (
    await page.request.get(
      `/api/applications?id=${encodeURIComponent(proposed.id)}`,
    )
  ).json();
  const manifest = JSON.parse(detail.operation.manifest) as {
    destination: string;
    fields: { label: string; value: string }[];
    files: { name: string; base64: string; sha256: string }[];
  };
  expect(
    (
      await page.request.post('/api/applications', {
        data: {
          action: 'prepare',
          viewer: ledger.viewer,
          job: detail.operation.job_id,
          actor: detail.operation.actor,
          destination: manifest.destination,
          fields: manifest.fields.map((field) => ({
            ...field,
            unknown: false,
          })),
          files: manifest.files,
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('/api/applications', {
        data: {
          action: 'arm',
          viewer: ledger.viewer,
          job: detail.operation.job_id,
          id: detail.operation.id,
          actor: detail.operation.actor,
        },
      })
    ).ok(),
  ).toBe(true);
  await expect(page.getByRole('button', { name: approveName })).toHaveCount(0);
  await expect(page.getByRole('button', { name: beginName })).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('button', { name: /Pilot Engineer/ }).click();
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Accept and send' }).click();
  await expect(
    page.getByText('Accepted — waiting for the operative to send.'),
  ).toBeVisible();
  const begun = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: ledger.viewer,
      id: proposed.id,
      digest: proposed.digest,
    },
  });
  expect(begun.ok()).toBe(true);
  expect((await begun.json()).execute).toBe(true);
  await page.goto('/applications');
  await expect(page.getByRole('button', { name: beginName })).toHaveCount(0);
  // Interruption recovery reopens persisted evidence without issuing a permit.
  await page.reload();
  await expect(page.getByRole('button', { name: beginName })).toHaveCount(0);
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

for (const first of ['older', 'newer']) {
  test(`file selection stays exact and unsavable until newest read completes (${first} finishes first)`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const originalRead = Object.getOwnPropertyDescriptor(
        Blob.prototype,
        'arrayBuffer',
      )?.value as (this: File) => Promise<ArrayBuffer>;
      const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
      const readers: Record<string, () => Promise<void>> = {};
      const hashes: Record<string, Promise<void>> = {};
      const finished: Record<string, () => void> = {};
      for (const name of ['older', 'newer'])
        hashes[name] = new Promise<void>((resolve) => {
          finished[name] = resolve;
        });
      Object.assign(window, { readers, hashes });
      File.prototype.arrayBuffer = function () {
        return new Promise<ArrayBuffer>((resolve) => {
          readers[this.name.split('.')[0]] = async () =>
            resolve(await originalRead.call(this));
        });
      };
      crypto.subtle.digest = async (algorithm, data) => {
        const result = await originalDigest(algorithm, data);
        if (data instanceof Uint8Array)
          finished[data[0] === 65 ? 'older' : 'newer']();
        return result;
      };
    });
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
    await page.goto('/applications');
    await page.getByText('Prepare an application', { exact: true }).click();
    await page.getByLabel('Exact files').setInputFiles({
      name: 'older.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('AAAA'),
    });
    await page.getByLabel('Exact files').setInputFiles({
      name: 'newer.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('BBBB'),
    });
    const finish = async (name: string) =>
      page.evaluate(async (name) => {
        const control = window as unknown as {
          readers: Record<string, () => Promise<void>>;
          hashes: Record<string, Promise<void>>;
        };
        await control.readers[name]();
        await control.hashes[name];
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      }, name);
    await finish(first);
    if (first === 'older') {
      await expect(
        page.getByRole('button', { name: 'Save exact proposal' }),
      ).toBeDisabled();
      await expect(
        page.getByText('Finish selecting files before saving.'),
      ).toBeVisible();
    } else
      await expect(page.getByText('newer.txt', { exact: true })).toBeVisible();
    await finish(first === 'older' ? 'newer' : 'older');
    await expect(page.getByText('newer.txt', { exact: true })).toBeVisible();
    await expect(page.getByText('older.txt', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Save exact proposal' }),
    ).toBeEnabled();
  });
}
