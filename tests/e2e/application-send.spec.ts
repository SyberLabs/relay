import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { enableInspectJob } from './enable-inspect-job';

declare global {
  interface Window {
    relay?: Record<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >;
  }
}

type Authorized = {
  authorized: true;
  viewer: string;
  job: string;
  preparation_revision: string | null;
  id: string;
  digest: string;
  state: 'authorized';
};

type Operation = {
  id: string;
  digest: string;
  manifest: string;
  state: string;
};

type BeginResult = {
  execute?: boolean;
  operation?: Operation;
};

type Manifest = {
  destination: string;
  fields: { label: string; value: string }[];
};

// FIXTURE EVIDENCE, NOT ACTUAL CURSOR / GROK / CHATGPT HOST PROOF.
// Bounded simulated agent: the wait tool is already pending in an independent
// context; after one human click it continues with existing begin and one
// fixture Submit. This does not prove a real assistant host kept the call open.
const FORM = `<form method="post"><label>Full name<input name="name"></label><button>Submit fictional application</button></form>`;

async function signedIn(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  return page;
}

async function tool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown>,
) {
  return page.evaluate(
    async ({ name, input }) => {
      const fn = window.relay?.[name];
      if (typeof fn !== 'function') throw Error(`Missing ${name}`);
      return (await fn(input)) as T;
    },
    { name, input },
  );
}

async function waitUntilRelay(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => typeof window.relay?.relay_wait_for_application),
    )
    .toBe('function');
}

function sendButton(page: Page) {
  return page.getByRole('button', { name: /Approve & send|Accept and send/ });
}

async function assertWaitPending(pending: Promise<unknown>) {
  const state = await Promise.race([
    pending.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>((resolve) =>
      setTimeout(() => resolve('pending'), 50),
    ),
  ]);
  expect(state).toBe('pending');
}

async function startWaitPending(
  operative: Page,
  pin: {
    job: string;
    preparation_revision: string | null;
    id: string;
    digest: string;
    actor: string;
  },
) {
  const sawViewer = operative.waitForRequest(
    (request) =>
      request.method() === 'GET' && request.url().includes('/api/workspace'),
  );
  const pending = tool<Authorized>(
    operative,
    'relay_wait_for_application',
    pin,
  );
  await sawViewer;
  const jobInspect = (request: { method(): string; url(): string }) =>
    request.method() === 'GET' &&
    request
      .url()
      .includes(`/api/applications?job=${encodeURIComponent(pin.job)}`);
  await operative.waitForRequest(jobInspect);
  await assertWaitPending(pending);
  await operative.waitForRequest(jobInspect);
  await assertWaitPending(pending);
  return { pending };
}

async function startWaitThenApprove(
  operative: Page,
  human: Page,
  pin: {
    job: string;
    preparation_revision: string | null;
    id: string;
    digest: string;
    actor: string;
  },
  name: string,
) {
  await human.goto('/');
  await human.getByRole('button', { name, exact: true }).click();
  const { pending } = await startWaitPending(operative, pin);
  await expect(sendButton(human)).toBeEnabled();
  await sendButton(human).click();
  return pending;
}

async function mockEmployer(
  context: BrowserContext,
  expectedName: string,
  mode: 'confirm' | 'noop',
) {
  let writes = 0;
  await context.route('https://employer.example/**', async (route) => {
    if (route.request().method() === 'POST') {
      writes += 1;
      const posted = new URLSearchParams(route.request().postData() ?? '').get(
        'name',
      );
      expect(posted).toBe(expectedName);
      await route.fulfill({
        contentType: 'text/html',
        body: mode === 'confirm' ? '<h1>Fictional receipt SEND-174</h1>' : FORM,
      });
      return;
    }
    await route.fulfill({ contentType: 'text/html', body: FORM });
  });
  return { writes: () => writes };
}

