import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIVE_ACTOR,
  runFixtureSend,
} from '../extensions/operative/handshake.js';

const JOB = 'job-fictional-1';
const DESTINATION = 'https://employer.example/jobs/operative';
const FIELDS = [{ label: 'Full name', value: 'Avery Example', unknown: false }];
const PIN = {
  viewer: 'owner-1',
  job: JOB,
  preparation_revision: 'rev-2',
  id: 'op-1',
  digest: 'd'.repeat(64),
  state: 'authorized',
  authorized: true,
};
const MANIFEST = {
  destination: DESTINATION,
  fields: [{ label: 'Full name', value: 'Avery Example' }],
  files: [],
};

function reply(status, json) {
  return { ok: status >= 200 && status < 300, status, json };
}

function ioFrom(handlers) {
  const calls = { fetch: [], fills: 0, wait: null };
  const io = {
    calls,
    pageOrigin: () => handlers.origin ?? 'http://127.0.0.1:4173',
    async pageFetch(path, body) {
      calls.fetch.push({ path, body: body ?? null });
      const result = await handlers.pageFetch(path, body ?? null, calls);
      return result;
    },
    async wait(pin) {
      calls.wait = pin;
      if (handlers.wait) return handlers.wait(pin);
      return { ...PIN, ...pin, authorized: true };
    },
    async fillOnce(fields) {
      calls.fills += 1;
      calls.fillFields = fields;
      if (handlers.fillOnce) return handlers.fillOnce(fields);
      return { submitted: true, receipt: 'Fictional receipt SEND-174' };
    },
  };
  return io;
}

function successFetch(path, body) {
  if (path === '/api/workspace' && !body)
    return reply(200, { viewer: 'owner-1' });
  if (path.startsWith('/api/applications?job=') && !body)
    return reply(200, {
      viewer: 'owner-1',
      preparation_revision: 'rev-1',
      job_id: JOB,
    });
  if (body?.action === 'prepare')
    return reply(200, { preparation_revision: 'rev-2' });
  if (body?.action === 'arm')
    return reply(200, {
      preparation_revision: 'rev-2',
      operation_id: 'op-1',
      digest: PIN.digest,
    });
  if (body?.action === 'begin')
    return reply(200, {
      execute: true,
      operation: {
        id: 'op-1',
        digest: PIN.digest,
        manifest: JSON.stringify(MANIFEST),
        state: 'executing',
      },
    });
  if (body?.action === 'complete' || body?.action === 'uncertain')
    return reply(200, { ok: true });
  throw new Error(`unexpected fetch ${path} ${JSON.stringify(body)}`);
}

const input = {
  job: JOB,
  destination: DESTINATION,
  fields: FIELDS,
  files: [],
  actor: OPERATIVE_ACTOR,
  operationId: 'op-1',
};

void test('extension origin never fetches Relay APIs or fills', async () => {
  const io = ioFrom({
    origin: 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef',
    pageFetch() {
      throw new Error('must not fetch from the extension origin');
    },
    fillOnce() {
      throw new Error('must not fill from the extension origin');
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.status, 403);
  assert.equal(result.code, 'extension_origin');
  assert.equal(io.calls.fetch.length, 0);
  assert.equal(io.calls.fills, 0);
});

void test('unauthenticated workspace GET does not fill', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (path === '/api/workspace' && !body)
        return reply(401, { error: 'Sign in first.' });
      throw new Error('must stop after unauthenticated workspace');
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.status, 401);
  assert.equal(result.code, 'unauthenticated');
  assert.equal(io.calls.fills, 0);
});

void test('other-owner inspect 404 does not prepare or fill', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (path === '/api/workspace' && !body)
        return reply(200, { viewer: 'owner-1' });
      if (path.startsWith('/api/applications?job=') && !body)
        return reply(404, {
          viewer: 'owner-1',
          error: 'A selected job is unavailable.',
        });
      throw new Error('must not continue after missing job');
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.status, 404);
  assert.equal(result.code, 'job_unavailable');
  assert.equal(io.calls.fills, 0);
});

void test('unknown fields refuse before prepare and do not fill', async () => {
  const io = ioFrom({
    pageFetch() {
      throw new Error('must not call Relay with unknown fields');
    },
  });
  const result = await runFixtureSend(io, {
    ...input,
    fields: [{ label: 'Full name', value: '', unknown: true }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.code, 'incomplete_fields');
  assert.equal(io.calls.fetch.length, 0);
});

void test('wait abort after arm does not begin or fill', async () => {
  const io = ioFrom({
    pageFetch: successFetch,
    wait() {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      throw error;
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.code, 'wait_aborted');
  assert.equal(
    io.calls.fetch.some((row) => row.body?.action === 'begin'),
    false,
  );
  assert.equal(io.calls.fills, 0);
});

void test('begin without execute:true does not fill', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (body?.action === 'begin')
        return reply(200, {
          execute: false,
          operation: { state: 'authorized' },
        });
      return successFetch(path, body);
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.code, 'no_permit');
});

void test('second begin while executing does not fill', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (body?.action === 'begin')
        return reply(409, { error: 'Application is already executing.' });
      return successFetch(path, body);
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.status, 409);
  assert.equal(result.code, 'executing');
});

void test('execute:true fills frozen fields once and completes with the receipt', async () => {
  const io = ioFrom({
    pageFetch: successFetch,
    fillOnce(fields) {
      assert.deepEqual(fields, MANIFEST.fields);
      return { submitted: true, receipt: 'Fictional receipt SEND-174' };
    },
  });
  const result = await runFixtureSend(io, {
    ...input,
    fields: [{ label: 'Full name', value: 'Stale Example', unknown: false }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.submitted, true);
  assert.equal(result.fills, 1);
  assert.equal(result.receipt, 'Fictional receipt SEND-174');
  assert.equal(io.calls.fills, 1);
  const complete = io.calls.fetch.find(
    (row) => row.body?.action === 'complete',
  );
  assert.equal(complete.body.receipt, 'Fictional receipt SEND-174');
  assert.equal(complete.body.id, 'op-1');
  assert.equal(
    io.calls.fetch.filter((row) => row.body?.action === 'begin').length,
    1,
  );
});

void test('fixture no-op records uncertain and does not fill again', async () => {
  const io = ioFrom({
    pageFetch: successFetch,
    fillOnce() {
      return {
        submitted: false,
        receipt: null,
        note: 'Fixture submit no-op; no confirmation heading. Do not submit again.',
      };
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, true);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 1);
  assert.equal(result.uncertain, true);
  assert.equal(io.calls.fills, 1);
  assert.equal(
    io.calls.fetch.some((row) => row.body?.action === 'complete'),
    false,
  );
  const uncertain = io.calls.fetch.find(
    (row) => row.body?.action === 'uncertain',
  );
  assert.match(uncertain.body.receipt, /Do not submit again/);
});
