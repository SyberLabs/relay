import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as helper from '../lib/workspace-refresh.ts';
import { defaultDraftingPreference } from '../lib/drafting-decision.ts';
import { isTerminal } from '../lib/outcomes.ts';
import {
  boundedPolicyMaximum,
  policyExpiryIso,
  policyJobIds,
} from '../lib/runtime.ts';

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
    selectedRef: { current: 'job-1' },
    refreshRef: { current: async () => {} },
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
    policyJobIds,
    jobs: [{ id: 'job-1', status: 'Held' }],
    busyRef: { current: false },
    policyRef: { current: state.policy },
    selectedRef: { current: 'job-1' },
    refresh: async () => {},
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
    selectedRef: { current: 'job-1' },
    refreshRef: { current: async () => {} },
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

void test('successful workspace refresh loads plant context after records bind', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  assert.equal(
    src.split('const loadRuntimeContext = useCallback(').length - 1,
    1,
  );
  assert.match(
    src,
    /if \(selectedRef\.current\) void loadJobHistory\(selectedRef\.current\);\n      void loadRuntimeContext\(\);/,
  );
  const expiry = useCallbackBody(src, 'applyExpired');
  const refreshSrc = src.match(
    /const refresh = useCallback\(([\s\S]*?),\s*\[applyExpired(?:,[^\]]*)?\],\s*\);/,
  )[1];
  const session = helper.createWorkspaceSession();
  let contextLoads = 0;
  const state = { jobs: [], signedOut: false, loaded: false };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        viewer: 'owner-a',
        jobs: [],
        sources: [],
        events: [],
        facts: [],
      }),
    }),
    sessionRef: { current: session },
    selectedRef: { current: '' },
    loadJobHistory: async () => {
      throw Error('must not load history without a selection');
    },
    loadRuntimeContext: async () => {
      contextLoads += 1;
    },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const refresh = bind(refreshSrc, deps);
  await refresh();
  assert.equal(contextLoads, 1);
  assert.equal(state.loaded, true);
  assert.equal(session.viewer, 'owner-a');
});

void test('expired workspace refresh does not load plant context', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const refreshSrc = src.match(
    /const refresh = useCallback\(([\s\S]*?),\s*\[applyExpired(?:,[^\]]*)?\],\s*\);/,
  )[1];
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  let contextLoads = 0;
  const state = {
    jobs: [{ id: 'job-1' }],
    policy: { version: 1, enabled: 1 },
    autopilot: true,
    styleCount: 2,
    signedOut: false,
    loaded: false,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async () => ({
      status: 401,
      ok: false,
      json: async () => {
        throw Error('must not parse 401 JSON');
      },
    }),
    sessionRef: { current: session },
    selectedRef: { current: 'job-1' },
    loadJobHistory: async () => {
      throw Error('must not load history after expiry');
    },
    loadRuntimeContext: async () => {
      contextLoads += 1;
    },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const refresh = bind(refreshSrc, deps);
  await refresh();
  assert.equal(contextLoads, 0);
  assert.equal(state.signedOut, true);
  assert.equal(state.policy, null);
  assert.equal(state.autopilot, false);
  assert.equal(state.styleCount, 0);
  assert.equal(session.viewer, undefined);
});

void test('applications 401 expires before a hanging profile fetch settles', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const profile = deferred();
  const state = {
    jobs: [{ id: 'job-1', draft: 'Owner A private notes.' }],
    policy: { version: 1, enabled: 1 },
    autopilot: true,
    styleCount: 2,
    signedOut: false,
    modal: 'tools',
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async (url) =>
      String(url).includes('/api/applications')
        ? {
            status: 401,
            ok: false,
            json: async () => {
              throw Error('must not parse 401 JSON');
            },
          }
        : profile.promise,
    sessionRef: { current: session },
    selectedRef: { current: 'job-1' },
    refreshRef: { current: async () => {} },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const pending = bind(loadSrc, deps)();
  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(state.signedOut, true);
  assert.equal(state.policy, null);
  assert.equal(state.jobs.length, 0);
  assert.equal(settled, false);
  profile.reject(Error('profile hung'));
  await pending;
  assert.equal(state.styleCount, 0);
});

void test('applications 401 expires when the profile fetch rejects', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const state = {
    policy: { version: 4, enabled: 1 },
    autopilot: true,
    styleCount: 3,
    signedOut: false,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async (url) => {
      if (String(url).includes('/api/profile')) throw Error('profile down');
      return {
        status: 401,
        ok: false,
        json: async () => {
          throw Error('must not parse 401 JSON');
        },
      };
    },
    sessionRef: { current: session },
    selectedRef: { current: '' },
    refreshRef: { current: async () => {} },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  await bind(loadSrc, deps)();
  assert.equal(state.signedOut, true);
  assert.equal(state.policy, null);
  assert.equal(state.autopilot, false);
});

