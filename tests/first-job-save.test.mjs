import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { jobKey } from '../lib/domain.ts';
import { editorIsDirty, loadEditor } from '../lib/editor.ts';
import { firstJobShouldSelectSaved } from '../lib/first-job.ts';
import * as helper from '../lib/workspace-refresh.ts';

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

function compileSaveFirstJob(deps) {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const compile = (s) =>
    stripTypeScriptTypes(s, { mode: 'transform' }).trim().replace(/;$/, '');
  const expiry = src.match(
    /const applyExpired = useCallback\(([\s\S]*?), \[\]\);/,
  )[1];
  const refreshSrc = src.match(
    /const refresh = useCallback\(([\s\S]*?),\s*\[applyExpired(?:,[^\]]*)?\],\s*\);/,
  )[1];
  const saveSrc = src.slice(
    src.indexOf('async function saveFirstJob'),
    src.indexOf('\n  const connections ='),
  );
  const bind = (source) =>
    // oxlint-disable-next-line typescript/no-implied-eval -- compile actual Workspace callbacks
    new Function(...Object.keys(deps), 'return (' + compile(source) + ');')(
      ...Object.values(deps),
    );
  deps.applyExpired = bind(expiry);
  deps.refresh = bind(refreshSrc);
  // oxlint-disable-next-line typescript/no-implied-eval -- compile actual Workspace callbacks
  return new Function(
    ...Object.keys(deps),
    compile(saveSrc) + ';return saveFirstJob',
  )(...Object.values(deps));
}

function baseDeps(state, session, fetcher) {
  const deps = {
    ...helper,
    jobKey,
    editorIsDirty,
    loadEditor,
    firstJobShouldSelectSaved,
    discardUnsaved: () => true,
    fetch: fetcher,
    sessionRef: { current: session },
    selectedRef: { current: state.selected },
    editorRef: { current: state.editor },
    addJobViewerRef: { current: session.viewer },
    loadJobHistory: async (id) => {
      state.historyId = id;
    },
  };
  for (const key of [
    'jobs',
    'sources',
    'events',
    'facts',
    'editor',
    'importText',
    'previewedImport',
    'report',
    'showImport',
    'showAddJob',
    'signedOut',
    'loaded',
    'busy',
    'message',
    'historyNext',
    'filter',
  ]) {
    deps['set' + key[0].toUpperCase() + key.slice(1)] = (value) => {
      if (typeof value === 'function') {
        const previous = state[key];
        value(previous);
        state[key] = value(previous);
      } else {
        state[key] = value;
      }
      if (key === 'editor') deps.editorRef.current = state.editor;
    };
  }
  Object.defineProperty(deps, 'editor', {
    enumerable: true,
    get() {
      return state.editor;
    },
  });
  return deps;
}

const existing = {
  id: 'existing',
  job_key: 'https://example.com/jobs/existing',
  name: 'Cedar Example — Existing Role',
  url: 'https://example.com/jobs/existing',
  status: 'Held',
  blocker: '',
  draft: '',
  accepted_draft: null,
  version: 1,
};

const added = {
  id: 'added',
  job_key: 'https://example.com/jobs/added',
  name: 'Willow Example — Added Role',
  url: 'https://example.com/jobs/added',
  status: 'Held',
  blocker: '',
  draft: '',
  accepted_draft: null,
  version: 1,
};

