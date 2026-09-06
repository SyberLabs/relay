import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor } from '../lib/editor.ts';
import {
  beginMutation,
  beginRefresh,
  createWorkspaceSession,
  editorForJobs,
  mutationIsLive,
  processMutation,
  processRefresh,
} from '../lib/workspace-refresh.ts';

function job(id, extra = {}) {
  return {
    id,
    job_key: 'job-' + id,
    name: 'Example Co — Role',
    url: 'https://example.com/jobs/' + id,
    status: 'Held',
    blocker: '',
    draft: 'original',
    accepted_draft: null,
    version: 1,
    ...extra,
  };
}

function records(extra = {}) {
  return {
    jobs: [job('A')],
    sources: [
      {
        id: 's1',
        job_key: 'job-A',
        name: 'Example Co — Role',
        notes: 'Imported research notes for A.',
        status: 'Held',
        source_url: 'https://example.com/research/s1',
      },
    ],
    events: [
      {
        id: 'e1',
        job_id: 'A',
        kind: 'save',
        created: '2026-01-01T00:00:00.000Z',
        detail: '{"draft":"private"}',
      },
    ],
    ...extra,
  };
}

function http(status, body) {
  const state = { jsonCalls: 0 };
  return {
    status,
    ok: status >= 200 && status < 300,
    get jsonCalls() {
      return state.jsonCalls;
    },
    async json() {
      state.jsonCalls += 1;
      if (typeof body === 'string')
        throw new SyntaxError('Unexpected token U in JSON at position 0');
      return body;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

test('plain Unauthorized 401 expires without parsing JSON', async () => {
  const session = createWorkspaceSession();
  const started = beginRefresh(session.gate);
  const r = http(401, 'Unauthorized');
  const outcome = await processRefresh(session, started, r);
  assert.equal(outcome.type, 'expire');
  assert.equal(r.jsonCalls, 0);
  assert.equal(session.lastAck, undefined);
});

test('plain Unauthorized POST 401 expires without parsing JSON', async () => {
  const session = createWorkspaceSession();
  const started = beginMutation(session.gate);
  const r = http(401, 'Unauthorized');
  const outcome = await processMutation(session, started, r);
  assert.equal(outcome.type, 'expire');
  assert.equal(r.jsonCalls, 0);
});

test('older 401 while a newer refresh is in flight still expires the session', async () => {
  const session = createWorkspaceSession();
  const older = beginRefresh(session.gate);
  const newer = beginRefresh(session.gate);
  const outcome = await processRefresh(
    session,
    older,
    http(401, 'Unauthorized'),
  );
  assert.equal(outcome.type, 'expire');
  const late = await processRefresh(
    session,
    newer,
    http(200, records({ jobs: [job('leaked')] })),
  );
  assert.equal(late.type, 'ignore');
});

test('deferred pre-expiry preview 200 is ignored so run cannot apply it', async () => {
  const session = createWorkspaceSession();
  const mutation = beginMutation(session.gate);
  const refresh = beginRefresh(session.gate);
  await processRefresh(session, refresh, http(401, 'Unauthorized'));
  const preview = {
    new: 1,
    known: 0,
    submitted: 0,
    items: [{ name: 'Example Co — Role', kind: 'new', key: 'job-A' }],
  };
  const outcome = await processMutation(session, mutation, http(200, preview));
  assert.equal(outcome.type, 'ignore');
  assert.equal(mutationIsLive(session.gate, mutation), false);
});

test('deferred pre-expiry import 200 is ignored after expiry', async () => {
  const session = createWorkspaceSession();
  const mutation = beginMutation(session.gate);
  await processRefresh(
    session,
    beginRefresh(session.gate),
    http(401, { error: 'Sign in to open your workspace.' }),
  );
  const outcome = await processMutation(
    session,
    mutation,
    http(200, records()),
  );
  assert.equal(outcome.type, 'ignore');
});

test('newer then older 200 keeps the newer records', async () => {
  const session = createWorkspaceSession();
  const older = deferred();
  const newer = deferred();
  const olderStart = beginRefresh(session.gate);
  const olderDone = older.promise.then((r) =>
    processRefresh(session, olderStart, r),
  );
  const newerStart = beginRefresh(session.gate);
  const newerDone = newer.promise.then((r) =>
    processRefresh(session, newerStart, r),
  );
  newer.resolve(
    http(200, records({ jobs: [job('A', { version: 2, draft: 'v2 draft' })] })),
  );
  const newerOutcome = await newerDone;
  older.resolve(
    http(200, records({ jobs: [job('A', { version: 1, draft: 'v1 draft' })] })),
  );
  const olderOutcome = await olderDone;
  assert.equal(newerOutcome.type, 'records');
  assert.equal(newerOutcome.jobs[0].version, 2);
  assert.equal(olderOutcome.type, 'ignore');
});

test('edits typed while refreshes are in flight survive both orderings', async () => {
  const v1 = job('A');
  const v2 = job('A', { version: 2, draft: 'from server' });
  for (const order of ['newer-first', 'older-first']) {
    const session = createWorkspaceSession();
    let editor = loadEditor(v1);
    const older = deferred();
    const newer = deferred();
    const olderStart = beginRefresh(session.gate);
    const olderDone = older.promise.then((r) =>
      processRefresh(session, olderStart, r),
    );
    const newerStart = beginRefresh(session.gate);
    const newerDone = newer.promise.then((r) =>
      processRefresh(session, newerStart, r),
    );
    editor = { ...editor, draft: 'typed during refresh' };
    let jobs = [v1];
    async function apply(done) {
      const outcome = await done;
      if (outcome.type !== 'records') return;
      jobs = outcome.jobs;
      editor = editorForJobs(session, editor, outcome.jobs);
    }
    if (order === 'newer-first') {
      newer.resolve(http(200, records({ jobs: [v2] })));
      await apply(newerDone);
      older.resolve(http(200, records({ jobs: [v1] })));
      await apply(olderDone);
    } else {
      older.resolve(http(200, records({ jobs: [v1] })));
      await apply(olderDone);
      newer.resolve(http(200, records({ jobs: [v2] })));
      await apply(newerDone);
    }
    assert.equal(jobs[0].version, 2, order);
    assert.equal(editor.draft, 'typed during refresh', order);
    assert.equal(editor.conflict, true, order);
    assert.equal(editor.version, 1, order);
  }
});

test('own save ack survives a newer refresh that does not carry the snapshot', async () => {
  const original = job('A');
  const session = createWorkspaceSession();
  let editor = loadEditor(original);
  const saved = {
    jobId: editor.jobId,
    session: editor.session,
    version: editor.version,
    draft: 'intentionally saved',
    blocker: '',
  };
  editor = { ...editor, draft: 'typed during save' };
  const mutation = beginMutation(session.gate);
  const saveOutcome = await processMutation(
    session,
    mutation,
    http(200, { ok: true }),
    saved,
  );
  assert.equal(saveOutcome.type, 'ok');
  editor = { ...editor, draft: 'typed after save' };
  const olderRefresh = beginRefresh(session.gate);
  const newerRefresh = beginRefresh(session.gate);
  const v2 = job('A', { version: 2, draft: 'intentionally saved' });
  const newerOutcome = await processRefresh(
    session,
    newerRefresh,
    http(200, records({ jobs: [v2] })),
  );
  assert.equal(newerOutcome.type, 'records');
  editor = editorForJobs(session, editor, newerOutcome.jobs);
  const olderOutcome = await processRefresh(
    session,
    olderRefresh,
    http(200, records({ jobs: [v2] })),
  );
  assert.equal(olderOutcome.type, 'ignore');
  assert.equal(editor.draft, 'typed after save');
  assert.equal(editor.version, 2);
  assert.equal(editor.baseDraft, 'intentionally saved');
  assert.equal(editor.conflict, false);
  assert.equal(editor.session, saved.session);
});

test('external version bump without an own save still conflicts', async () => {
  const session = createWorkspaceSession();
  let editor = loadEditor(job('A'));
  editor = { ...editor, draft: 'unsaved local text' };
  const outcome = await processRefresh(
    session,
    beginRefresh(session.gate),
    http(
      200,
      records({ jobs: [job('A', { version: 2, draft: 'other writer' })] }),
    ),
  );
  editor = editorForJobs(session, editor, outcome.jobs);
  assert.equal(editor.draft, 'unsaved local text');
  assert.equal(editor.version, 1);
  assert.equal(editor.conflict, true);
});
