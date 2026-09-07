import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { enableInspectJob } from './enable-inspect-job';

async function preparationRevision(page: Page, jobId: string) {
  const response = await page.request.get(
    `/api/applications?job=${encodeURIComponent(jobId)}`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()).preparation_revision;
}

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
      preparation_revision: await preparationRevision(page, job.id),
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
      preparation_revision: await preparationRevision(page, job.id),
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
  // This test owns this operation and did not visit an employer form.
  const finished = await page.request.post('/api/applications', {
    data: {
      action: 'not-submitted',
      viewer: ws.viewer,
      id: op.id,
      digest: op.digest,
      receipt:
        'Fictional inspect-send fixture stopped before employer interaction.',
    },
  });
  expect(finished.ok()).toBe(true);
});

test('set aside cancels a pre-begin freeze so send cannot begin', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Inspect Skip Engineer',
          Job: 'https://employer.example/jobs/inspect-skip',
          url: 'https://scout.example/observations/inspect-skip',
          Status: 'Held',
          Notes: 'Fictional inspect-skip fixture.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Inspect Skip'),
  );
  await enableInspectJob(page, ws.viewer, job.id);
  await page.goto('/');
  await page.getByRole('button', { name: /Inspect Skip/ }).click();
  const prepared = await page.request.post('/api/applications', {
    data: {
      action: 'prepare',
      preparation_revision: await preparationRevision(page, job.id),
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
      preparation_revision: await preparationRevision(page, job.id),
      viewer: ws.viewer,
      job: job.id,
      id: 'op-inspect-skip',
      actor: 'Fictional applying agent',
    },
  });
  expect(armed.ok()).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Set aside', exact: true }).click();
  await expect
    .poll(async () => {
      const data = await (await page.request.get('/api/applications')).json();
      return data.operations.find(
        (o: { id: string }) => o.id === 'op-inspect-skip',
      )?.state;
    })
    .toBe('cancelled');
});

