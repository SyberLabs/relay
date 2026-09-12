import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIVE_ACTOR,
  runFixtureSend,
  runOutcomeCopy,
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
  const calls = { fetch: [], fills: 0, wait: null, probes: [] };
  const io = {
    calls,
    pageOrigin: () => handlers.origin ?? 'http://127.0.0.1:4173',
    async probeFixture(destination) {
      calls.probes.push(destination);
      if (handlers.probeFixture) return handlers.probeFixture(destination);
      return { ok: true };
    },
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
    async fillOnce(fields, destination) {
      calls.fills += 1;
      calls.fillFields = fields;
      calls.fillDestination = destination;
      if (handlers.fillOnce) return handlers.fillOnce(fields, destination);
      return {
        submitted: true,
        receipt: 'Fictional receipt SEND-174',
        fills: 1,
      };
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
  if (
    body?.action === 'complete' ||
    body?.action === 'uncertain' ||
    body?.action === 'not-submitted'
  )
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

void test('wrong-host fixture never starts prepare or fill', async () => {
  const io = ioFrom({
    probeFixture() {
      return {
        ok: false,
        code: 'wrong_host',
        error: 'Fixture tab URL does not match the armed destination.',
      };
    },
    pageFetch() {
      throw new Error('must not call Relay before a fixture probe');
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.code, 'wrong_host');
  assert.equal(io.calls.fetch.length, 0);
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

void test('disconnect after authorize does not begin or fill', async () => {
  const controller = new AbortController();
  const io = ioFrom({
    pageFetch: successFetch,
    wait() {
      controller.abort();
      return { ...PIN, authorized: true };
    },
  });
  io.signal = controller.signal;
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.code, 'wait_aborted');
  assert.equal(
    io.calls.fetch.some((row) => row.body?.action === 'begin'),
    false,
  );
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

void test('missing inspect preparation_revision prepares with null', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (path === '/api/workspace' && !body)
        return reply(200, { viewer: 'owner-1' });
      if (path.startsWith('/api/applications?job=') && !body)
        return reply(200, { viewer: 'owner-1', job_id: JOB });
      if (body?.action === 'prepare') {
        assert.equal(body.preparation_revision, null);
        return reply(200, { preparation_revision: 'rev-2' });
      }
      return successFetch(path, body);
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, true);
  assert.equal(result.submitted, true);
});

void test('wrong-host after begin records not-submitted and does not write', async () => {
  const io = ioFrom({
    pageFetch: successFetch,
    fillOnce() {
      return {
        submitted: false,
        fills: 0,
        code: 'wrong_host',
        note: 'Fixture tab URL does not match the armed destination.',
      };
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.equal(result.fills, 0);
  assert.equal(result.code, 'wrong_host');
  assert.equal(
    io.calls.fetch.some((row) => row.body?.action === 'complete'),
    false,
  );
  const closed = io.calls.fetch.find(
    (row) => row.body?.action === 'not-submitted',
  );
  assert.match(closed.body.receipt, /does not match/);
});

void test('execute:true fills frozen fields once and completes with the receipt', async () => {
  const io = ioFrom({
    pageFetch: successFetch,
    fillOnce(fields, destination) {
      assert.deepEqual(fields, MANIFEST.fields);
      assert.equal(destination, DESTINATION);
      return {
        submitted: true,
        receipt: 'Fictional receipt SEND-174',
        fills: 1,
      };
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
        fills: 1,
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

void test('error after Submit records uncertain and never not-submitted', async () => {
  const io = ioFrom({
    pageFetch: successFetch,
    fillOnce() {
      return {
        submitted: false,
        receipt: null,
        fills: 1,
        uncertain: true,
        code: 'uncertain',
        note: 'No tab with id: 42',
      };
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, true);
  assert.equal(result.submitted, false);
  assert.equal(result.uncertain, true);
  assert.equal(
    io.calls.fetch.some((row) => row.body?.action === 'not-submitted'),
    false,
  );
  assert.equal(
    io.calls.fetch.some((row) => row.body?.action === 'complete'),
    false,
  );
  const uncertain = io.calls.fetch.filter(
    (row) => row.body?.action === 'uncertain',
  );
  assert.equal(uncertain.length, 1);
  assert.match(uncertain[0].body.receipt, /No tab with id: 42/);
});

void test('refused complete is not reported saved and is not retried', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (body?.action === 'complete')
        return reply(403, {
          error: 'Complete a verification check.',
          code: 'verification_required',
        });
      return successFetch(path, body);
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, true);
  assert.equal(result.recorded, false);
  assert.equal(result.code, 'recording_failed');
  assert.equal(result.receipt, 'Fictional receipt SEND-174');
  assert.equal(result.status, 403);
  assert.equal(
    io.calls.fetch.filter((row) => row.body?.action === 'complete').length,
    1,
  );
  assert.equal(
    io.calls.fetch.some((row) => row.body?.action === 'begin'),
    true,
  );
  const copy = runOutcomeCopy(result);
  assert.match(copy, /Fictional receipt SEND-174/);
  assert.match(copy, /Complete a verification check/);
  assert.match(copy, /Relay did not save/);
  assert.match(copy, /Do not submit again/);
});

void test('thrown complete keeps the observed receipt and is not retried', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (body?.action === 'complete') throw new Error('No tab with id: 7');
      return successFetch(path, body);
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.submitted, true);
  assert.equal(result.recorded, false);
  assert.equal(result.code, 'recording_failed');
  assert.equal(result.receipt, 'Fictional receipt SEND-174');
  assert.match(result.error, /No tab with id: 7/);
  assert.equal(io.calls.fills, 1);
  assert.equal(
    io.calls.fetch.filter((row) => row.body?.action === 'complete').length,
    1,
  );
  assert.equal(
    io.calls.fetch.filter((row) => row.body?.action === 'begin').length,
    1,
  );
  const copy = runOutcomeCopy(result);
  assert.match(copy, /Fictional receipt SEND-174/);
  assert.match(copy, /No tab with id: 7/);
  assert.match(copy, /Relay did not save/);
  assert.match(copy, /Do not submit again/);
});

void test('refused uncertain is not reported saved and is not retried', async () => {
  const io = ioFrom({
    pageFetch(path, body) {
      if (body?.action === 'uncertain')
        return reply(403, {
          error: 'Complete a verification check.',
          code: 'verification_required',
        });
      return successFetch(path, body);
    },
    fillOnce() {
      return {
        submitted: false,
        receipt: null,
        fills: 1,
        note: 'Fixture submit no-op; no confirmation heading. Do not submit again.',
      };
    },
  });
  const result = await runFixtureSend(io, input);
  assert.equal(result.ok, false);
  assert.equal(result.uncertain, true);
  assert.equal(result.recorded, false);
  assert.equal(result.code, 'recording_failed');
  assert.match(result.receipt, /Do not submit again/);
  assert.equal(
    io.calls.fetch.filter((row) => row.body?.action === 'uncertain').length,
    1,
  );
  const copy = runOutcomeCopy(result);
  assert.match(copy, /no confirmation heading/);
  assert.match(copy, /Complete a verification check/);
  assert.match(copy, /Relay did not save/);
  assert.match(copy, /Do not submit again/);
});
