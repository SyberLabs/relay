import { expect, test, type Browser, type Page } from '@playwright/test';
import type {
  ApplicationOperation,
  ApplicationPolicy,
} from '../../lib/application-automation';
import type { Fact } from '../../lib/profile';
import type { InspectSnapshot } from '../../lib/inspect-view';

type Workspace = {
  viewer: string;
  jobs: {
    id: string;
    name: string;
    url: string;
    job_key: string;
    version: number;
    status: string;
    accepted_draft: string | null;
  }[];
  sources: { job_key: string; notes: string }[];
  facts: Fact[];
};
type Applications = {
  viewer: string;
  policy: ApplicationPolicy | null;
  jobs: Workspace['jobs'];
  operations: ApplicationOperation[];
};
type OperationReply = { operation: ApplicationOperation; execute?: boolean };

// Real local Relay requests in separate browser sessions. Development sign-in
// and the intercepted employer below are fictional; neither impersonates a
// live Grok/ChatGPT host or proves Cloudflare Access behavior.
async function signedIn(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  return page;
}

async function call<T = unknown>(
  page: Page,
  path: string,
  body?: Record<string, unknown>,
) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        ...(body
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      });
      return { status: response.status, data: (await response.json()) as T };
    },
    { path, body },
  );
}

test('same-tab API handoff survives independent sessions without WebMCP or context transfer', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const pages: Page[] = [];
  const open = async () => {
    const page = await signedIn(browser, baseURL!);
    pages.push(page);
    return page;
  };
  try {
    const owner = await open();
    // Fixture setup represents the owner's earlier candidate confirmation.
    await call(owner, '/api/profile', {
      action: 'propose',
      facts: [{ claim: 'Avery Fictional Handoff', tag: 'detail' }],
    });
    const profile = (await call<{ facts: Fact[] }>(owner, '/api/profile')).data;
    const fact = profile.facts.find(
      (f: { claim: string }) => f.claim === 'Avery Fictional Handoff',
    )!;
    expect(
      (await call(owner, '/api/profile', {
        action: 'verify',
        id: fact.id,
        claim: fact.claim,
      }))
        .status,
    ).toBe(200);

    const scout = await open();
    expect(
      await scout.evaluate(
        () =>
          typeof (document as Document & { modelContext?: unknown })
            .modelContext,
      ),
    ).toBe('undefined');
    const row = {
      Name: 'Cedar Fictional — API Handoff',
      Job: 'https://employer.example/jobs/api-handoff',
      url: 'https://research.example/evidence/api-handoff',
      Status: 'Held',
      Notes: 'Fictional posting: maintain TypeScript services.',
    };
    const scoutViewer = (await call<Workspace>(scout, '/api/workspace')).data
      .viewer;
    expect(
      (
        await call(scout, '/api/workspace', {
          action: 'import',
          viewer: scoutViewer,
          rows: [row],
        })
      ).status,
    ).toBe(200);

    // Applying session receives no scout response, cookie or job identifier.
    const applying = await open();
    const workspace = (await call<Workspace>(applying, '/api/workspace')).data;
    const job = workspace.jobs.find(
      (j: { name: string }) => j.name === 'Cedar Fictional — API Handoff',
    )!;
    expect(job.status).toBe('Held');
    expect(job.accepted_draft).toBeNull();
    expect(
      workspace.sources.filter(
        (s: { job_key: string }) => s.job_key === job.job_key,
      )[0].notes,
    ).toBe(row.Notes);
    const candidate = workspace.facts.find(
      (f: { claim: string }) => f.claim === 'Avery Fictional Handoff',
    )!;
    expect(candidate.status).toBe('Verified');

    // Owner configures a narrow fixture policy. The applying caller does not
    // grant itself permission; these remain shared-owner capabilities.
    const initial = (await call<Applications>(owner, '/api/applications')).data;
    expect(
      (
        await call(owner, '/api/applications', {
          action: 'policy',
          viewer: initial.viewer,
          version: initial.policy?.version || 0,
          enabled: true,
          review: 'all',
          jobs: [job.id],
          maximum: 2,
          expires: new Date(Date.now() + 86400000).toISOString(),
        })
      ).status,
    ).toBe(200);
    const manifest = {
      destination: job.url,
      fields: [{ label: 'Full name', value: candidate.claim }],
      files: [],
    };
    const inspection = await call<InspectSnapshot>(
      applying,
      `/api/applications?job=${encodeURIComponent(job.id)}`,
    );
    expect(inspection.status).toBe(200);
    const prepared = await call<InspectSnapshot>(
      applying,
      '/api/applications',
      {
        action: 'prepare',
        viewer: workspace.viewer,
        job: job.id,
        preparation_revision: inspection.data.preparation_revision,
        actor: 'ChatGPT',
        destination: manifest.destination,
        fields: manifest.fields.map((field) => ({ ...field, unknown: false })),
        files: manifest.files,
      },
    );
    expect(prepared.status).toBe(200);
    const armed = await call<InspectSnapshot>(applying, '/api/applications', {
      action: 'arm',
      viewer: workspace.viewer,
      id: crypto.randomUUID(),
      job: job.id,
      preparation_revision: prepared.data.preparation_revision,
      actor: 'ChatGPT',
    });
    expect(armed.status).toBe(200);
    expect(armed.data.accept_enabled).toBe(true);
    const op = (
      await call<OperationReply>(
        applying,
        `/api/applications?id=${encodeURIComponent(armed.data.operation_id!)}`,
      )
    ).data.operation;
    expect(op.state).toBe('proposed');
    expect(JSON.parse(op.manifest)).toEqual(manifest);
    const begin = {
      action: 'begin',
      viewer: workspace.viewer,
      id: op.id,
      digest: op.digest,
    };
    expect((await call(applying, '/api/applications', begin)).status).toBe(409);

    await owner.goto('/');
    await owner
      .getByRole('button', {
        name: 'Cedar Fictional — API Handoff',
        exact: true,
      })
      .click();
    const inspect = owner.getByRole('region', { name: 'Prepared application' });
    await expect(inspect).toContainText(candidate.claim);
    await inspect
      .getByRole('button', { name: 'Approve & send', exact: true })
      .click();
    await expect(inspect).toContainText(
      'Approved, waiting for your agent to send',
    );

    // New evidence and a different job do not rewrite the approved payload,
    // job version, acceptance, or application permission.
    expect(
      (
        await call(scout, '/api/workspace', {
          action: 'import',
          viewer: scoutViewer,
          rows: [
            {
              ...row,
              Status: 'Submitted',
              Notes: 'Untrusted source outcome',
              company: 'Changed source company',
            },
            {
              ...row,
              Name: 'Cedar Fictional — More scouting',
              Job: 'https://employer.example/jobs/next',
              url: 'https://research.example/evidence/next',
            },
          ],
        })
      ).status,
    ).toBe(200);
    const overlap = (await call<Workspace>(applying, '/api/workspace')).data;
    expect(overlap.jobs.find((j: { id: string }) => j.id === job.id)).toEqual(
      job,
    );
    expect(
      overlap.jobs.find(
        (j: { name: string }) => j.name === 'Cedar Fictional — More scouting',
      )?.status,
    ).toBe('Held');

    const rival = await open();
    const results = await Promise.all([
      call<OperationReply>(applying, '/api/applications', begin),
      call<OperationReply>(rival, '/api/applications', begin),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const winner = results[0].status === 200 ? applying : rival;
    const permission = results.find((r) => r.status === 200)!.data;
    expect(permission.execute).toBe(true);
    expect(permission.operation.manifest).toBe(op.manifest);

    // Controlled employer fixture. The browser enters and submits a real form,
    // but the employer transport and receipt are mocked, with a write counter.
    let employerWrites = 0;
    await winner
      .context()
      .route('https://employer.example/**', async (route) => {
        if (route.request().method() === 'POST') {
          employerWrites++;
          expect(permission.execute).toBe(true);
          expect(
            new URLSearchParams(route.request().postData()!).get('name'),
          ).toBe(candidate.claim);
          await route.fulfill({
            contentType: 'text/html',
            body: '<h1>Fictional receipt CEDAR-144</h1>',
          });
        } else {
          await route.fulfill({
            contentType: 'text/html',
            body: '<form method="post"><label>Full name<input name="name"></label><button>Submit fictional application</button></form>',
          });
        }
      });
    const employer = await winner.context().newPage();
    await employer.goto(manifest.destination);
    await employer.getByLabel('Full name').fill(manifest.fields[0].value);
    await employer
      .getByRole('button', { name: 'Submit fictional application' })
      .click();
    await expect(employer.getByRole('heading')).toHaveText(
      'Fictional receipt CEDAR-144',
    );
    expect(employerWrites).toBe(1);

    // Lose both assistants' sessions before Relay receives the employer receipt.
    await scout.context().close();
    await applying.context().close();
    await rival.context().close();
    const resumed = await open();
    const recovered = (await call<Applications>(resumed, '/api/applications'))
      .data;
    const recoveredJob = recovered.jobs.find(
      (j: { name: string }) => j.name === 'Cedar Fictional — API Handoff',
    )!;
    const summary = recovered.operations.find(
      (o: { job_id: string }) => o.job_id === recoveredJob.id,
    )!;
    const saved = (
      await call<OperationReply>(
        resumed,
        `/api/applications?id=${encodeURIComponent(summary.id)}`,
      )
    ).data.operation;
    expect(saved.state).toBe('executing');
    expect(saved.manifest).toBe(op.manifest);
    const recovery = {
      viewer: recovered.viewer,
      id: saved.id,
      digest: saved.digest,
    };
    expect(
      (
        await call(resumed, '/api/applications', {
          ...recovery,
          action: 'begin',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(resumed, '/api/applications', {
          ...recovery,
          action: 'uncertain',
          receipt: 'Interrupted after employer operation; no repeat permitted.',
        })
      ).status,
    ).toBe(200);
    const resumedScout = await open();
    const scoutHistory = (
      await call<Applications>(resumedScout, '/api/applications')
    ).data;
    const scoutJob = scoutHistory.jobs.find(
      (j) => j.name === 'Cedar Fictional — API Handoff',
    )!;
    const scoutOperation = scoutHistory.operations.find(
      (o) => o.job_id === scoutJob.id,
    )!;
    expect(scoutOperation.state).toBe('uncertain');
    expect(
      (
        await call<OperationReply>(
          resumedScout,
          `/api/applications?id=${encodeURIComponent(scoutOperation.id)}`,
        )
      ).data.operation.manifest,
    ).toBe(saved.manifest);
    expect(
      (
        await call(resumed, '/api/applications', {
          ...recovery,
          action: 'begin',
        })
      ).status,
    ).toBe(409);
    expect(employerWrites).toBe(1);
    // No fabricated receipt resolution: uncertainty is the durable final state.
  } finally {
    await Promise.all(pages.map((page) => page.context().close()));
  }
});
