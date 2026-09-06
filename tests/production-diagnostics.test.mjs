import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  describeUnexpectedResponse,
  finishProductionServer,
  processSnapshot,
  readBoundedBody,
} from '../scripts/ci/production-diagnostics.mjs';

const fictionalJwt =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJvd25lci1hIn0.fictional';

function headers(extra = {}) {
  return new Headers({
    'content-type': 'text/plain',
    'retry-after': '2',
    authorization: `Bearer ${fictionalJwt}`,
    'cf-access-jwt-assertion': fictionalJwt,
    'set-cookie': 'session=secret',
    ...extra,
  });
}

test('unexpected response keeps selected metadata and omits request authentication', () => {
  const detail = describeUnexpectedResponse({
    operation: 'owner-a save',
    status: 503,
    body: `Worker failed\n${fictionalJwt}`,
    truncated: false,
    timedOut: false,
    bodyBytes: 32,
    headers: headers(),
    processState: { pid: 4242, exitCode: null, signal: null },
  });
  assert.match(detail, /operation: owner-a save/);
  assert.match(detail, /status: 503/);
  assert.match(detail, /content-type: text\/plain/);
  assert.match(detail, /retry-after: 2/);
  assert.match(detail, /body-bytes: 32/);
  assert.match(detail, /process: pid=4242 exit=null signal=null/);
  assert.doesNotMatch(detail, /authorization/i);
  assert.doesNotMatch(detail, /cf-access-jwt-assertion/i);
  assert.doesNotMatch(detail, /set-cookie/i);
  assert.doesNotMatch(detail, /Bearer /);
  assert.doesNotMatch(detail, /eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9/);
  assert.match(detail, /\[redacted-jwt\]/);
});

test('503 body mentioning restart is copied, not interpreted as a process restart', () => {
  const detail = describeUnexpectedResponse({
    operation: 'owner-a save',
    status: 503,
    body: 'Detected a change, restarting local server...',
    headers: new Headers({ 'content-type': 'text/html' }),
    processState: processSnapshot({ pid: 7, exitCode: null, signalCode: null }),
  });
  assert.match(detail, /Detected a change, restarting local server/);
  assert.doesNotMatch(detail, /^restart:/m);
  assert.doesNotMatch(detail, /process restarted/i);
  assert.match(detail, /exit=null signal=null/);
});

test('body read stops at the byte limit', async () => {
  const response = new Response('n'.repeat(5000), {
    status: 503,
    headers: { 'content-type': 'text/plain' },
  });
  const body = await readBoundedBody(response, {
    byteLimit: 64,
    timeoutMs: 500,
  });
  assert.equal(body.truncated, true);
  assert.equal(body.timedOut, false);
  assert.equal(body.bytes, 64);
  assert.equal(Buffer.byteLength(body.text), 64);
});

test('body read stops at the deadline instead of hanging', async () => {
  const body = new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
  });
  const response = new Response(body, { status: 503 });
  const started = Date.now();
  const result = await readBoundedBody(response, {
    byteLimit: 2048,
    timeoutMs: 75,
  });
  assert.ok(Date.now() - started < 500);
  assert.equal(result.timedOut, true);
});

test('detached process-group teardown captures post-SIGTERM output and reaps nested children', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'relay-prod-log-'));
  const logPath = resolve(directory, 'production-server.log');
  const log = createWriteStream(logPath);
  const nested = `
    const nested = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    process.stdout.write('grandchild=' + nested.pid + '\\n');
    process.on('SIGTERM', () => {
      process.stdout.write('after-term\\n');
      process.exit(0);
    });
    setInterval(() => {}, 1000);
  `;
  const child = spawn(
    process.execPath,
    ['-e', `import { spawn } from 'node:child_process';${nested}`],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    },
  );
  let seen = '';
  child.stdout.on('data', (chunk) => {
    seen += chunk.toString();
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const deadline = Date.now() + 2_000;
  while (!seen.includes('grandchild=') && Date.now() < deadline)
    await delay(10);
  const grandchild = Number(seen.match(/grandchild=(\d+)/)?.[1]);
  assert.ok(grandchild, `nested child pid missing: ${seen}`);
  try {
    await finishProductionServer(child, log, { timeoutMs: 1_000 });
    const text = await readFile(logPath, 'utf8');
    if (process.platform !== 'win32') assert.match(text, /after-term/);
    assert.throws(() => process.kill(grandchild, 0), { code: 'ESRCH' });
  } finally {
    if (child.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } else {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {
        /* Best-effort cleanup after the assertion. */
      }
    }
    try {
      process.kill(grandchild, 'SIGKILL');
    } catch {
      /* Nested child already reaped. */
    }
  }
});

test('teardown still finishes when the leader ignores SIGTERM', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'relay-prod-kill-'));
  const logPath = resolve(directory, 'production-server.log');
  const log = createWriteStream(logPath);
  const child = spawn(
    process.execPath,
    [
      '-e',
      'process.on("SIGTERM", () => {}); process.stdout.write("ready\\n"); setInterval(() => {}, 1000);',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    },
  );
  let seen = '';
  child.stdout.on('data', (chunk) => {
    seen += chunk.toString();
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const readyUntil = Date.now() + 2_000;
  while (!seen.includes('ready') && Date.now() < readyUntil) await delay(10);
  assert.match(seen, /ready/);
  const started = Date.now();
  try {
    await finishProductionServer(child, log, { timeoutMs: 200 });
    if (process.platform !== 'win32') assert.ok(Date.now() - started >= 150);
    assert.ok(Date.now() - started < 2_000);
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    await readFile(logPath);
  } finally {
    if (child.pid) {
      try {
        process.kill(
          process.platform === 'win32' ? child.pid : -child.pid,
          'SIGKILL',
        );
      } catch {
        /* Best-effort cleanup after the assertion. */
      }
    }
  }
});