async function prepareArmed(operative: Page, human: Page, name: string) {
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const destination = `https://employer.example/jobs/${slug}`;
  await human.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: name,
          Job: destination,
          url: `https://research.example/evidence/${slug}`,
          Status: 'Held',
          Notes: 'Fictional send-wait fixture; no real employer.',
        },
      ],
    },
  });
  const ws = await (await human.request.get('/api/workspace')).json();
  const job = ws.jobs.find((row: { name: string }) => row.name === name);
  await enableInspectJob(human, ws.viewer, job.id);
  await operative.goto(`/apply?job=${encodeURIComponent(job.id)}`);
  await waitUntilRelay(operative);
  const inspected = await tool<{ preparation_revision: string | null }>(
    operative,
    'relay_inspect_application',
    { job: job.id },
  );
  const prepared = await tool<{ preparation_revision: string }>(
    operative,
    'relay_prepare_application',
    {
      job: job.id,
      preparation_revision: inspected.preparation_revision,
      actor: 'Fictional applying agent',
      destination,
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
  );
  const armed = await tool<{
    operation_id: string;
    digest: string;
    preparation_revision: string;
    accept_enabled: boolean;
  }>(operative, 'relay_arm_application', {
    job: job.id,
    preparation_revision: prepared.preparation_revision,
    id: crypto.randomUUID(),
    actor: 'Fictional applying agent',
  });
  expect(armed.accept_enabled).toBe(true);
  return {
    job,
    pin: {
      job: job.id as string,
      preparation_revision: armed.preparation_revision,
      id: armed.operation_id,
      digest: armed.digest,
      actor: 'Fictional applying agent',
    },
  };
}

async function submitFrozenOnce(
  operative: Page,
  operation: Operation,
  mode: 'confirm' | 'noop',
) {
  const manifest = JSON.parse(operation.manifest) as Manifest;
  const employer = await operative.context().newPage();
  await employer.goto(manifest.destination);
  for (const field of manifest.fields)
    await employer.getByLabel(field.label).fill(field.value);
  await employer
    .getByRole('button', { name: 'Submit fictional application' })
    .click();
  if (mode === 'noop') {
    await expect(employer.getByRole('heading')).toHaveCount(0);
    await tool(operative, 'relay_finish_application', {
      id: operation.id,
      digest: operation.digest,
      action: 'uncertain',
      receipt:
        'Fixture submit no-op; no confirmation heading. Do not submit again.',
    });
    return null;
  }
  const heading = employer.getByRole('heading');
  await expect(heading).toHaveText('Fictional receipt SEND-174');
  const receipt = (await heading.textContent()) ?? '';
  await tool(operative, 'relay_finish_application', {
    id: operation.id,
    digest: operation.digest,
    action: 'complete',
    receipt,
  });
  return receipt;
}

test('pending wait resumes after one Inspect click and submits the frozen fixture once', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const pages: Page[] = [];
  try {
    const human = await signedIn(browser, baseURL!);
    const operative = await signedIn(browser, baseURL!);
    pages.push(human, operative);
    const name = 'Cedar Fictional — Wait Send Engineer';
    const { job, pin } = await prepareArmed(operative, human, name);
    const employer = await mockEmployer(
      operative.context(),
      'Avery Example',
      'confirm',
    );
    const authorized = await startWaitThenApprove(operative, human, pin, name);
    expect(authorized).toMatchObject({
      authorized: true,
      job: pin.job,
      id: pin.id,
      digest: pin.digest,
      state: 'authorized',
    });
    const begun = await tool<BeginResult>(
      operative,
      'relay_begin_application',
      { id: authorized.id, digest: authorized.digest },
    );
    expect(begun.execute).toBe(true);
    const receipt = await submitFrozenOnce(
      operative,
      begun.operation!,
      'confirm',
    );
    expect(employer.writes()).toBe(1);
    expect(receipt).toBe('Fictional receipt SEND-174');
    await expect
      .poll(async () => {
        const inspect = await (
          await human.request.get(
            `/api/applications?job=${encodeURIComponent(job.id)}`,
          )
        ).json();
        return inspect.recorded_receipt;
      })
      .toBe('Fictional receipt SEND-174');
    const inspect = await (
      await human.request.get(
        `/api/applications?job=${encodeURIComponent(job.id)}`,
      )
    ).json();
    expect(inspect.recorded_result).toBe('submitted');
    const ws = await (await human.request.get('/api/workspace')).json();
    expect(
      ws.jobs.find((row: { id: string }) => row.id === job.id).status,
    ).toBe('Submitted');
    await human.goto('/applications');
    await human
      .getByRole('button', { name: `View record for ${name}`, exact: true })
      .click();
    await expect(
      human.getByRole('article', { name: 'Application record' }),
    ).toContainText('Fictional receipt SEND-174');
    const secondBegin = await human.request.post('/api/applications', {
      data: {
        action: 'begin',
        viewer: authorized.viewer,
        id: pin.id,
        digest: pin.digest,
      },
    });
    expect(secondBegin.status()).toBe(409);
    expect(employer.writes()).toBe(1);
  } finally {
    await Promise.all(pages.map((page) => page.context().close()));
  }
});

