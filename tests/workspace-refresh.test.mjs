import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEditor } from '../lib/editor.ts';
import { expireWorkspace, receiveRefresh } from '../lib/workspace-refresh.ts';

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

function source(id, extra = {}) {
  return {
    id,
    job_key: 'job-A',
    name: 'Example Co — Role',
    notes: 'Imported research notes for A.',
    status: 'Held',
    source_url: 'https://example.com/research/' + id,
    ...extra,
  };
}

function event(id, extra = {}) {
  return {
    id,
    job_id: 'A',
    kind: 'save',
    created: '2026-01-01T00:00:00.000Z',
    detail: '{"draft":"private"}',
    ...extra,
  };
}

function privateWorkspace(extra = {}) {
  const record = job('A');
  return {
    jobs: [record],
    sources: [source('s1')],
    events: [event('e1')],
    editor: loadEditor(record),
    importText: '[{"Name":"secret import"}]',
    previewedImport: '[{"Name":"secret import"}]',
    report: {
      new: 1,
      known: 0,
      submitted: 0,
      items: [{ name: 'Example Co — Role', kind: 'new', key: 'job-A' }],
    },
    showImport: true,
    signedOut: false,
    loaded: true,
    ...extra,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

function session(initial = privateWorkspace()) {
  const seq = { current: 0 };
  let workspace = initial;
  return {
    get: () => workspace,
    type(draft) {
      workspace = {
        ...workspace,
        editor: workspace.editor
          ? { ...workspace.editor, draft }
          : workspace.editor,
      };
    },
    refresh(responsePromise, saved) {
      const ticket = ++seq.current;
      return Promise.resolve(responsePromise).then((response) => {
        workspace = receiveRefresh(ticket, seq, workspace, response, saved);
      });
    },
    expire() {
      workspace = expireWorkspace(seq);
    },
  };
}

function ok(records) {
  return {
    status: 200,
    jobs: records.jobs,
    sources: records.sources,
    events: records.events,
  };
}

test('401 clears jobs, sources, events, editor and import state', async () => {
  const ws = session();
  await ws.refresh({ status: 401 });
  const view = ws.get();
  assert.equal(view.signedOut, true);
  assert.equal(view.loaded, true);
  assert.deepEqual(view.jobs, []);
  assert.deepEqual(view.sources, []);
  assert.deepEqual(view.events, []);
  assert.equal(view.editor, null);
  assert.equal(view.importText, '');
  assert.equal(view.previewedImport, '');
  assert.equal(view.report, null);
  assert.equal(view.showImport, false);
});

test('older 200 cannot restore private records after a newer 401', async () => {
  const ws = session();
  const older = deferred();
  const newer = deferred();
  const pendingOlder = ws.refresh(older.promise);
  const pendingNewer = ws.refresh(newer.promise);
  newer.resolve({ status: 401 });
  await pendingNewer;
  assert.equal(ws.get().signedOut, true);
  assert.equal(ws.get().jobs.length, 0);
  older.resolve(
    ok({
      jobs: [job('leaked')],
      sources: [source('leaked')],
      events: [event('leaked')],
    }),
  );
  await pendingOlder;
  assert.equal(ws.get().signedOut, true);
  assert.deepEqual(ws.get().jobs, []);
  assert.deepEqual(ws.get().sources, []);
  assert.deepEqual(ws.get().events, []);
  assert.equal(ws.get().editor, null);
  assert.equal(ws.get().importText, '');
});

test('expiry invalidates an in-flight refresh so a deferred 200 cannot restore records', async () => {
  const ws = session();
  const inFlight = deferred();
  const pending = ws.refresh(inFlight.promise);
  ws.expire();
  assert.equal(ws.get().signedOut, true);
  assert.deepEqual(ws.get().jobs, []);
  inFlight.resolve(
    ok({
      jobs: [job('leaked')],
      sources: [source('leaked')],
      events: [event('leaked')],
    }),
  );
  await pending;
  assert.equal(ws.get().signedOut, true);
  assert.deepEqual(ws.get().jobs, []);
  assert.deepEqual(ws.get().sources, []);
  assert.deepEqual(ws.get().events, []);
  assert.equal(ws.get().editor, null);
  assert.equal(ws.get().importText, '');
});

test('newer then older 200 keeps newer records and editor version', async () => {
  const olderJob = job('A', { version: 1, draft: 'v1 draft' });
  const newerJob = job('A', { version: 2, draft: 'v2 draft' });
  const ws = session(
    privateWorkspace({
      jobs: [olderJob],
      editor: loadEditor(olderJob),
      importText: '',
      previewedImport: '',
      report: null,
      showImport: false,
    }),
  );
  const older = deferred();
  const newer = deferred();
  const pendingOlder = ws.refresh(
    older.promise.then(() =>
      ok({
        jobs: [olderJob],
        sources: [source('old')],
        events: [event('old')],
      }),
    ),
  );
  const pendingNewer = ws.refresh(
    newer.promise.then(() =>
      ok({
        jobs: [newerJob],
        sources: [source('new')],
        events: [event('new')],
      }),
    ),
  );
  newer.resolve();
  await pendingNewer;
  older.resolve();
  await pendingOlder;
  assert.equal(ws.get().jobs[0].version, 2);
  assert.equal(ws.get().jobs[0].draft, 'v2 draft');
  assert.equal(ws.get().sources[0].id, 'new');
  assert.equal(ws.get().events[0].id, 'new');
  assert.equal(ws.get().editor.version, 2);
  assert.equal(ws.get().editor.draft, 'v2 draft');
  assert.equal(ws.get().editor.conflict, false);
});

test('older then newer 200 still lands the newer records', async () => {
  const olderJob = job('A', { version: 1, draft: 'v1 draft' });
  const newerJob = job('A', { version: 2, draft: 'v2 draft' });
  const ws = session(
    privateWorkspace({
      jobs: [olderJob],
      editor: loadEditor(olderJob),
    }),
  );
  const older = deferred();
  const newer = deferred();
  const pendingOlder = ws.refresh(
    older.promise.then(() =>
      ok({
        jobs: [olderJob],
        sources: [source('old')],
        events: [event('old')],
      }),
    ),
  );
  const pendingNewer = ws.refresh(
    newer.promise.then(() =>
      ok({
        jobs: [newerJob],
        sources: [source('new')],
        events: [event('new')],
      }),
    ),
  );
  older.resolve();
  await pendingOlder;
  newer.resolve();
  await pendingNewer;
  assert.equal(ws.get().jobs[0].version, 2);
  assert.equal(ws.get().editor.version, 2);
  assert.equal(ws.get().editor.draft, 'v2 draft');
});

test('edits typed while refreshes are in flight survive both response orderings', async () => {
  const v1 = job('A', { version: 1, draft: 'original' });
  const v2 = job('A', { version: 2, draft: 'from server' });
  for (const order of ['newer-first', 'older-first']) {
    const ws = session(
      privateWorkspace({
        jobs: [v1],
        editor: loadEditor(v1),
        importText: '',
        previewedImport: '',
        report: null,
        showImport: false,
      }),
    );
    const older = deferred();
    const newer = deferred();
    const pendingOlder = ws.refresh(
      older.promise.then(() =>
        ok({ jobs: [v1], sources: [source('old')], events: [] }),
      ),
    );
    const pendingNewer = ws.refresh(
      newer.promise.then(() =>
        ok({ jobs: [v2], sources: [source('new')], events: [] }),
      ),
    );
    ws.type('typed during refresh');
    if (order === 'newer-first') {
      newer.resolve();
      await pendingNewer;
      older.resolve();
      await pendingOlder;
    } else {
      older.resolve();
      await pendingOlder;
      newer.resolve();
      await pendingNewer;
    }
    assert.equal(ws.get().jobs[0].version, 2, order);
    assert.equal(ws.get().jobs[0].draft, 'from server', order);
    assert.equal(ws.get().editor.draft, 'typed during refresh', order);
    assert.equal(ws.get().editor.conflict, true, order);
    assert.equal(ws.get().editor.version, 1, order);
  }
});

test('workspace refresh callback uses the same expiry and ordering helpers', () => {
  const src = readFileSync(
    new URL('../app/workspace.tsx', import.meta.url),
    'utf8',
  );
  assert.match(src, /from '\.\.\/lib\/workspace-refresh'/);
  assert.match(src, /expireWorkspace/);
  assert.match(src, /editorAfterRefresh/);
  assert.match(src, /ticket !== refreshSeq\.current/);
  assert.match(src, /r\.status === 401/);
});

test('save acknowledgement during refresh keeps in-flight typing on the saved session', async () => {
  const original = job('A');
  let editor = loadEditor(original);
  const saved = {
    jobId: editor.jobId,
    session: editor.session,
    version: editor.version,
    draft: 'intentionally saved',
    blocker: '',
  };
  editor = { ...editor, draft: 'typed during save' };
  const ws = session(
    privateWorkspace({
      jobs: [original],
      editor,
      importText: '',
      previewedImport: '',
      report: null,
      showImport: false,
    }),
  );
  await ws.refresh(
    ok({
      jobs: [job('A', { version: 2, draft: 'intentionally saved' })],
      sources: [],
      events: [],
    }),
    saved,
  );
  assert.equal(ws.get().editor.draft, 'typed during save');
  assert.equal(ws.get().editor.version, 2);
  assert.equal(ws.get().editor.baseDraft, 'intentionally saved');
  assert.equal(ws.get().editor.conflict, false);
  assert.equal(ws.get().editor.session, saved.session);
});