test('human can answer a Blocked inspect field then arm to enable Accept', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Inspect Blocked Engineer',
          Job: 'https://employer.example/jobs/inspect-blocked',
          url: 'https://scout.example/observations/inspect-blocked',
          Status: 'Held',
          Notes: 'Fictional inspect-blocked fixture.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Inspect Blocked'),
  );
  await enableInspectJob(page, ws.viewer, job.id);
  await page.goto('/');
  await page.getByRole('button', { name: /Inspect Blocked/ }).click();
  const prepared = await page.request.post('/api/applications', {
    data: {
      action: 'prepare',
      preparation_revision: await preparationRevision(page, job.id),
      viewer: ws.viewer,
      job: job.id,
      actor: 'Fictional applying agent',
      destination: job.url,
      fields: [
        { label: 'Full name', value: 'Avery Example', unknown: false },
        { label: 'Work authorization', value: '', unknown: true },
      ],
      files: [],
    },
  });
  expect(prepared.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Blocked' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Work authorization' })
    .fill('Authorized to work in the example country');
  await page.getByRole('button', { name: 'Save answer' }).click();
  await expect(page.getByRole('button', { name: 'Save answer' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeDisabled();
  const armed = await page.request.post('/api/applications', {
    data: {
      action: 'arm',
      preparation_revision: await preparationRevision(page, job.id),
      viewer: ws.viewer,
      job: job.id,
      id: 'op-inspect-blocked',
      actor: 'Fictional applying agent',
    },
  });
  expect(armed.ok()).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeEnabled();
});

test('inspect overlay prepare fills three fields then Accept send completes', async ({
  page,
}) => {
  const resumeBytes = Buffer.from(
    `Cedar Example — Inspect Handshake Engineer resume (fictional)\n${'INS-9 '.repeat(80)}`,
  );
  expect(resumeBytes.length).toBeLessThanOrEqual(4096);
  const resume = {
    name: 'resume.txt',
    base64: resumeBytes.toString('base64'),
    sha256: createHash('sha256').update(resumeBytes).digest('hex'),
  };
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Inspect Handshake Engineer',
          Job: 'https://employer.example/jobs/inspect-handshake',
          url: 'https://scout.example/observations/inspect-handshake',
          Status: 'Held',
          Notes: 'Fictional inspect-handshake fixture.',
        },
        {
          Name: 'Cedar Example — Independent Executing Fixture',
          Job: 'https://employer.example/jobs/independent-execution',
          url: 'https://scout.example/observations/independent-execution',
          Status: 'Held',
          Notes: 'Owned by this test; protects against owner-wide cleanup.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Inspect Handshake'),
  );
  const unrelated = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Independent Executing Fixture'),
  );
  await enableInspectJob(page, ws.viewer, unrelated.id);
  await enableInspectJob(page, ws.viewer, job.id);
  const unrelatedPrepared = await page.request.post('/api/applications', {
    data: {
      action: 'prepare',
      viewer: ws.viewer,
      job: unrelated.id,
      preparation_revision: await preparationRevision(page, unrelated.id),
      actor: 'Fictional independent fixture',
      destination: unrelated.url,
      fields: [{ label: 'Full name', value: 'Robin Example', unknown: false }],
      files: [],
    },
  });
  expect(unrelatedPrepared.ok()).toBe(true);
  const unrelatedArmed = await page.request.post('/api/applications', {
    data: {
      action: 'arm',
      viewer: ws.viewer,
      job: unrelated.id,
      preparation_revision: await preparationRevision(page, unrelated.id),
      actor: 'Fictional independent fixture',
      id: 'op-inspect-independent',
    },
  });
  expect(unrelatedArmed.ok()).toBe(true);
  const unrelatedView = await unrelatedArmed.json();
  for (const action of ['approve', 'begin']) {
    const result = await page.request.post('/api/applications', {
      data: {
        action,
        viewer: ws.viewer,
        id: unrelatedView.operation_id,
        digest: unrelatedView.digest,
      },
    });
    expect(result.ok()).toBe(true);
  }
  const unrelatedBefore = await (
    await page.request.get(`/api/applications?id=${unrelatedView.operation_id}`)
  ).json();
  const prepared = await page.request.post('/api/applications', {
    data: {
      action: 'prepare',
      preparation_revision: await preparationRevision(page, job.id),
      viewer: ws.viewer,
      job: job.id,
      actor: 'Fictional applying agent',
      destination: job.url,
      fields: [
        { label: 'Full name', value: 'Avery Example', unknown: false },
        {
          label: 'Work authorization',
          value: 'Authorized to work in the example country',
          unknown: false,
        },
        {
          label: 'Cover note',
          value: 'Fictional cover note for Inspect Handshake Engineer.',
          unknown: false,
        },
      ],
      files: [resume],
    },
  });
  expect(prepared.ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: /Inspect Handshake/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Inspect', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Full name')).toBeVisible();
  await expect(page.getByText('Work authorization')).toBeVisible();
  await expect(page.getByText('Cover note')).toBeVisible();
  await expect(page.getByText('resume.txt', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept and send' }),
  ).toBeDisabled();
  const armed = await page.request.post('/api/applications', {
    data: {
      action: 'arm',
      preparation_revision: await preparationRevision(page, job.id),
      viewer: ws.viewer,
      job: job.id,
      id: 'op-inspect-handshake',
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
  const armedView = await armed.json();
  const refused = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: ws.viewer,
      id: 'op-inspect-handshake',
      digest: armedView.digest,
    },
  });
  expect(refused.status()).toBe(409);
  const unrelatedAfter = await (
    await page.request.get(`/api/applications?id=${unrelatedView.operation_id}`)
  ).json();
  expect(unrelatedAfter.operation).toEqual(unrelatedBefore.operation);
  // Only now end the explicitly test-owned sentinel. No employer was visited.
  const ended = await page.request.post('/api/applications', {
    data: {
      action: 'not-submitted',
      viewer: ws.viewer,
      id: unrelatedView.operation_id,
      digest: unrelatedView.digest,
      receipt: 'Owned fictional sentinel stopped before employer interaction.',
    },
  });
  expect(ended.ok()).toBe(true);
  const begun = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: ws.viewer,
      id: 'op-inspect-handshake',
      digest: armedView.digest,
    },
  });
  expect(begun.ok()).toBe(true);
  const begunBody = await begun.json();
  expect(begunBody.execute).toBe(true);
  const completed = await page.request.post('/api/applications', {
    data: {
      action: 'complete',
      viewer: ws.viewer,
      id: begunBody.operation.id,
      digest: begunBody.operation.digest,
      receipt: 'Fictional employer accepted application INS-9',
    },
  });
  expect(completed.ok()).toBe(true);
  const workspace = await (await page.request.get('/api/workspace')).json();
  const submitted = workspace.jobs.find((j: { id: string }) => j.id === job.id);
  expect(submitted.status).toBe('Submitted');
  const detail = await (
    await page.request.get(
      `/api/applications?id=${encodeURIComponent(begunBody.operation.id)}`,
    )
  ).json();
  const manifest = JSON.parse(detail.operation.manifest) as {
    files: { name: string; base64: string }[];
  };
  expect(manifest.files[0].name).toBe('resume.txt');
  expect(manifest.files[0].base64).toBe(resume.base64);
});