void test('a policy GET from a new viewer clears prior private fields and reloads', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const loadSrc = useCallbackBody(src, 'loadRuntimeContext');
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const profile = deferred();
  let reloads = 0;
  const state = {
    jobs: [{ id: 'job-1', draft: 'Owner A private notes.' }],
    policy: { version: 1, enabled: 1, owner: 'owner-a' },
    autopilot: true,
    styleCount: 4,
    signedOut: false,
    loaded: true,
    modal: 'tools',
    message: 'Owner A notice',
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    fetch: async (url) =>
      String(url).includes('/api/applications')
        ? {
            status: 200,
            ok: true,
            json: async () => ({
              viewer: 'owner-b',
              policy: { version: 8, enabled: 0, owner: 'owner-b' },
            }),
          }
        : profile.promise,
    sessionRef: { current: session },
    selectedRef: { current: 'job-1' },
    refreshRef: {
      current: async () => {
        reloads += 1;
      },
    },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const pending = bind(loadSrc, deps)();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(session.viewer, 'owner-b');
  assert.equal(state.signedOut, false);
  assert.equal(state.jobs.length, 0);
  assert.equal(state.modal, null);
  assert.equal(state.message, '');
  assert.equal(state.policy?.owner, 'owner-b');
  assert.equal(state.autopilot, false);
  assert.equal(deps.selectedRef.current, '');
  assert.equal(reloads, 1);
  assert.equal(state.styleCount, 0);
  profile.reject(Error('unused profile'));
  await pending;
});

void test('saveLimits catch after expiry does not write a message', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const saveSrc = src.slice(
    src.indexOf('async function saveLimits'),
    src.indexOf('\n  async function toggleAutopilot'),
  );
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const pending = deferred();
  const state = {
    policy: { version: 2, enabled: 0, expires: '2026-09-14T00:00:00.000Z' },
    signedOut: false,
    message: '',
    busy: true,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    isTerminal,
    boundedPolicyMaximum,
    policyExpiryIso,
    policyJobIds,
    jobs: [{ id: 'job-1', status: 'Held' }],
    busyRef: { current: false },
    policyRef: { current: state.policy },
    selectedRef: { current: 'job-1' },
    refresh: async () => {},
    fetch: async () => pending.promise,
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const saving = bind(
    saveSrc,
    deps,
  )({
    maximum: 8,
    review: 'all',
    enabled: true,
  });
  helper.expireSession(session);
  deps.applyExpired();
  pending.reject(Error('network'));
  assert.equal(await saving, false);
  assert.equal(state.signedOut, true);
  assert.equal(state.message, '');
  assert.equal(state.policy, null);
});

void test('saveLimits finally after a viewer switch keeps a newer busy lock', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const saveSrc = src.slice(
    src.indexOf('async function saveLimits'),
    src.indexOf('\n  async function toggleAutopilot'),
  );
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const pending = deferred();
  const busyRef = { current: false };
  const state = {
    policy: { version: 2, enabled: 0, expires: '2026-09-14T00:00:00.000Z' },
    autopilot: false,
    signedOut: false,
    message: '',
    busy: true,
    jobs: [{ id: 'job-1', draft: 'Owner A private notes.' }],
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    isTerminal,
    boundedPolicyMaximum,
    policyExpiryIso,
    policyJobIds,
    jobs: state.jobs,
    busyRef,
    policyRef: { current: state.policy },
    selectedRef: { current: 'job-1' },
    refresh: async () => {},
    fetch: async () => pending.promise,
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const saving = bind(
    saveSrc,
    deps,
  )({
    maximum: 8,
    review: 'all',
    enabled: true,
  });
  const jsonWait = deferred();
  pending.resolve({
    status: 200,
    ok: true,
    json: async () => {
      await jsonWait.promise;
      return {
        viewer: 'owner-b',
        policy: { version: 9, enabled: 1, owner: 'owner-b' },
      };
    },
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  busyRef.current = 99;
  state.busy = true;
  jsonWait.resolve();
  assert.equal(await saving, false);
  assert.equal(session.viewer, 'owner-b');
  assert.equal(state.signedOut, false);
  assert.equal(state.jobs.length, 0);
  assert.equal(busyRef.current, 99);
  assert.equal(state.busy, true);
});

void test('toggleAutopilot does not open Tools after a viewer switch', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const slice = src.slice(
    src.indexOf('async function saveLimits'),
    src.indexOf('\n  return ('),
  );
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const startedEpoch = session.gate.epoch;
  const state = {
    policy: { version: 2, enabled: 0, expires: '2026-09-14T00:00:00.000Z' },
    autopilot: false,
    signedOut: false,
    message: '',
    busy: false,
    modal: null,
    jobs: [{ id: 'job-1', status: 'Held' }],
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    isTerminal,
    boundedPolicyMaximum,
    policyExpiryIso,
    policyJobIds,
    jobs: state.jobs,
    current: null,
    signedOut: false,
    autopilot: false,
    policy: state.policy,
    busyRef: { current: false },
    policyRef: { current: state.policy },
    selectedRef: { current: '' },
    refresh: async () => {},
    loadNext: () => {
      throw Error('must not load the previous queue');
    },
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        viewer: 'owner-b',
        policy: { version: 9, enabled: 1, owner: 'owner-b' },
      }),
    }),
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const compiled = stripTypeScriptTypes(slice, { mode: 'transform' })
    .trim()
    .replace(/;$/, '');
  // oxlint-disable-next-line typescript/no-implied-eval -- compile actual Workspace callbacks
  const toggleAutopilot = new Function(
    ...Object.keys(deps),
    compiled + ';return toggleAutopilot;',
  )(...Object.values(deps));
  await toggleAutopilot();
  assert.equal(session.viewer, 'owner-b');
  assert.notEqual(session.gate.epoch, startedEpoch);
  assert.equal(state.modal, null);
  assert.doesNotMatch(state.message, /Autopilot on/);
});

