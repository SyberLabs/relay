import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { enableInspectJob } from './enable-inspect-job';

const FORM = `<form method="post"><label>Full name<input name="name"></label><button>Submit fictional application</button></form>`;
const NOT_FIXTURE = `<form method="post"><label>Full name<input name="name"></label><button>Apply now</button></form>`;
const SOURCE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../extensions/operative',
);

function sendButton(page: Page) {
  return page.getByRole('button', { name: /Approve & send|Accept and send/ });
}

async function packExtension() {
  const dir = await mkdtemp(join(tmpdir(), 'relay-operative-'));
  await cp(SOURCE, dir, { recursive: true });
  return dir;
}

type ExtensionPermissionState = {
  explicit_host?: string[];
  scriptable_host?: string[];
};

async function grantOptionalHttpsHosts(
  userDataDir: string,
  extensionId: string,
  patterns: string[],
) {
  const prefsPath = join(userDataDir, 'Default', 'Preferences');
  const prefs = JSON.parse(await readFile(prefsPath, 'utf8')) as {
    extensions?: {
      settings?: Record<
        string,
        {
          active_permissions?: ExtensionPermissionState;
          granted_permissions?: ExtensionPermissionState;
        }
      >;
    };
  };
  const ext = prefs.extensions?.settings?.[extensionId];
  if (!ext) throw new Error(`Extension prefs missing for ${extensionId}`);
  for (const key of ['active_permissions', 'granted_permissions'] as const) {
    const state = ext[key] ?? (ext[key] = {});
    state.explicit_host = [
      ...new Set([...(state.explicit_host ?? []), ...patterns]),
    ];
    state.scriptable_host = [
      ...new Set([...(state.scriptable_host ?? []), ...patterns]),
    ];
  }
  await writeFile(prefsPath, `${JSON.stringify(prefs)}\n`);
}

async function launchExtensionContext(
  extDir: string,
  userDataDir: string,
  baseURL: string,
) {
  return chromium.launchPersistentContext(userDataDir, {
    // Headless shell cannot load MV3 extensions; bundled Chromium can.
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
    baseURL,
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      // Optional-host prompts are browser chrome, not DOM. Tests grant the
      // HTTPS fixture origin through profile prefs after install, then this
      // flag fails closed if a prompt still appears.
      '--deny-permission-prompts',
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
  });
}

async function mockEmployer(context: BrowserContext, expectedName: string) {
  let writes = 0;
  await context.route('https://employer.example/**', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      writes += 1;
      const posted = new URLSearchParams(route.request().postData() ?? '').get(
        'name',
      );
      expect(posted).toBe(expectedName);
      await route.fulfill({
        contentType: 'text/html',
        body: '<h1>Fictional receipt SEND-174</h1>',
      });
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: url.includes('/not-fixture') ? NOT_FIXTURE : FORM,
    });
  });
  return { writes: () => writes };
}

async function launchOperative(baseURL: string) {
  const extDir = await packExtension();
  const packed = JSON.parse(
    await readFile(join(extDir, 'manifest.json'), 'utf8'),
  ) as {
    host_permissions: string[];
  };
  expect(
    packed.host_permissions.some((rule) => rule.startsWith('https:')),
  ).toBe(false);
  const userDataDir = await mkdtemp(join(tmpdir(), 'relay-operative-profile-'));
  const warmup = await launchExtensionContext(extDir, userDataDir, baseURL);
  let worker = warmup.serviceWorkers()[0];
  if (!worker)
    worker = await warmup.waitForEvent('serviceworker', { timeout: 20_000 });
  const extensionId = new URL(worker.url()).host;
  await warmup.close();
  // Packed manifest still has no HTTPS hosts. This records the same grant a
  // user makes with permissions.request on Start for the fictional fixture.
  await grantOptionalHttpsHosts(userDataDir, extensionId, [
    'https://employer.example/*',
  ]);
  const context = await launchExtensionContext(extDir, userDataDir, baseURL);
  worker = context.serviceWorkers()[0];
  if (!worker)
    worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  return { context, extensionId, extDir, userDataDir };
}

