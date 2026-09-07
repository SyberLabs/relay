import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { releaseConfig } from '../release/config.mjs';
import {
  describeUnexpectedResponse,
  finishProductionServer,
  processSnapshot,
  readBoundedBody,
} from './production-diagnostics.mjs';

// Only the test entry supplies a local verification key. The compiled app,
// authentication handler, assets and SQL migrations are the release versions.
const root = process.cwd();
await mkdir('.wrangler', { recursive: true });
await mkdir('outputs/ci', { recursive: true });
const state = await mkdtemp(resolve('.wrangler/ci-production-'));
const build = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
const { privateKey, publicKey } = await generateKeyPair('RS256');
const issuer = 'https://relay-ci.cloudflareaccess.com';
const audience = 'a'.repeat(64);
const release = 'b'.repeat(40);
const config = releaseConfig(
  {
    ACCESS_ISSUER: issuer,
    ACCESS_AUD: audience,
    TURNSTILE_SITE_KEY: 'fictional-site-key',
    RELEASE_SHA: release,
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
    WORKER_NAME: 'relay-staging',
    DEPLOY_URL: 'https://relay-ci.example.com',
  },
  build,
);
delete config.account_id;
delete config.routes;
config.main = resolve('tests/fixtures/gateway-worker.mjs');
config.no_bundle = false;
// The configuration sits beside the disposable database; never watch database
// writes as application source or Wrangler will restart during POST requests.
config.build = {
  watch_dir: [
    resolve('deploy'),
    resolve('tests/fixtures'),
    resolve('dist/server'),
  ],
};
config.assets.directory = resolve('dist/client');
config.d1_databases[0].migrations_dir = resolve('drizzle');
config.vars.RELAY_TEST_JWK = JSON.stringify(await exportJWK(publicKey));
config.vars.TURNSTILE_SECRET_KEY = 'fictional-secret';
const configPath = resolve(state, 'wrangler.json');
await writeFile(configPath, JSON.stringify(config, null, 2));
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_WRITE_LOGS: 'false',
};

async function command(args) {
  await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? accept() : reject(Error(`Wrangler failed: ${code}`)),
    );
  });
}
await command([
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--config',
  configPath,
  '--persist-to',
  state,
]);
const portProbe = createServer();
await new Promise((accept, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', accept);
});
const port = portProbe.address().port;
await new Promise((accept, reject) =>
  portProbe.close((error) => (error ? reject(error) : accept())),
);
const base = `http://127.0.0.1:${port}`;
const log = createWriteStream('outputs/ci/production-server.log');
const server = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    state,
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--inspector-port',
    '0',
  ],
  {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  },
);
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });
let startupError;
server.on('error', (error) => {
  startupError = error;
});
async function expectStatus(response, expected, operation) {
  if (response.status === expected) return response;
  const body = await readBoundedBody(response);
  const detail = describeUnexpectedResponse({
    operation,
    status: response.status,
    body: body.text,
    truncated: body.truncated,
    timedOut: body.timedOut,
    bodyBytes: body.bytes,
    headers: response.headers,
    processState: processSnapshot(server),
  });
  await new Promise((accept, reject) => {
    log.write(detail, (error) => (error ? reject(error) : accept()));
  });
  assert.equal(response.status, expected, detail);
  return response;
}