void test('disabling autopilot with 101 held jobs posts the saved bounded job list', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const saveSrc = src.slice(
    src.indexOf('async function saveLimits'),
    src.indexOf('\n  async function toggleAutopilot'),
  );
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  let posted;
  const savedJobs = ['job-0', 'job-1'];
  const state = {
    policy: {
      version: 2,
      enabled: 1,
      jobs: JSON.stringify(savedJobs),
      expires: '2026-09-14T00:00:00.000Z',
      maximum: 8,
      review: 'all',
    },
    autopilot: true,
    signedOut: false,
    message: '',
    busy: false,
    modal: null,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    isTerminal,
    boundedPolicyMaximum,
    policyExpiryIso,
    policyJobIds,
    jobs: Array.from({ length: 101 }, (_, i) => ({
      id: 'job-' + i,
      status: 'Held',
    })),
    busyRef: { current: false },
    policyRef: { current: state.policy },
    selectedRef: { current: '' },
    refresh: async () => {},
    fetch: async (_url, init) => {
      posted = JSON.parse(init.body);
      return {
        status: 200,
        ok: true,
        json: async () => ({
          viewer: 'owner-a',
          policy: { version: 3, enabled: 0, jobs: JSON.stringify(savedJobs) },
        }),
      };
    },
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const ok = await bind(
    saveSrc,
    deps,
  )({
    maximum: 8,
    review: 'all',
    enabled: false,
  });
  assert.equal(ok, true);
  assert.equal(posted.enabled, false);
  assert.deepEqual(posted.jobs, savedJobs);
  assert.ok(posted.jobs.length <= 100);
  assert.equal(state.autopilot, false);
});

void test('enabling autopilot with 101 held jobs fails closed without a policy POST', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const expiry = useCallbackBody(src, 'applyExpired');
  const saveSrc = src.slice(
    src.indexOf('async function saveLimits'),
    src.indexOf('\n  async function toggleAutopilot'),
  );
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  let fetches = 0;
  const state = {
    policy: { version: 2, enabled: 0, jobs: '[]' },
    signedOut: false,
    message: '',
    busy: false,
    modal: null,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    isTerminal,
    boundedPolicyMaximum,
    policyExpiryIso,
    policyJobIds,
    jobs: Array.from({ length: 101 }, (_, i) => ({
      id: 'job-' + i,
      status: 'Held',
    })),
    busyRef: { current: false },
    policyRef: { current: state.policy },
    selectedRef: { current: '' },
    refresh: async () => {},
    fetch: async () => {
      fetches += 1;
      throw Error('must not POST');
    },
    sessionRef: { current: session },
  };
  expireKeys(state, deps);
  deps.applyExpired = bind(expiry, deps);
  const ok = await bind(
    saveSrc,
    deps,
  )({
    maximum: 8,
    review: 'all',
    enabled: true,
  });
  assert.equal(ok, false);
  assert.equal(fetches, 0);
  assert.equal(state.modal, 'tools');
  assert.match(state.message, /at most 100 jobs/);
});
