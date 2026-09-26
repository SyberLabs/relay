import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXIT,
  RelayError,
  exitFor,
  baseUrl,
  request,
} from '../integrations/client.mjs';
import { parseArgs, outcomeBody } from '../integrations/cli.mjs';

void test('arguments parse into positionals and flags in every form', () => {
  const { positional, flags } = parseArgs([
    'stage',
    'job-1',
    'draft.txt',
    '--version',
    '3',
    '--blocker=',
    '--json',
  ]);
  assert.deepEqual(positional, ['stage', 'job-1', 'draft.txt']);
  assert.equal(flags.version, '3');
  assert.equal(flags.blocker, '');
  assert.equal(flags.json, true);
});

void test('a flag followed by another flag is a boolean, not a value', () => {
  const { flags } = parseArgs(['outcome', '--json', '--verbose']);
  assert.equal(flags.json, true);
  assert.equal(flags.verbose, true);
});

void test('an inline value keeps characters that would otherwise split it', () => {
  const { flags } = parseArgs([
    'outcome',
    'j',
    'submitted',
    '--receipt=ref=a=b',
  ]);
  assert.equal(flags.receipt, 'ref=a=b');
});

// An agent must distinguish a refusal from a transient failure before retrying.
void test('domain refusals and server failures map to different exit codes', () => {
  for (const status of [400, 403, 404, 409, 413])
    assert.equal(exitFor(status), EXIT.refused, `HTTP ${status}`);
  for (const status of [500, 502, 503])
    assert.equal(exitFor(status), EXIT.server, `HTTP ${status}`);
  assert.equal(exitFor(401), EXIT.auth);
  assert.equal(exitFor(200), EXIT.ok);
  assert.notEqual(EXIT.refused, EXIT.server);
});

void test('the CLI refuses to point at anything but a local server', () => {
  const original = process.env.RELAY_URL;
  try {
    process.env.RELAY_URL = 'https://relay.example.com';
    assert.throws(baseUrl, /local-only/);
    process.env.RELAY_URL = 'not a url';
    assert.throws(baseUrl, /not a valid URL/);
    process.env.RELAY_URL = 'http://127.0.0.1:3000/';
    assert.equal(baseUrl(), 'http://127.0.0.1:3000');
    delete process.env.RELAY_URL;
    assert.equal(baseUrl(), 'http://localhost:3000');
  } finally {
    if (original === undefined) delete process.env.RELAY_URL;
    else process.env.RELAY_URL = original;
  }
});

void test('an unreachable server is a retryable failure, not a refusal', async () => {
  await assert.rejects(
    () =>
      request('/api/workspace', undefined, {
        session: 'x=1',
        fetchImpl: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    (e) => e instanceof RelayError && e.code === EXIT.server,
  );
});

void test('a refused stage carries the server message and refused code', async () => {
  await assert.rejects(
    () =>
      request(
        '/api/workspace',
        { action: 'stage' },
        {
          session: 'x=1',
          fetchImpl: async () => ({
            ok: false,
            status: 400,
            json: async () => ({
              error: 'This job changed. Reload before staging.',
            }),
          }),
        },
      ),
    (e) =>
      e instanceof RelayError &&
      e.code === EXIT.refused &&
      /This job changed/.test(e.message),
  );
});

void test('a non-JSON body is reported rather than parsed into nonsense', async () => {
  await assert.rejects(
    () =>
      request('/api/workspace', undefined, {
        session: 'x=1',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('bad json');
          },
        }),
      }),
    /non-JSON response/,
  );
});

void test('requests without a session stop before reaching the network', async () => {
  let called = false;
  await assert.rejects(
    () =>
      request('/api/workspace', undefined, {
        session: null,
        fetchImpl: async () => {
          called = true;
          return { ok: true, status: 200, json: async () => ({}) };
        },
      }),
    (e) => e instanceof RelayError && e.code === EXIT.auth,
  );
  assert.equal(called, false, 'no request is attempted while signed out');
});

void test('the session cookie travels on every request and nothing else does', async () => {
  let seen;
  await request('/api/workspace', undefined, {
    session: '__sites_local_auth=1',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
  });
  assert.match(seen.url, /^http:\/\/localhost:3000\/api\/workspace$/);
  assert.equal(seen.init.headers.cookie, '__sites_local_auth=1');
  assert.equal(seen.init.method, 'GET');
  assert.equal(seen.init.body, undefined);
});

void test('recording an outcome sends the job version the server requires', () => {
  const body = outcomeBody({ id: 'job-1', version: 7 }, 'submitted', {
    receipt: 'conf-88',
    at: '2026-09-06T00:00:00.000Z',
  });
  assert.deepEqual(body, {
    action: 'record',
    id: 'job-1',
    version: 7,
    kind: 'submitted',
    receipt: 'conf-88',
    occurred: '2026-09-06T00:00:00.000Z',
  });
});

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

void test('request() treats a JSON 401 as auth before using the body', async () => {
  await assert.rejects(
    () =>
      request('/api/workspace', undefined, {
        session: 'x=1',
        fetchImpl: async () => jsonResponse(401, { error: 'Unauthorized' }),
      }),
    (e) => e instanceof RelayError && e.code === EXIT.auth,
  );
});

void test('request() treats a plaintext 401 as auth, not a server parse failure', async () => {
  await assert.rejects(
    () =>
      request('/api/workspace', undefined, {
        session: 'x=1',
        fetchImpl: async () => ({
          ok: false,
          status: 401,
          json: async () => {
            throw new Error('Unexpected token S in JSON');
          },
        }),
      }),
    (e) => e instanceof RelayError && e.code === EXIT.auth,
  );
});

void test('plaintext refusal statuses keep exitFor when the body is not JSON', async () => {
  for (const status of [400, 403, 404, 409, 413]) {
    await assert.rejects(
      () =>
        request('/api/workspace', undefined, {
          session: 'x=1',
          fetchImpl: async () => new Response('Forbidden', { status }),
        }),
      (e) =>
        e instanceof RelayError &&
        e.code === EXIT.refused &&
        e.code === exitFor(status),
      `HTTP ${status}`,
    );
  }
});

void test('a malformed successful body stays a retryable server failure', async () => {
  await assert.rejects(
    () =>
      request('/api/workspace', undefined, {
        session: 'x=1',
        fetchImpl: async () => new Response('not json', { status: 200 }),
      }),
    (e) => e instanceof RelayError && e.code === EXIT.server,
  );
});
