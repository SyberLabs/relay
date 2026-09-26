import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import * as helper from '../lib/workspace-refresh.ts';
import { defaultDraftingPreference } from '../lib/drafting-decision.ts';
import { readWorkspaceRuntimeSource } from './workspace-ui-source.mjs';

function compile(text) {
  return stripTypeScriptTypes(text, { mode: 'transform' })
    .trim()
    .replace(/;$/, '');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function bind(text, deps) {
  // oxlint-disable-next-line typescript/no-implied-eval -- compile actual Workspace callbacks
  return new Function(...Object.keys(deps), 'return (' + compile(text) + ');')(
    ...Object.values(deps),
  );
}

function useCallbackBody(src, name) {
  const token = `const ${name} = useCallback(`;
  const start = src.indexOf(token);
  assert.notEqual(start, -1, token);
  const after = start + token.length;
  const end = src.indexOf('\n  }, [', after);
  assert.notEqual(end, -1, name + ' end');
  return src.slice(after, end) + '\n  }';
}

function expireKeys(state, deps) {
  for (const key of [
    'jobs',
    'sources',
    'events',
    'facts',
    'draftingPreference',
    'editor',
    'importText',
    'previewedImport',
    'report',
    'showImport',
    'showAddJob',
    'handoffOpen',
    'signedOut',
    'loaded',
    'message',
    'historyNext',
    'styleCount',
    'modal',
    'historyOpen',
  ]) {
    deps['set' + key[0].toUpperCase() + key.slice(1)] = (value) => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
    };
  }
}

void test('profile context waits until the workspace has an owner', async () => {
  const src = readWorkspaceRuntimeSource();
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  let fetches = 0;
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async () => {
      fetches += 1;
      return { status: 200, ok: true, json: async () => ({}) };
    },
    sessionRef: { current: session },
    selectedRef: { current: '' },
    refreshRef: { current: async () => {} },
    applyExpired: () => {
      throw Error('must not expire');
    },
  };
  const loadRuntimeContext = bind(loadSrc, deps);
  await loadRuntimeContext();
  assert.equal(fetches, 0);
});

void test('profile 401 expires the workspace without parsing response data', async () => {
  const src = readWorkspaceRuntimeSource();
  const expiry = useCallbackBody(src, 'applyExpired');
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  let jsonCalls = 0;
  let requested = '';
  const state = {
    jobs: [{ id: 'job-a', draft: 'Private draft.' }],
    facts: [{ claim: 'Private fact.' }],
    importText: 'Private import.',
    styleCount: 2,
    signedOut: false,
    modal: 'tools',
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async (url) => {
      requested = String(url);
      return {
        status: 401,
        ok: false,
        json: async () => {
          jsonCalls += 1;
          throw Error('401 response must not be parsed');
        },
      };
    },
    sessionRef: { current: session },
    selectedRef: { current: 'job-a' },
    refreshRef: { current: async () => {} },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  await bind(loadSrc, deps)();
  assert.equal(requested, '/api/profile');
  assert.equal(jsonCalls, 0);
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.jobs, []);
  assert.deepEqual(state.facts, []);
  assert.equal(state.importText, '');
  assert.equal(state.styleCount, 0);
  assert.equal(state.modal, null);
});

void test('profile response from another viewer clears prior workspace data', async () => {
  const src = readWorkspaceRuntimeSource();
  const expiry = useCallbackBody(src, 'applyExpired');
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const state = {
    jobs: [{ id: 'job-a', draft: 'Owner A private draft.' }],
    facts: [{ claim: 'Owner A private fact.' }],
    importText: 'Owner A private import.',
    styleCount: 4,
    signedOut: false,
    loaded: true,
    modal: 'tools',
    message: 'Owner A notice',
  };
  let reloads = 0;
  let requested = '';
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async (url) => {
      requested = String(url);
      return {
        status: 200,
        ok: true,
        json: async () => ({
          viewer: 'owner-b',
          rules: [{ id: 'rule-b' }],
        }),
      };
    },
    sessionRef: { current: session },
    selectedRef: { current: 'job-a' },
    refreshRef: {
      current: async () => {
        reloads += 1;
      },
    },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  await bind(loadSrc, deps)();
  assert.equal(requested, '/api/profile');
  assert.equal(session.viewer, 'owner-b');
  assert.equal(state.signedOut, false);
  assert.deepEqual(state.jobs, []);
  assert.deepEqual(state.facts, []);
  assert.equal(state.importText, '');
  assert.equal(state.modal, null);
  assert.equal(state.message, '');
  assert.equal(state.styleCount, 1);
  assert.equal(deps.selectedRef.current, '');
  assert.equal(reloads, 1);
});

void test('workspace viewer switch clears private state before loading the new owner', async () => {
  const src = readWorkspaceRuntimeSource();
  const expiry = useCallbackBody(src, 'applyExpired');
  const refreshSrc = src.match(
    /const refresh = useCallback\(([\s\S]*?),\s*\[applyExpired(?:,[^\]]*)?\],\s*\);/,
  )[1];
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const context = deferred();
  const state = {
    jobs: [{ id: 'job-a', name: 'Owner A private role' }],
    modal: 'resume',
    signedOut: false,
    loaded: true,
    showAddJob: true,
    importText: 'Owner A research paste.',
    styleCount: 4,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        viewer: 'owner-b',
        jobs: [{ id: 'job-b', name: 'Owner B role' }],
        sources: [],
        events: [],
        facts: [],
      }),
    }),
    sessionRef: { current: session },
    selectedRef: { current: 'job-a' },
    loadJobHistory: async () => {},
    loadRuntimeContext: async () => context.promise,
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  await bind(refreshSrc, deps)();
  assert.equal(session.viewer, 'owner-b');
  assert.equal(state.modal, null);
  assert.equal(state.styleCount, 0);
  assert.equal(state.signedOut, false);
  assert.equal(state.jobs[0].id, 'job-b');
  assert.equal(state.showAddJob, false);
  context.resolve();
});
