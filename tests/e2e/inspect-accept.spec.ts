import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { enableInspectJob } from './enable-inspect-job';
import { openDraftTools } from './open-draft-tools';

async function preparationRevision(page: Page, jobId: string) {
  const response = await page.request.get(
    `/api/applications?job=${encodeURIComponent(jobId)}`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()).preparation_revision;
}

test('workspace draft saves can re-arm unchanged content before explicit send approval', async ({
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
    page.getByRole('button', { name: 'Approve & send' }),
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
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeEnabled();
  await openDraftTools(page);
  await page
    .getByLabel('Application answer or outreach draft', { exact: true })
    .fill('Fictional exact draft for the ordinary review-then-send journey.');
  let operationId = 'op-inspect-1';
  for (const [index, control] of [
    'Save draft',
    'Accept exact draft',
  ].entries()) {
    await page
      .locator('.core')
      .getByRole('button', { name: control, exact: true })
      .click();
    await expect
      .poll(async () => {
        const current = await (await page.request.get('/api/workspace')).json();
        return current.jobs.find((row: { id: string }) => row.id === job.id)
          ?.version;
      })
      .toBe(job.version + index + 1);
    await expect(
      page.getByRole('button', { name: 'Approve & send' }),
    ).toBeDisabled();
    // Both a direct heartbeat and an unchanged re-prepare must recover after save.
    if (index === 1) {
      const unchanged = await page.request.post('/api/applications', {
        data: {
          action: 'prepare',
          preparation_revision: await preparationRevision(page, job.id),
          viewer: ws.viewer,
          job: job.id,
          actor: 'Fictional applying agent',
          destination: job.url,
          fields: [
            { label: 'Full name', value: 'Avery Example', unknown: false },
          ],
          files: [],
        },
      });
      expect(unchanged.ok()).toBe(true);
    }
    const oldOperationId = operationId;
    operationId = `op-inspect-after-save-${index}`;
    const inspectPin =
      index === 1
        ? page.waitForResponse(async (response) => {
            let url: URL;
            try {
              url = new URL(response.url());
            } catch {
              return false;
            }
            if (!url.pathname.endsWith('/api/applications')) return false;
            if (url.searchParams.get('job') !== job.id) return false;
            if (response.request().method() !== 'GET') return false;
            if (!response.ok()) return false;
            try {
              const data = await response.json();
              return (
                data.operation_id === operationId &&
                data.accept_enabled === true
              );
            } catch {
              return false;
            }
          })
        : null;
    const rearmed = await page.request.post('/api/applications', {
      data: {
        action: 'arm',
        preparation_revision: await preparationRevision(page, job.id),
        viewer: ws.viewer,
        job: job.id,
        id: operationId,
        actor: 'Fictional applying agent',
      },
    });
    expect(rearmed.ok()).toBe(true);
    const next = await rearmed.json();
    expect(next.operation_id).toBe(operationId);
    expect(next.state).toBe('proposed');
    const staleBegin = await page.request.post('/api/applications', {
      data: {
        action: 'begin',
        viewer: ws.viewer,
        id: oldOperationId,
        digest: next.digest,
      },
    });
    expect(staleBegin.status()).toBe(409);
    if (inspectPin) await inspectPin;
    await expect(
      page.getByRole('button', { name: 'Approve & send' }),
    ).toBeEnabled();
  }
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeEnabled();
  const approveResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith('/api/applications')) return false;
    if (response.request().method() !== 'POST') return false;
    const body = response.request().postDataJSON() as {
      action?: string;
      id?: string;
    };
    return body.action === 'approve' && body.id === operationId;
  });
  await page.getByRole('button', { name: 'Approve & send' }).click();
  const accepted = await approveResponse;
  expect(accepted.ok()).toBe(true);
  expect((await accepted.json()).operation.id).toBe(operationId);
  await expect(
    page.getByText(/Approved, waiting for your agent to send/i),
  ).toBeVisible();
  await expect(
    page.getByText(/Your agent is submitting the application you approved/i),
  ).toHaveCount(0);
  await expect(page.getByText('Operative is not on the page')).toHaveCount(0);
  const data = await (await page.request.get('/api/applications')).json();
  const op = data.operations.find((o: { id: string }) => o.id === operationId);
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
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('heading', {
      name: 'Cedar Example — Inspect Skip Engineer',
    }),
  ).toBeVisible();
  await openDraftTools(page);
  await page
    .locator('.core')
    .getByRole('button', { name: 'Set aside', exact: true })
    .click();
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
  await expect(
    page.getByRole('textbox', { name: 'Work authorization' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Work authorization' })
    .fill('Authorized to work in the example country');
  await page.getByRole('button', { name: 'Save answer' }).click();
  await expect(page.getByRole('button', { name: 'Save answer' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
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
    page.getByRole('button', { name: 'Approve & send' }),
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
  let sentinelOpen = true;
  const endSentinel = async () => {
    if (!sentinelOpen) return;
    sentinelOpen = false;
    const ended = await page.request.post('/api/applications', {
      data: {
        action: 'not-submitted',
        viewer: ws.viewer,
        id: unrelatedView.operation_id,
        digest: unrelatedView.digest,
        receipt:
          'Owned fictional sentinel stopped before employer interaction.',
      },
    });
    expect(ended.ok()).toBe(true);
  };
  try {
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
      page.getByRole('heading', {
        name: 'Cedar Example — Inspect Handshake Engineer',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Exact answers' }),
    ).toBeVisible();
    await expect(page.getByText('Full name', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Work authorization', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Cover note', { exact: true })).toBeVisible();
    await expect(page.getByText('resume.txt', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Approve & send' }),
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
      page.getByRole('button', { name: 'Approve & send' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Approve & send' }).click();
    await expect(
      page.getByText(/Approved, waiting for your agent to send/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Your agent is submitting the application you approved/i),
    ).toHaveCount(0);
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
      await page.request.get(
        `/api/applications?id=${unrelatedView.operation_id}`,
      )
    ).json();
    expect(unrelatedAfter.operation).toEqual(unrelatedBefore.operation);
    await endSentinel();
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
    const submitted = workspace.jobs.find(
      (j: { id: string }) => j.id === job.id,
    );
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
  } finally {
    await endSentinel();
  }
});

test('inspect shows employer-uncertain separately from waiting to send', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Inspect Uncertain Engineer',
          Job: 'https://employer.example/jobs/inspect-uncertain',
          url: 'https://scout.example/observations/inspect-uncertain',
          Status: 'Held',
          Notes: 'Fictional inspect-uncertain fixture.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Inspect Uncertain'),
  );
  await enableInspectJob(page, ws.viewer, job.id);
  await page.goto('/');
  await page.getByRole('button', { name: /Inspect Uncertain/ }).click();
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
      id: 'op-inspect-uncertain',
      actor: 'Fictional applying agent',
    },
  });
  expect(armed.ok()).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Approve & send' }).click();
  await expect(
    page.getByText(/Approved, waiting for your agent to send/i),
  ).toBeVisible();
  await expect(
    page.getByText(/Your agent is submitting the application you approved/i),
  ).toHaveCount(0);
  const armedView = await armed.json();
  const begun = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: ws.viewer,
      id: 'op-inspect-uncertain',
      digest: armedView.digest,
    },
  });
  expect(begun.ok()).toBe(true);
  expect((await begun.json()).execute).toBe(true);
  await expect(
    page.getByRole('paragraph').filter({ hasText: /^Sending application$/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/Your agent is submitting the application you approved/i),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeDisabled();
  const marked = await page.request.post('/api/applications', {
    data: {
      action: 'uncertain',
      viewer: ws.viewer,
      id: 'op-inspect-uncertain',
      digest: armedView.digest,
      receipt:
        'Fictional Greenhouse invisible reCAPTCHA; employer submit no-op after a clean fill.',
    },
  });
  expect(marked.ok()).toBe(true);
  await expect(
    page
      .locator('.foot-copy p')
      .filter({ hasText: /^Submission needs checking$/ }),
  ).toBeVisible();
  await expect(page.getByText(/could not confirm the result/i)).toBeVisible();
  await expect(
    page.getByText(/waiting for the operative to send/i),
  ).toHaveCount(0);
  await expect(page.getByText('Operative is not on the page')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Approve & send' }),
  ).toBeDisabled();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const current = workspace.jobs.find((j: { id: string }) => j.id === job.id);
  expect(current.status).not.toBe('Submitted');
  const repeated = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: ws.viewer,
      id: 'op-inspect-uncertain',
      digest: armedView.digest,
    },
  });
  expect(repeated.status()).toBe(409);
});