try {
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (server.exitCode !== null)
      throw Error('Built worker exited. See outputs/ci/production-server.log.');
    try {
      ready =
        (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2_000) }))
          .status === 200;
      if (ready) break;
    } catch {
      /* A bounded probe waits for this worker to start. */
    }
    await delay(250);
  }
  assert.ok(ready, 'Built worker failed to become ready');
  const token = (owner) =>
    new SignJWT({ email: `${owner}@example.com` })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(owner)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  const first = await token('owner-a');
  const second = await token('owner-b');
  const call = (jwt, body, extra = {}) =>
    fetch(`${base}/api/workspace`, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  await expectStatus(
    await call(null, undefined, {
      'oai-authenticated-user-id': 'cloudflare:owner-a',
    }),
    401,
    'spoofed identity header without Access token',
  );
  const htmlResponse = await fetch(base, {
    headers: { 'Cf-Access-Jwt-Assertion': first },
  });
  await expectStatus(htmlResponse, 200, 'authenticated document');
  const html = await htmlResponse.text();
  assert.match(html, /Import research/);
  assert.doesNotMatch(html, /Make your next move/);
  assert.doesNotMatch(html, /Selection is the largest lever/);
  const scriptPath = html.match(/<script[^>]+src="([^"]+\.js[^"]*)"/)?.[1];
  assert.ok(scriptPath, 'Compiled page must load its client JavaScript');
  await expectStatus(
    await fetch(new URL(scriptPath, base)),
    401,
    'unauthenticated asset',
  );
  const script = await expectStatus(
    await fetch(new URL(scriptPath, base), {
      headers: { 'Cf-Access-Jwt-Assertion': first },
    }),
    200,
    'authenticated asset',
  );
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.deepEqual((await (await call(first)).json()).jobs, []);
  await expectStatus(
    await call(first, { action: 'bootstrap' }),
    200,
    'owner-a bootstrap',
  );
  const firstWorkspace = await (await call(first)).json();
  assert.equal(firstWorkspace.jobs.length, 3);
  assert.deepEqual(
    (await (await call(second)).json()).jobs,
    [],
    'Second owner must not see first owner data',
  );
  const job = firstWorkspace.jobs.find((item) =>
    item.job_key.endsWith('/backend'),
  );
  const update = {
    action: 'save',
    id: job.id,
    version: job.version,
    status: 'Ready',
    draft: 'A fictional draft verified through the built application.',
    blocker: '',
  };
  await expectStatus(
    await call(second, update),
    404,
    'owner-b save of owner-a record',
  );
  await expectStatus(
    await call(first, update, { origin: 'https://untrusted.example.com' }),
    403,
    'owner-a save with untrusted origin',
  );
  await expectStatus(await call(first, update), 200, 'owner-a save');
  await expectStatus(await call(first, update), 409, 'owner-a stale save');
  const saved = await (
    await call(first, undefined, {
      'oai-authenticated-user-id': 'cloudflare:owner-b',
    })
  ).json();
  const accepted = saved.jobs.find((item) => item.id === job.id);
  assert.equal(
    accepted.accepted_draft,
    update.draft,
    'Verified identity must override forged identity',
  );
  assert.equal(accepted.status, 'Ready');
  assert.equal(
    saved.events.filter((event) => event.job_id === job.id).length,
    1,
    'Rejected stale writes leave no event',
  );
  assert.deepEqual((await (await call(second)).json()).jobs, []);
  const isolationRow = {
    url: 'https://example.com/research/owner-b-isolation',
    Name: 'Northstar Example — Isolation Engineer',
    Job: 'https://example.com/jobs/backend',
    Status: 'Held',
    Notes: 'Fictional owner-b note that must not appear in owner-a history.',
  };
  assert.equal(
    (await call(second, { action: 'import', rows: [isolationRow] })).status,
    200,
  );
  const ownerA = await (await call(first)).json();
  const ownerB = await (await call(second)).json();
  assert.equal(
    ownerA.jobs.find((item) => item.id === job.id).accepted_draft,
    update.draft,
  );
  assert.equal(
    ownerA.sources.some((source) => source.source_url === isolationRow.url),
    false,
    'Owner A must not enumerate owner B import sources',
  );
  assert.equal(
    ownerB.jobs.some((item) => item.id === job.id),
    false,
    'Owner B must not enumerate owner A job ids',
  );
  assert.equal(ownerB.jobs.length, 1);
  assert.equal(ownerB.sources.length, 1);
  assert.equal(ownerB.events.length, 0);
  const foreign = ownerB.jobs[0];
  assert.equal(
    (
      await call(first, {
        action: 'save',
        id: foreign.id,
        version: foreign.version,
        status: 'Ready',
        draft: 'Owner A must not accept owner B text.',
        blocker: '',
      })
    ).status,
    404,
  );
  const expired = await new SignJWT({ email: 'owner-a@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('owner-a')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
    .setExpirationTime(1)
    .sign(privateKey);
  assert.equal((await call(expired)).status, 401);
  const wrongAudience = await new SignJWT({ email: 'owner-a@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('owner-a')
    .setIssuer(issuer)
    .setAudience('b'.repeat(64))
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  assert.equal((await call(wrongAudience)).status, 401);
  const service = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('release-smoke')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  assert.equal((await call(service)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/readyz`, {
        headers: { 'Cf-Access-Jwt-Assertion': service },
      })
    ).status,
    200,
    'Service identity may prove readiness only',
  );
  const playwrightPkg = JSON.parse(
    await readFile(
      resolve(root, 'node_modules/@playwright/test/package.json'),
      'utf8',
    ),
  );
  const playwright = resolve(
    root,
    'node_modules/@playwright/test',
    typeof playwrightPkg.bin === 'string'
      ? playwrightPkg.bin
      : playwrightPkg.bin.playwright,
  );
  await new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [playwright, 'test', 'tests/e2e/isolation.spec.ts'],
      {
        cwd: root,
        env: {
          ...env,
          RELAY_TEST_URL: base,
          RELAY_OWNER_A_JWT: first,
          RELAY_OWNER_B_JWT: second,
        },
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0
        ? accept()
        : reject(
            Error(`Browser two-session isolation failed (${code ?? signal})`),
          ),
    );
  });
  const limitedUser = await token('quota-fixture');
  console.log('Checking concurrent planner throttling.');
  const planReplies = await Promise.all(Array.from({ length: 15 }, () => fetch(`${base}/api/plan`, {
    headers: { 'Cf-Access-Jwt-Assertion': limitedUser },
    signal: AbortSignal.timeout(20_000),
  })));
  assert.ok(planReplies.every(response => [200, 429].includes(response.status)));
  assert.ok(planReplies.some(response => response.status === 429), 'Concurrent planner calls must exhaust the D1 throttle');
  for (const response of planReplies) {
    if (response.status === 429) assert.ok(Number(response.headers.get('retry-after')) > 0);
    await response.text();
  }
  console.log('Checking oversized mutation refusal.');
  const oversized = await fetch(`${base}/api/workspace`, {
    method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': limitedUser },
    body: 'x'.repeat(2_000_001),
    signal: AbortSignal.timeout(20_000),
  });
  await expectStatus(oversized, 413, 'Oversized mutation refused before the application');
  await oversized.text();
  console.log('Checking persistence after oversized mutation refusal.');
  const afterRefusal = await fetch(`${base}/api/workspace`, {
    headers: { 'Cf-Access-Jwt-Assertion': limitedUser }, signal: AbortSignal.timeout(20_000),
  });
  await expectStatus(afterRefusal, 200, 'Read after oversized mutation refusal');
  assert.deepEqual((await afterRefusal.json()).jobs, []);
  for (const { label, path, headers, status } of [
    { label: 'missing CAPTCHA origin', path: '/security/check', headers: { 'Cf-Access-Jwt-Assertion': limitedUser }, status: 403 },
    { label: 'mismatched CAPTCHA origin', path: '/security/check', headers: { 'Cf-Access-Jwt-Assertion': limitedUser, Origin: 'https://untrusted.example' }, status: 403 },
    { label: 'unauthenticated upload', path: '/api/workspace', headers: {}, status: 401 },
  ]) {
    console.log(`Checking request after ${label} refusal.`);
    const refused = await fetch(`${base}${path}`, {
      method: 'POST', headers, body: 'x'.repeat(2_000_001),
      signal: AbortSignal.timeout(20_000),
    });
    await expectStatus(refused, status, label);
    await refused.text();
    const next = await fetch(`${base}/api/workspace`, {
      headers: { 'Cf-Access-Jwt-Assertion': limitedUser },
      signal: AbortSignal.timeout(20_000),
    });
    await expectStatus(next, 200, `Read after ${label} refusal`);
    assert.deepEqual((await next.json()).jobs, []);
  }
  console.log(
    'Checking progress preservation, replay and production gateway refusals.',
  );
  const progressUser = await token('progress-fixture');
  await expectStatus(
    await call(progressUser, { action: 'bootstrap' }),
    200,
    'progress fixture bootstrap',
  );
  const progressInitial = await (await call(progressUser)).json();
  const progressJob = progressInitial.jobs.find((item) =>
    item.job_key.endsWith('/backend'),
  );
  await expectStatus(
    await call(progressUser, {
      action: 'save',
      id: progressJob.id,
      version: progressJob.version,
      status: 'Ready',
      draft: 'Exact fictional accepted progress fixture.',
      blocker: '',
    }),
    200,
    'progress fixture exact acceptance',
  );
  const beforeProgress = await (await call(progressUser)).json();
  const reviewedJob = beforeProgress.jobs.find(
    (item) => item.id === progressJob.id,
  );
  const progress = {
    action: 'progress',
    id: reviewedJob.id,
    version: reviewedJob.version,
    operation_id: 'production-progress-recovery-1',
    note: 'Saved application work before a fictional browser interruption.',
    blocker: 'Complete the employer CAPTCHA, then resume.',
  };
  for (const [response, status, label] of [
    [await call(null, progress), 401, 'anonymous progress'],
    [await call(second, progress), 404, 'cross-owner progress'],
    [
      await call(progressUser, progress, {
        origin: 'https://untrusted.example.com',
      }),
      403,
      'untrusted-origin progress',
    ],
    [
      await call(progressUser, { ...progress, version: progressJob.version }),
      409,
      'stale progress',
    ],
  ])
    await expectStatus(response, status, label);
  assert.deepEqual(
    await (await call(progressUser)).json(),
    beforeProgress,
    'Refused progress must not change jobs or history',
  );
  const progressSaved = await expectStatus(
    await call(progressUser, progress),
    200,
    'valid progress',
  );
  assert.equal((await progressSaved.json()).replayed, false);
  const afterProgress = await (await call(progressUser)).json();
  const progressedJob = afterProgress.jobs.find(
    (item) => item.id === reviewedJob.id,
  );
  assert.equal(progressedJob.draft, reviewedJob.draft);
  assert.equal(progressedJob.accepted_draft, reviewedJob.accepted_draft);
  assert.equal(progressedJob.status, reviewedJob.status);
  assert.equal(progressedJob.blocker, progress.blocker);
  assert.deepEqual(
    afterProgress.jobs.filter((item) => item.id !== reviewedJob.id),
    beforeProgress.jobs.filter((item) => item.id !== reviewedJob.id),
  );
  assert.equal(
    afterProgress.events.filter(
      (event) =>
        event.job_id === reviewedJob.id && event.kind === 'Progress saved',
    ).length,
    1,
  );
  const replayed = await expectStatus(
    await call(progressUser, progress),
    200,
    'identical progress replay',
  );
  assert.equal((await replayed.json()).replayed, true);
  assert.deepEqual(
    await (await call(progressUser)).json(),
    afterProgress,
    'An ambiguous response may replay without adding another event',
  );

  // Same-operation retries are only a fictional load fixture. The product must
  // never retry refused mutations automatically. Real gateway counters remain intact.
  let progressRefusals = 0;
  for (let batch = 0; batch < 4; batch++) {
    const replies = await Promise.all(
      Array.from({ length: 8 }, () => call(progressUser, progress)),
    );
    for (const response of replies) {
      assert.ok(
        [200, 403, 429].includes(response.status),
        `Unexpected progress admission status ${response.status}`,
      );
      if (response.status === 200)
        assert.equal((await response.json()).replayed, true);
      else {
        progressRefusals++;
        const refused = await response.json();
        if (response.status === 403)
          assert.equal(refused.verification_url, '/security/check');
        if (response.status === 429)
          assert.ok(Number(response.headers.get('retry-after')) > 0);
      }
    }
  }
  assert.ok(
    progressRefusals > 0,
    'Production gateway must refuse excess progress attempts',
  );
  assert.deepEqual(
    await (await call(progressUser)).json(),
    afterProgress,
    'Gateway-refused progress and successful replays must not write new history or drafts',
  );
  console.log(
    'PASS: built app rendering/assets, signed identity, persistence, tenant isolation, import isolation, expired and service identities, forged headers, request origin, exact acceptance and stale-write integrity, two-session browser isolation, concurrent D1 throttling and oversized request refusal.',
  );
} finally {
  await finishProductionServer(server, log);
}
