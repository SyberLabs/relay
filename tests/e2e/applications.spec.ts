import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`application cards, inspection and refused preparation stay usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
    const name =
      'Juniper Example — Ledger Engineer, Infrastructure and Distributed Systems';
    const operation = {
      id: 'fictional-operation',
      job_id: 'fictional-job',
      job_version: 1,
      policy_version: 1,
      actor: 'ChatGPT · fictional staging QA',
      state: 'submitted',
      authority: 'explicit-review',
      created: '2026-09-07T12:00:00.000Z',
      digest: 'a'.repeat(64),
      manifest: JSON.stringify({
        destination: 'https://employer.example/apply',
        fields: [
          { label: 'Full name', value: 'Avery Example\nExact second line' },
        ],
        files: [],
      }),
      receipt: 'Fictional employer confirmation ABC-123',
    };
    const snapshot = {
      viewer: 'fictional-viewer',
      policy: null,
      jobs: [
        {
          id: 'fictional-job',
          name,
          status: 'Submitted',
          version: 1,
          url: 'https://employer.example/apply',
        },
        {
          id: 'fictional-preparation-job',
          name: 'Cedar Example — Application Pilot Engineer',
          status: 'Held',
          version: 1,
          url: 'https://employer.example/apply',
        },
      ],
      operations: [operation],
      next: null,
    };
    let writes = 0;
    await page.route('**/api/applications**', async (route) => {
      if (route.request().method() === 'POST') {
        writes++;
        await route.fulfill({
          status: 429,
          json: { error: 'Daily application limit reached. Try again later.' },
        });
      } else {
        await route.fulfill({
          json: new URL(route.request().url()).searchParams.has('id')
            ? { operation }
            : snapshot,
        });
      }
    });
    await page.goto('/applications');
    const record = page.getByRole('button', {
      name: `View record for ${name}`,
      exact: true,
    });
    await expect(record).toBeVisible();
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    const fits = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    await fits();
    await page.screenshot({
      path: `outputs/156-applications-${width}.png`,
      fullPage: true,
    });
    await record.click();
    const evidence = page.getByRole('article', { name: 'Application record' });
    await expect(evidence).toBeFocused();
    await expect(evidence).toContainText('Avery Example\nExact second line');
    await expect(evidence).toContainText(
      'Fictional employer confirmation ABC-123',
    );
    await expect(
      page.getByRole('button', { name: 'Begin this application once' }),
    ).toHaveCount(0);
    await fits();
    await page.getByText('Application permissions', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Save permissions' }),
    ).toBeVisible();
    await fits();
    await page
      .getByRole('button', { name: 'Prepare application', exact: true })
      .click();
    await expect(
      page.getByText('Prepare an application', { exact: true }),
    ).toBeFocused();
    await page
      .getByRole('combobox', { name: 'Job', exact: true })
      .selectOption('fictional-preparation-job');
    await page.getByLabel('Agent name').fill('FictionalAgent'.repeat(7));
    await page
      .getByLabel('Exact answer')
      .fill('Preserve this fictional answer after refusal.');
    await page.getByRole('button', { name: 'Save exact proposal' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Daily application limit reached',
    );
    await expect(page.getByLabel('Exact answer')).toHaveValue(
      'Preserve this fictional answer after refusal.',
    );
    await expect(
      page.getByRole('button', { name: 'Approve this exact application' }),
    ).toHaveCount(0);
    await expect(page.getByText('Exact proposal saved.')).toHaveCount(0);
    expect(writes).toBe(1);
    await fits();
  });
}

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
  await page.getByText('Application permissions', { exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Approval setting' }),
  ).toHaveCount(0);
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
  expect(ledger.policy.review).toBe('all');
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
          preparation_revision: (
            await (
              await page.request.get(
                `/api/applications?job=${detail.operation.job_id}`,
              )
            ).json()
          ).preparation_revision,
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
          preparation_revision: (
            await (
              await page.request.get(
                `/api/applications?job=${detail.operation.job_id}`,
              )
            ).json()
          ).preparation_revision,
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
  await page.goto('/applications');
  await page
    .getByRole('button', {
      name: 'View record for Cedar Example — Application Pilot Engineer',
    })
    .click();
  await expect(page.getByRole('article')).toContainText('authorized');
  await expect(page.getByRole('button', { name: approveName })).toHaveCount(0);
  await expect(page.getByRole('button', { name: beginName })).toHaveCount(0);
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
      name: 'View record for Cedar Example — Application Pilot Engineer',
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
      name: 'View record for Cedar Example — Application Pilot Engineer',
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
