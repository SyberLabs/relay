import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT } from '../integrations/client.mjs';

const relay = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'integrations',
  'relay.mjs',
);

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
    server.once('error', reject);
  });
}

function startStub() {
  const server = createServer((req, res) => {
    const path = req.url?.split('?')[0];
    if (path === '/signin-with-chatgpt') {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Set-Cookie': 'sites=test; Path=/; HttpOnly',
      });
      res.end('ok');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: 1, usable: 0, facts: [], rules: [] }));
  });
  return listen(server).then((url) => ({ server, url }));
}

function stopStub(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function runRelay(args, { cwd, env = {} } = {}) {
  const timeoutMs = 8000;
  const child = spawn(process.execPath, [relay, ...args], {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => {
        resolve({ code, signal, stdout, stderr });
      });
    });
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) {
    throw new Error(`CLI hung after ${timeoutMs}ms\n${stderr}`);
  }
  return result;
}

void test('login over real fetch exits 0 without aborting or printing help', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'relay-cli-exit-'));
  const stub = await startStub();
  try {
    const result = await runRelay(['login'], {
      cwd,
      env: { RELAY_URL: stub.url },
    });
    assert.equal(result.code, EXIT.ok, result.stderr);
    assert.match(result.stdout, /Signed in\. Profile v1/);
    assert.doesNotMatch(result.stdout, /Relay integrations/);
  } finally {
    await stopStub(stub.server);
    await rm(cwd, { recursive: true, force: true });
  }
});

void test('unknown commands still print usage and exit 1', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'relay-cli-help-'));
  try {
    const result = await runRelay(['nonsense'], { cwd });
    assert.equal(result.code, EXIT.usage, result.stderr);
    assert.match(result.stdout, /Relay integrations/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