test('two pending waiters produce one fixture employer submission', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const pages: Page[] = [];
  try {
    const human = await signedIn(browser, baseURL!);
    const first = await signedIn(browser, baseURL!);
    const second = await signedIn(browser, baseURL!);
    pages.push(human, first, second);
    const name = 'Cedar Fictional — Duplicate Wait Engineer';
    const { pin } = await prepareArmed(first, human, name);
    await second.goto(`/apply?job=${encodeURIComponent(pin.job)}`);
    await waitUntilRelay(second);
    const employerA = await mockEmployer(
      first.context(),
      'Avery Example',
      'confirm',
    );
    const employerB = await mockEmployer(
      second.context(),
      'Avery Example',
      'confirm',
    );
    await human.goto('/');
    await human.getByRole('button', { name, exact: true }).click();
    const { pending: waitA } = await startWaitPending(first, pin);
    const { pending: waitB } = await startWaitPending(second, pin);
    await expect(sendButton(human)).toBeEnabled();
    await sendButton(human).click();
    const [a, b] = await Promise.all([waitA, waitB]);
    const begun = await Promise.allSettled([
      tool<BeginResult>(first, 'relay_begin_application', {
        id: a.id,
        digest: a.digest,
      }),
      tool<BeginResult>(second, 'relay_begin_application', {
        id: b.id,
        digest: b.digest,
      }),
    ]);
    const wins = begun.filter(
      (row) => row.status === 'fulfilled' && row.value.execute === true,
    );
    expect(wins).toHaveLength(1);
    const winnerIndex =
      begun[0].status === 'fulfilled' && begun[0].value.execute === true
        ? 0
        : 1;
    const winner = winnerIndex === 0 ? first : second;
    const won = (begun[winnerIndex] as PromiseFulfilledResult<BeginResult>)
      .value;
    await submitFrozenOnce(winner, won.operation!, 'confirm');
    expect(employerA.writes() + employerB.writes()).toBe(1);
  } finally {
    await Promise.all(pages.map((page) => page.context().close()));
  }
});

test('disconnecting the waiting operative does not submit after Accept', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const pages: Page[] = [];
  try {
    const human = await signedIn(browser, baseURL!);
    const operative = await signedIn(browser, baseURL!);
    pages.push(human, operative);
    const name = 'Cedar Fictional — Disconnect Wait Engineer';
    const { pin } = await prepareArmed(operative, human, name);
    const employer = await mockEmployer(
      operative.context(),
      'Avery Example',
      'confirm',
    );
    const sawWait = operative.waitForRequest(
      (request) =>
        request.method() === 'GET' && request.url().includes('/api/workspace'),
    );
    const pending = tool<Authorized>(
      operative,
      'relay_wait_for_application',
      pin,
    ).then(
      () => 'resolved' as const,
      () => 'aborted' as const,
    );
    await sawWait;
    await operative.context().close();
    expect(await pending).toBe('aborted');
    await human.goto('/');
    await human.getByRole('button', { name, exact: true }).click();
    const live = await (
      await human.request.get(
        `/api/applications?job=${encodeURIComponent(pin.job)}`,
      )
    ).json();
    if (live.accept_enabled) await sendButton(human).click();
    const op = await (
      await human.request.get(
        `/api/applications?id=${encodeURIComponent(pin.id)}`,
      )
    ).json();
    expect(['proposed', 'authorized']).toContain(op.operation.state);
    expect(employer.writes()).toBe(0);
    if (op.operation.state === 'authorized') {
      await expect(
        human.getByRole('paragraph').filter({
          hasText: /^Approved, waiting for your agent to send$/,
        }),
      ).toBeVisible();
      await expect(
        human.getByText(
          'Your agent is submitting the application you approved',
        ),
      ).toHaveCount(0);
    }
  } finally {
    await Promise.all(
      pages.map((page) =>
        page
          .context()
          .close()
          .catch(() => undefined),
      ),
    );
  }
});