async function dispose(session: {
  context: BrowserContext;
  extDir: string;
  userDataDir: string;
}) {
  await session.context.close().catch(() => undefined);
  await rm(session.extDir, { recursive: true, force: true });
  await rm(session.userDataDir, { recursive: true, force: true });
}

async function signIn(context: BrowserContext, baseURL: string) {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(baseURL);
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => typeof window.relay?.relay_wait_for_application),
    )
    .toBe('function');
  return page;
}

async function seedJob(page: Page, name: string) {
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const destination = `https://employer.example/jobs/${slug}`;
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: name,
          Job: destination,
          url: `https://research.example/evidence/${slug}`,
          Status: 'Held',
          Notes: 'Fictional first-party operative fixture; no real employer.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((row: { name: string }) => row.name === name);
  await enableInspectJob(page, ws.viewer, job.id);
  return { job, destination, viewer: ws.viewer as string };
}

function selectValues(el: HTMLElement | SVGElement) {
  return [...(el as unknown as HTMLSelectElement).options].map(
    (option) => option.value,
  );
}

function optionCount(el: HTMLElement | SVGElement) {
  return (el as unknown as HTMLSelectElement).options.length;
}

function optionLabels(el: HTMLElement | SVGElement) {
  return [...(el as unknown as HTMLSelectElement).options].map(
    (option) => option.textContent || '',
  );
}

declare global {
  interface Window {
    relay?: Record<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >;
  }
}

async function startOperative(
  context: BrowserContext,
  extensionId: string,
  jobId: string,
) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect
    .poll(() => popup.getByLabel('Relay tab').evaluate(optionCount))
    .toBeGreaterThan(0);
  await expect
    .poll(() => popup.getByLabel('Fixture tab').evaluate(optionCount))
    .toBeGreaterThan(0);
  await expect
    .poll(() => popup.getByLabel('Job').evaluate(selectValues))
    .toContain(jobId);
  await popup.getByLabel('Job').selectOption(jobId);
  await popup.getByLabel('Full name').fill('Avery Example');
  const runOpened = context.waitForEvent('page', {
    predicate: (page) => page.url().includes('run.html'),
  });
  await popup.getByRole('button', { name: 'Start operative' }).click();
  const run = await runOpened;
  return { popup, run };
}

test('first-party operative submits the fixture once after Inspect Accept', async ({
  baseURL,
}) => {
  test.setTimeout(90_000);
  const session = await launchOperative(baseURL!);
  try {
    const human = await signIn(session.context, baseURL!);
    const name = 'Cedar Fictional — First-Party Operative';
    const { job, destination, viewer } = await seedJob(human, name);
    const employer = await mockEmployer(session.context, 'Avery Example');
    const fixture = await session.context.newPage();
    await fixture.goto(destination);
    await expect(
      fixture.getByRole('button', { name: 'Submit fictional application' }),
    ).toBeVisible();
    const forbidden = await session.context.newPage();
    await forbidden.goto(
      `chrome-extension://${session.extensionId}/popup.html`,
    );
    const blocked = await forbidden.evaluate(async (url) => {
      const response = await fetch(`${url}/api/applications`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'begin',
          viewer: 'extension-origin',
          id: 'must-not-run',
          digest: '0'.repeat(64),
        }),
      });
      const text = await response.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* Local identity may refuse before JSON origin handling. */
      }
      return { status: response.status, body };
    }, baseURL);
    expect(blocked.status).toBe(403);
    await forbidden.close();
    await human.goto('/');
    await human.getByRole('button', { name, exact: true }).click();
    const { run } = await startOperative(
      session.context,
      session.extensionId,
      job.id,
    );
    await expect(sendButton(human)).toBeEnabled({ timeout: 20_000 });
    await sendButton(human).click();
    await expect(run.getByText(/Submitted once/)).toBeVisible({
      timeout: 40_000,
    });
    expect(employer.writes()).toBe(1);
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
    const second = await human.request.post('/api/applications', {
      data: {
        action: 'begin',
        viewer,
        id: (
          await (
            await human.request.get(
              `/api/applications?job=${encodeURIComponent(job.id)}`,
            )
          ).json()
        ).operation_id,
        digest: (
          await (
            await human.request.get(
              `/api/applications?job=${encodeURIComponent(job.id)}`,
            )
          ).json()
        ).digest,
      },
    });
    expect(second.status()).toBe(409);
    expect(employer.writes()).toBe(1);
  } finally {
    await dispose(session);
  }
});

