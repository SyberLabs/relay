import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
import { holdLoopbackPorts } from './loopback-port.mjs';

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
const held = await holdLoopbackPorts(2);
const [port, inspectorPort] = held.ports;
await held.release();
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
    String(inspectorPort),
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
  assert.match(html, /Make your next move/);
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
  console.log(
    'PASS: built app rendering/assets, signed identity, persistence, tenant isolation, forged headers, request origin, exact acceptance and stale-write integrity.',
  );
} finally {
  await finishProductionServer(server, log);
}