test('authorized without begin shows waiting, not active submitting', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const pages: Page[] = [];
  let human: Page | undefined;
  let finish: { viewer: string; id: string; digest: string } | null = null;
  try {
    human = await signedIn(browser, baseURL!);
    const operative = await signedIn(browser, baseURL!);
    pages.push(human, operative);
    const name = 'Cedar Fictional — Authorized Wait Engineer';
    const { pin } = await prepareArmed(operative, human, name);
    const employer = await mockEmployer(
      operative.context(),
      'Avery Example',
      'confirm',
    );
    const authorized = await startWaitThenApprove(operative, human, pin, name);
    expect(authorized).toMatchObject({
      authorized: true,
      job: pin.job,
      id: pin.id,
      digest: pin.digest,
      state: 'authorized',
    });
    await expect(
      human.getByRole('paragraph').filter({
        hasText: /^Approved, waiting for your agent to send$/,
      }),
    ).toBeVisible();
    await expect(
      human.getByText('Your agent is submitting the application you approved'),
    ).toHaveCount(0);
    await expect(
      human.getByRole('paragraph').filter({ hasText: /^Sending application$/ }),
    ).toHaveCount(0);
    expect(employer.writes()).toBe(0);
    await operative.context().close();
    await expect(
      human.getByRole('paragraph').filter({
        hasText: /^Approved, waiting for your agent to send$/,
      }),
    ).toBeVisible();
    await expect(
      human.getByText('Your agent is submitting the application you approved'),
    ).toHaveCount(0);
    const op = await (
      await human.request.get(
        `/api/applications?id=${encodeURIComponent(pin.id)}`,
      )
    ).json();
    expect(op.operation.state).toBe('authorized');
    expect(employer.writes()).toBe(0);
    const begun = await human.request.post('/api/applications', {
      data: {
        action: 'begin',
        viewer: authorized.viewer,
        id: pin.id,
        digest: pin.digest,
      },
    });
    expect(begun.ok()).toBe(true);
    expect((await begun.json()).execute).toBe(true);
    finish = { viewer: authorized.viewer, id: pin.id, digest: pin.digest };
    await expect(
      human.getByRole('paragraph').filter({ hasText: /^Sending application$/ }),
    ).toBeVisible();
    await expect(
      human.getByText('Your agent is submitting the application you approved'),
    ).toBeVisible();
    expect(employer.writes()).toBe(0);
    const finished = await human.request.post('/api/applications', {
      data: {
        action: 'not-submitted',
        viewer: authorized.viewer,
        id: pin.id,
        digest: pin.digest,
        receipt:
          'Fictional authorized-wait fixture stopped before employer interaction.',
      },
    });
    expect(finished.ok()).toBe(true);
    finish = null;
    const closed = await (
      await human.request.get(
        `/api/applications?id=${encodeURIComponent(pin.id)}`,
      )
    ).json();
    expect(closed.operation.state).toBe('not-submitted');
    expect(employer.writes()).toBe(0);
  } finally {
    try {
      if (finish && human) {
        const ended = await human.request.post('/api/applications', {
          data: {
            action: 'not-submitted',
            viewer: finish.viewer,
            id: finish.id,
            digest: finish.digest,
            receipt:
              'Fictional authorized-wait fixture stopped before employer interaction.',
          },
        });
        expect(ended.ok()).toBe(true);
      }
    } finally {
      await Promise.all(
        pages.map((page) =>
          page
            .context()
            .close()
            .catch(() => undefined),
        ),
      );
    }
  }
});

test('uncertain fixture submit does not issue a second employer POST', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const pages: Page[] = [];
  try {
    const human = await signedIn(browser, baseURL!);
    const operative = await signedIn(browser, baseURL!);
    pages.push(human, operative);
    const name = 'Cedar Fictional — Uncertain Wait Engineer';
    const { job, pin } = await prepareArmed(operative, human, name);
    const employer = await mockEmployer(
      operative.context(),
      'Avery Example',
      'noop',
    );
    const authorized = await startWaitThenApprove(operative, human, pin, name);
    const begun = await tool<BeginResult>(
      operative,
      'relay_begin_application',
      { id: authorized.id, digest: authorized.digest },
    );
    expect(begun.execute).toBe(true);
    await submitFrozenOnce(operative, begun.operation!, 'noop');
    expect(employer.writes()).toBe(1);
    const inspect = await (
      await human.request.get(
        `/api/applications?job=${encodeURIComponent(job.id)}`,
      )
    ).json();
    expect(inspect.recorded_result).toBe('uncertain');
    expect(inspect.recorded_receipt).toMatch(/no-op/i);
    await expect(
      tool(operative, 'relay_begin_application', {
        id: pin.id,
        digest: pin.digest,
      }),
    ).rejects.toBeTruthy();
    expect(employer.writes()).toBe(1);
    const ws = await (await human.request.get('/api/workspace')).json();
    expect(
      ws.jobs.find((row: { id: string }) => row.id === job.id).status,
    ).not.toBe('Submitted');
  } finally {
    await Promise.all(pages.map((page) => page.context().close()));
  }
});