void test('delayed add-job response keeps in-flight edits and still adds the job', async () => {
  const session = helper.createWorkspaceSession();
  session.viewer = 'owner-a';
  const editor = loadEditor(existing);
  const state = {
    jobs: [existing],
    sources: [],
    events: [],
    facts: [],
    editor,
    selected: existing.id,
    showAddJob: true,
    filter: 'Held',
    signedOut: false,
    loaded: true,
    busy: false,
    message: '',
  };
  const post = deferred();
  let gets = 0;
  let imported = false;
  const deps = baseDeps(state, session, async (_url, init) => {
    if (init?.method === 'POST') {
      const response = await post.promise;
      imported = true;
      return response;
    }
    gets += 1;
    return new Response(
      JSON.stringify({
        viewer: 'owner-a',
        jobs: imported ? [existing, added] : [existing],
        sources: [],
        events: [],
        facts: [],
      }),
      { status: 200 },
    );
  });
  deps.selectedRef.current = existing.id;
  const saveFirstJob = compileSaveFirstJob(deps);
  const pending = saveFirstJob({
    url: 'first-job:https://example.com/jobs/added',
    Name: added.name,
    Job: added.url,
    Status: 'Held',
    Notes: 'Fictional added notes.',
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  state.editor = {
    ...state.editor,
    draft: 'Typed while add-job was in flight.',
  };
  deps.editorRef.current = state.editor;
  post.resolve(
    new Response(
      JSON.stringify({
        items: [{ name: added.name, kind: 'new', key: added.job_key }],
      }),
      { status: 200 },
    ),
  );
  await pending;
  assert.equal(state.editor.draft, 'Typed while add-job was in flight.');
  assert.equal(state.editor.jobId, existing.id);
  assert.equal(deps.selectedRef.current, existing.id);
  assert.equal(
    state.jobs.some((job) => job.id === added.id),
    true,
  );
  assert.equal(state.showAddJob, false);
  assert.equal(gets > 0, true);
});

void test('same-account add-job still selects the saved record when the editor is unchanged', async () => {
  const session = helper.createWorkspaceSession();
  session.viewer = 'owner-a';
  const editor = loadEditor(existing);
  const state = {
    jobs: [existing],
    sources: [],
    events: [],
    facts: [],
    editor,
    selected: existing.id,
    showAddJob: true,
    filter: 'Held',
    signedOut: false,
    loaded: true,
    busy: false,
    message: '',
    historyId: null,
  };
  let imported = false;
  const deps = baseDeps(state, session, async (_url, init) => {
    if (init?.method === 'POST') {
      imported = true;
      return new Response(
        JSON.stringify({
          items: [{ name: added.name, kind: 'new', key: added.job_key }],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        viewer: 'owner-a',
        jobs: imported ? [existing, added] : [existing],
        sources: [],
        events: [],
        facts: [],
      }),
      { status: 200 },
    );
  });
  deps.selectedRef.current = existing.id;
  const saveFirstJob = compileSaveFirstJob(deps);
  await saveFirstJob({
    url: 'first-job:https://example.com/jobs/added',
    Name: added.name,
    Job: added.url,
    Status: 'Held',
    Notes: '',
  });
  assert.equal(deps.selectedRef.current, added.id);
  assert.equal(state.editor.jobId, added.id);
  assert.equal(state.historyId, added.id);
  assert.match(state.message, /selected record/);
});

void test('a pending add-job response after viewer change does not restore private fields', async () => {
  const session = helper.createWorkspaceSession();
  session.viewer = 'owner-a';
  const ownerAJob = {
    id: 'owner-a-job',
    job_key: 'https://example.com/jobs/owner-a-private',
    name: 'Owner A private title',
    url: 'https://example.com/jobs/owner-a-private',
    status: 'Held',
    blocker: '',
    draft: '',
    accepted_draft: null,
    version: 1,
  };
  const ownerB = {
    id: 'owner-b-job',
    job_key: 'https://example.com/jobs/owner-b',
    name: 'Maple Example — Owner B',
    url: 'https://example.com/jobs/owner-b',
    status: 'Held',
    blocker: '',
    draft: 'Owner B selected draft.',
    accepted_draft: null,
    version: 1,
  };
  const editor = loadEditor(existing);
  const state = {
    jobs: [existing],
    sources: [],
    events: [],
    facts: [],
    editor,
    selected: existing.id,
    showAddJob: true,
    importText: '',
    filter: 'Held',
    signedOut: false,
    loaded: true,
    busy: false,
    message: '',
  };
  const post = deferred();
  let account = 'owner-a';
  const deps = baseDeps(state, session, async (_url, init) => {
    if (init?.method === 'POST') return post.promise;
    if (account === 'owner-a') {
      return new Response(
        JSON.stringify({
          viewer: 'owner-a',
          jobs: [existing],
          sources: [],
          events: [],
          facts: [],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        viewer: 'owner-b',
        jobs: [ownerB, ownerAJob],
        sources: [],
        events: [],
        facts: [],
      }),
      { status: 200 },
    );
  });
  deps.selectedRef.current = existing.id;
  deps.addJobViewerRef.current = 'owner-a';
  const saveFirstJob = compileSaveFirstJob(deps);
  const pending = saveFirstJob({
    url: 'first-job:https://example.com/jobs/owner-a-private',
    Name: 'Owner A private title',
    Job: 'https://example.com/jobs/owner-a-private',
    Status: 'Held',
    Notes: 'Owner A private notes.',
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const ownerBEditor = loadEditor(ownerB);
  state.editor = ownerBEditor;
  deps.editorRef.current = ownerBEditor;
  deps.selectedRef.current = ownerB.id;
  account = 'owner-b';
  await deps.refresh();
  post.resolve(
    new Response(
      JSON.stringify({
        items: [
          {
            name: 'Owner A private title',
            kind: 'new',
            key: 'https://example.com/jobs/owner-a-private',
          },
        ],
      }),
      { status: 200 },
    ),
  );
  await pending;
  assert.equal(state.showAddJob, false);
  assert.equal(state.signedOut, false);
  assert.equal(deps.selectedRef.current, ownerB.id);
  assert.equal(state.editor?.jobId, ownerB.id);
  assert.equal(state.editor?.draft, 'Owner B selected draft.');
});

void test('saving add-job after the viewer changes does not POST the previous form', async () => {
  const session = helper.createWorkspaceSession();
  session.viewer = 'owner-a';
  const ownerB = {
    id: 'owner-b-job',
    job_key: 'https://example.com/jobs/owner-b',
    name: 'Maple Example — Owner B',
    url: 'https://example.com/jobs/owner-b',
    status: 'Held',
    blocker: '',
    draft: 'Owner B selected draft.',
    accepted_draft: null,
    version: 1,
  };
  const state = {
    jobs: [ownerB],
    sources: [],
    events: [],
    facts: [],
    editor: loadEditor(ownerB),
    selected: ownerB.id,
    showAddJob: true,
    importText: '',
    filter: 'Held',
    signedOut: false,
    loaded: true,
    busy: false,
    message: '',
  };
  let posts = 0;
  const deps = baseDeps(state, session, async (_url, init) => {
    if (init?.method === 'POST') {
      posts += 1;
      return new Response(
        JSON.stringify({
          items: [{ name: 'Owner A private title', kind: 'new' }],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        viewer: 'owner-b',
        jobs: [ownerB],
        sources: [],
        events: [],
        facts: [],
      }),
      { status: 200 },
    );
  });
  deps.selectedRef.current = ownerB.id;
  deps.addJobViewerRef.current = 'owner-a';
  const saveFirstJob = compileSaveFirstJob(deps);
  await saveFirstJob({
    url: 'first-job:https://example.com/jobs/owner-a-private',
    Name: 'Owner A private title',
    Job: 'https://example.com/jobs/owner-a-private',
    Status: 'Held',
    Notes: 'Owner A private notes.',
  });
  assert.equal(posts, 0);
  assert.equal(state.showAddJob, false);
  assert.equal(deps.selectedRef.current, ownerB.id);
  assert.equal(state.editor?.draft, 'Owner B selected draft.');
});

void test('pending add-job 200 after expiry does not restore private fields', async () => {
  const session = helper.createWorkspaceSession();
  session.viewer = 'owner-a';
  const editor = loadEditor(existing);
  const state = {
    jobs: [existing],
    sources: [],
    events: [],
    facts: [],
    editor,
    selected: existing.id,
    showAddJob: true,
    importText: 'Owner A private import text.',
    signedOut: false,
    loaded: true,
    busy: false,
    message: '',
  };
  const post = deferred();
  const deps = baseDeps(state, session, async (_url, init) => {
    if (init?.method === 'POST') return post.promise;
    return new Response(
      JSON.stringify({
        viewer: 'owner-a',
        jobs: [existing],
        sources: [],
        events: [],
        facts: [],
      }),
      { status: 200 },
    );
  });
  deps.selectedRef.current = existing.id;
  deps.addJobViewerRef.current = 'owner-a';
  const saveFirstJob = compileSaveFirstJob(deps);
  const pending = saveFirstJob({
    url: 'first-job:https://example.com/jobs/owner-a-private',
    Name: 'Owner A private title',
    Job: 'https://example.com/jobs/owner-a-private',
    Status: 'Held',
    Notes: 'Owner A private notes.',
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  helper.expireSession(session);
  deps.applyExpired();
  post.resolve(
    new Response(
      JSON.stringify({
        items: [
          {
            name: 'Owner A private title',
            kind: 'new',
            key: 'https://example.com/jobs/owner-a-private',
          },
        ],
      }),
      { status: 200 },
    ),
  );
  await pending;
  assert.equal(state.signedOut, true);
  assert.equal(state.showAddJob, false);
  assert.equal(state.editor, null);
  assert.deepEqual(state.jobs, []);
  assert.equal(state.importText, '');
});