test('closing the operative tab does not submit after Accept', async ({
  baseURL,
}) => {
  test.setTimeout(90_000);
  const session = await launchOperative(baseURL!);
  try {
    const human = await signIn(session.context, baseURL!);
    const name = 'Cedar Fictional — Operative Disconnect';
    const { destination } = await seedJob(human, name);
    const employer = await mockEmployer(session.context, 'Avery Example');
    const fixture = await session.context.newPage();
    await fixture.goto(destination);
    await human.goto('/');
    await human.getByRole('button', { name, exact: true }).click();
    const ws = await (await human.request.get('/api/workspace')).json();
    const job = ws.jobs.find((row: { name: string }) => row.name === name);
    const { run } = await startOperative(
      session.context,
      session.extensionId,
      job.id,
    );
    await expect(run.getByText(/Preparing and waiting/)).toBeVisible();
    await expect(sendButton(human)).toBeEnabled({ timeout: 20_000 });
    await run.close();
    await sendButton(human).click();
    await expect.poll(() => employer.writes()).toBe(0);
  } finally {
    await dispose(session);
  }
});

test('incomplete fixture fields never start a send', async ({ baseURL }) => {
  test.setTimeout(60_000);
  const session = await launchOperative(baseURL!);
  try {
    const human = await signIn(session.context, baseURL!);
    const name = 'Cedar Fictional — Operative Incomplete';
    const { job, destination } = await seedJob(human, name);
    const employer = await mockEmployer(session.context, 'Avery Example');
    const fixture = await session.context.newPage();
    await fixture.goto(destination);
    const popup = await session.context.newPage();
    await popup.goto(`chrome-extension://${session.extensionId}/popup.html`);
    await expect
      .poll(() => popup.getByLabel('Job').evaluate(selectValues))
      .toContain(job.id);
    await popup.getByRole('button', { name: 'Start operative' }).click();
    await expect(
      popup.getByText('Choose Relay, fixture, job, and a complete Full name.'),
    ).toBeVisible();
    expect(
      session.context.pages().some((page) => page.url().includes('run.html')),
    ).toBe(false);
    expect(employer.writes()).toBe(0);
  } finally {
    await dispose(session);
  }
});

test('HTTPS fixture lists without install-time hosts and a real form never starts', async ({
  baseURL,
}) => {
  test.setTimeout(60_000);
  const session = await launchOperative(baseURL!);
  try {
    const human = await signIn(session.context, baseURL!);
    const name = 'Cedar Fictional — Operative Not Fixture';
    const { job } = await seedJob(human, name);
    const employer = await mockEmployer(session.context, 'Avery Example');
    const realForm = await session.context.newPage();
    await realForm.goto('https://employer.example/not-fixture');
    await expect(
      realForm.getByRole('button', { name: 'Apply now' }),
    ).toBeVisible();
    const popup = await session.context.newPage();
    await popup.goto(`chrome-extension://${session.extensionId}/popup.html`);
    await expect
      .poll(() => popup.getByLabel('Fixture tab').evaluate(optionLabels))
      .toEqual(
        expect.arrayContaining([expect.stringMatching(/employer\.example/)]),
      );
    await expect
      .poll(() => popup.getByLabel('Job').evaluate(selectValues))
      .toContain(job.id);
    await popup.getByLabel('Job').selectOption(job.id);
    await popup.getByLabel('Full name').fill('Avery Example');
    await popup.getByRole('button', { name: 'Start operative' }).click();
    await expect(
      popup.getByText(
        /fictional fixture form|Fixture submit control not found/,
      ),
    ).toBeVisible({ timeout: 20_000 });
    expect(
      session.context.pages().some((page) => page.url().includes('run.html')),
    ).toBe(false);
    expect(employer.writes()).toBe(0);
  } finally {
    await dispose(session);
  }
});
