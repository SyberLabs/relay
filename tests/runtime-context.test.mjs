import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as helper from '../lib/workspace-refresh.ts';
import { defaultDraftingPreference } from '../lib/drafting-decision.ts';
import { isTerminal } from '../lib/outcomes.ts';
import { boundedPolicyMaximum, policyExpiryIso } from '../lib/runtime.ts';

function compile(text) {
  return stripTypeScriptTypes(text, { mode: 'transform' })
    .trim()
    .replace(/;$/, '');
}

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
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
    'busy',
    'message',
    'historyNext',
    'policy',
    'autopilot',
    'styleCount',
    'modal',
  ]) {
    deps['set' + key[0].toUpperCase() + key.slice(1)] = (value) => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
    };
  }
}

void test('policy and profile 401s expire before JSON and delayed 200s cannot restore counts', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const apps = deferred();
  const profile = deferred();
  const state = {
    policy: { version: 4, enabled: 1 },
    autopilot: true,
    styleCount: 3,
    signedOut: false,
    modal: 'tools',
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async (url) =>
      String(url).includes('/api/applications')
        ? apps.promise
        : profile.promise,
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const loadRuntimeContext = bind(loadSrc, deps);
  const pending = loadRuntimeContext();
  helper.expireSession(session);
  deps.applyExpired();
  apps.resolve({
    status: 200,
    ok: true,
    json: async () => ({
      viewer: 'owner-a',
      policy: { version: 9, enabled: 1 },
    }),
  });
  profile.resolve({
    status: 200,
    ok: true,
    json: async () => ({ rules: [{ id: 'r1' }, { id: 'r2' }] }),
  });
  await pending;
  assert.equal(state.signedOut, true);
  assert.equal(state.policy, null);
  assert.equal(state.autopilot, false);
  assert.equal(state.styleCount, 0);
  assert.equal(state.modal, null);
});

void test('policy POST 401 expires without parsing and a delayed 200 cannot restore it', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const saveSrc = src.slice(
    src.indexOf('async function saveLimits'),
    src.indexOf('\n  async function toggleAutopilot'),
  );
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const pending = deferred();
  let jsonCalls = 0;
  const state = {
    policy: { version: 2, enabled: 0, expires: '2026-09-14T00:00:00.000Z' },
    autopilot: false,
    signedOut: false,
    message: '',
    busy: false,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    isTerminal,
    boundedPolicyMaximum,
    policyExpiryIso,
    jobs: [{ id: 'job-1', status: 'Held' }],
    busyRef: { current: false },
    policyRef: { current: state.policy },
    fetch: async () => pending.promise,
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const saveLimits = bind(saveSrc, deps);
  const saving = saveLimits({ maximum: 8, review: 'all', enabled: true });
  const jsonWait = deferred();
  pending.resolve({
    status: 200,
    ok: true,
    json: async () => {
      jsonCalls += 1;
      await jsonWait.promise;
      return { viewer: 'owner-a', policy: { version: 3, enabled: 1 } };
    },
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  helper.expireSession(session);
  deps.applyExpired();
  jsonWait.resolve();
  assert.equal(await saving, false);
  assert.equal(jsonCalls, 1);
  assert.equal(state.signedOut, true);
  assert.equal(state.policy, null);
  assert.equal(state.autopilot, false);
});

void test('runtime context waits for a bound workspace viewer', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
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
    applyExpired: () => {
      throw Error('must not expire');
    },
  };
  const loadRuntimeContext = bind(loadSrc, deps);
  await loadRuntimeContext();
  assert.equal(fetches, 0);
});

void test('policy GET 401 expires without parsing JSON', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const state = {
    policy: { version: 1, enabled: 1 },
    autopilot: true,
    styleCount: 2,
    signedOut: false,
  };
  let jsonCalls = 0;
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async (url) => ({
      status: 401,
      ok: false,
      json: async () => {
        jsonCalls += 1;
        return { error: 'Unauthorized' };
      },
      url,
    }),
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const loadRuntimeContext = bind(loadSrc, deps);
  await loadRuntimeContext();
  assert.equal(jsonCalls, 0);
  assert.equal(state.signedOut, true);
  assert.equal(state.policy, null);
  assert.equal(state.autopilot, false);
  assert.equal(state.styleCount, 0);
});
