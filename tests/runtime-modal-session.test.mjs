import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as helper from '../lib/workspace-refresh.ts';
import { defaultDraftingPreference } from '../lib/drafting-decision.ts';
import {
  emptyRuntimeModalPrivate,
  postRuntimeModalProfile,
  readRuntimeModalProfile,
  settleRuntimeModalProfileRead,
} from '../lib/runtime-modal-session.ts';

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

function compile(text) {
  return stripTypeScriptTypes(text, { mode: 'transform' })
    .trim()
    .replace(/;$/, '');
}

function bind(text, deps) {
  // oxlint-disable-next-line typescript/no-implied-eval -- compile actual modal/workspace callbacks
  return new Function(...Object.keys(deps), 'return (' + compile(text) + ');')(
    ...Object.values(deps),
  );
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

function modalProfileThenBody() {
  const src = readFileSync('app/runtime-modals.tsx', 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const marker =
    'void readRuntimeModalProfile(sessionRef.current).then((outcome) => {';
  const start = src.indexOf(marker);
  assert.notEqual(start, -1, marker);
  const from = start + marker.length;
  const end = src.indexOf('\n    });\n    return () => {', from);
  assert.notEqual(end, -1, 'modal profile then end');
  return src.slice(from, end);
}

function workspaceExpiry(deps) {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const token = 'const applyExpired = useCallback(';
  const start = src.indexOf(token);
  const after = start + token.length;
  const end = src.indexOf('\n  }, [', after);
  return bind(src.slice(after, end) + '\n  }', deps);
}

void test('modal private state starts empty', () => {
  assert.deepEqual(emptyRuntimeModalPrivate(), {
    profile: null,
    resume: '',
    candidates: [],
    rule: '',
    note: '',
  });
});

void test('modal profile GET expires on 401 before JSON', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  let jsonCalls = 0;
  const outcome = await readRuntimeModalProfile(session, async () => ({
    status: 401,
    ok: false,
    json: async () => {
      jsonCalls += 1;
      return {
        facts: [
          {
            id: 'stale',
            claim: 'Must not remain',
            tag: 'x',
            status: 'Verified',
          },
        ],
      };
    },
  }));
  assert.equal(outcome.type, 'expire');
  assert.equal(jsonCalls, 0);
  assert.equal(session.viewer, undefined);
});

void test('modal profile GET does not restore facts after expiry', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const pending = deferred();
  const loading = readRuntimeModalProfile(session, async () => pending.promise);
  helper.expireSession(session);
  pending.resolve({
    status: 200,
    ok: true,
    json: async () => ({
      viewer: 'owner-a',
      facts: [
        { id: 'late', claim: 'Stale owner A', tag: 'role', status: 'Verified' },
      ],
    }),
  });
  const outcome = await loading;
  assert.equal(outcome.type, 'ignore');
});

void test('modal profile POST extract expires on 401 before JSON', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  let jsonCalls = 0;
  const outcome = await postRuntimeModalProfile(
    session,
    { action: 'extract', text: 'Fictional resume' },
    async () => ({
      status: 401,
      ok: false,
      json: async () => {
        jsonCalls += 1;
        return {
          candidates: [{ claim: 'Must not apply', evidence: 'x', tag: 'y' }],
        };
      },
    }),
  );
  assert.equal(outcome.type, 'expire');
  assert.equal(jsonCalls, 0);
});

void test('profile GET without a viewer field does not report a switch', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const outcome = await readRuntimeModalProfile(session, async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      facts: [
        {
          id: 'owner-b',
          claim: 'Must not attach to owner A',
          tag: 'role',
          status: 'Verified',
        },
      ],
    }),
  }));
  assert.equal(outcome.type, 'ok');
  assert.equal(outcome.switched, false);
  assert.equal(session.viewer, 'owner-a');
});

void test('settling an expired modal read notifies even when cancelled', () => {
  let calls = 0;
  const next = settleRuntimeModalProfileRead({ type: 'expire' }, true, () => {
    calls += 1;
  });
  assert.equal(next.type, 'stop');
  assert.equal(calls, 1);
});

void test('settling a cancelled ok modal read does not apply or expire', () => {
  let calls = 0;
  const next = settleRuntimeModalProfileRead(
    {
      type: 'ok',
      switched: false,
      body: {
        facts: [
          {
            id: 'stale',
            claim: 'Owner A resume',
            tag: 'x',
            status: 'Verified',
          },
        ],
      },
    },
    true,
    () => {
      calls += 1;
    },
  );
  assert.equal(next.type, 'stop');
  assert.equal(calls, 0);
});

void test('cancelled modal profile GET 401 still expires the visible workspace', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const state = {
    jobs: [{ id: 'job-a', name: 'Owner A private role' }],
    signedOut: false,
    modal: 'resume',
    loaded: true,
  };
  const dialog = {
    profile: {
      facts: [
        { id: 'a', claim: 'Owner A secret', tag: 'role', status: 'Verified' },
      ],
    },
    resume: 'Owner A pasted resume.',
    candidates: [{ claim: 'Owner A candidate', evidence: 'x', tag: 'role' }],
    rule: '',
    note: '',
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    settleRuntimeModalProfileRead,
    cancelled: true,
    selectedRef: { current: 'job-a' },
  };
  expireKeys(state, deps);
  deps.applyExpired = workspaceExpiry(deps);
  let unauthorized = 0;
  deps.onUnauthorized = () => {
    unauthorized += 1;
    deps.applyExpired();
  };
  deps.setProfile = (value) => {
    dialog.profile = value;
  };
  deps.setResume = (value) => {
    dialog.resume = value;
  };
  deps.setCandidates = (value) => {
    dialog.candidates = value;
  };
  deps.setRule = (value) => {
    dialog.rule = value;
  };
  deps.setNote = (value) => {
    dialog.note = value;
  };
  const outcome = await readRuntimeModalProfile(session, async () => ({
    status: 401,
    ok: false,
    json: async () => {
      throw Error('must not parse 401 JSON');
    },
  }));
  assert.equal(outcome.type, 'expire');
  bind('(outcome) => {' + modalProfileThenBody() + '\n}', deps)(outcome);
  assert.equal(unauthorized, 1);
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.jobs, []);
  assert.equal(state.modal, null);
  assert.equal(dialog.resume, 'Owner A pasted resume.');
  assert.equal(dialog.profile.facts[0].claim, 'Owner A secret');
});

void test('cancelled modal profile GET 200 does not restore facts or expire', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const state = {
    jobs: [{ id: 'job-a' }],
    signedOut: false,
    modal: 'resume',
  };
  const dialog = { profile: null, resume: 'Owner A pasted resume.', note: '' };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    settleRuntimeModalProfileRead,
    cancelled: true,
    selectedRef: { current: 'job-a' },
  };
  expireKeys(state, deps);
  deps.applyExpired = workspaceExpiry(deps);
  deps.onUnauthorized = () => {
    deps.applyExpired();
  };
  deps.setProfile = (value) => {
    dialog.profile = value;
  };
  deps.setResume = (value) => {
    dialog.resume = value;
  };
  deps.setCandidates = () => {};
  deps.setRule = () => {};
  deps.setNote = (value) => {
    dialog.note = value;
  };
  const outcome = await readRuntimeModalProfile(session, async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      facts: [
        { id: 'late', claim: 'Must not apply', tag: 'x', status: 'Verified' },
      ],
    }),
  }));
  assert.equal(outcome.type, 'ok');
  bind('(outcome) => {' + modalProfileThenBody() + '\n}', deps)(outcome);
  assert.equal(state.signedOut, false);
  assert.equal(state.modal, 'resume');
  assert.equal(dialog.profile, null);
  assert.equal(dialog.resume, 'Owner A pasted resume.');
});

void test('superseded modal GET 401 still clears when the newer read is ignored', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const first = deferred();
  const second = deferred();
  const older = readRuntimeModalProfile(session, async () => first.promise);
  const newer = readRuntimeModalProfile(session, async () => second.promise);
  const state = {
    jobs: [{ id: 'job-a', name: 'Owner A private role' }],
    signedOut: false,
    modal: 'resume',
    loaded: true,
  };
  const deps = {
    ...helper,
    defaultDraftingPreference,
    settleRuntimeModalProfileRead,
    selectedRef: { current: 'job-a' },
  };
  expireKeys(state, deps);
  deps.applyExpired = workspaceExpiry(deps);
  let clears = 0;
  const onUnauthorized = () => {
    clears += 1;
    deps.applyExpired();
  };
  function thenDeps(cancelled) {
    return {
      ...deps,
      cancelled,
      onUnauthorized,
      setProfile() {},
      setResume() {},
      setCandidates() {},
      setRule() {},
      setNote() {},
    };
  }
  first.resolve({
    status: 401,
    ok: false,
    json: async () => {
      throw Error('must not parse 401 JSON');
    },
  });
  const olderOutcome = await older;
  assert.equal(olderOutcome.type, 'expire');
  bind(
    '(outcome) => {' + modalProfileThenBody() + '\n}',
    thenDeps(true),
  )(olderOutcome);
  second.resolve({
    status: 200,
    ok: true,
    json: async () => ({
      facts: [
        { id: 'b', claim: 'Must not restore', tag: 'x', status: 'Verified' },
      ],
    }),
  });
  const newerOutcome = await newer;
  assert.equal(newerOutcome.type, 'ignore');
  bind(
    '(outcome) => {' + modalProfileThenBody() + '\n}',
    thenDeps(false),
  )(newerOutcome);
  assert.equal(clears, 1);
  assert.equal(session.viewer, undefined);
  assert.equal(session.gate.epoch, 1);
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.jobs, []);
  assert.equal(state.modal, null);
});

void test('modal profile GET 502 HTML becomes an error instead of rejecting', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const outcome = await readRuntimeModalProfile(session, async () => ({
    status: 502,
    ok: false,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  }));
  assert.equal(outcome.type, 'error');
  assert.equal(outcome.error, 'Unable to load profile.');
  assert.equal(session.viewer, 'owner-a');
});

void test('modal profile POST 502 HTML becomes an error instead of rejecting', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const outcome = await postRuntimeModalProfile(
    session,
    { action: 'extract', text: 'Fictional resume' },
    async () => ({
      status: 502,
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }),
  );
  assert.equal(outcome.type, 'error');
  assert.equal(outcome.error, 'Unable to save.');
});

void test('compiled plant blocked submit posts an answer without remember', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const saveSrc = src.slice(
    src.indexOf('async function saveDecision'),
    src.indexOf('\n  function openAddJob'),
  );
  const token = 'onBlockedSubmit={() => {';
  const start = src.indexOf(token);
  assert.notEqual(start, -1, token);
  const submitSrc = src.slice(
    start + token.length,
    src.indexOf('\n          }}', start),
  );
  const posted = [];
  const deps = {
    busy: false,
    editor: {
      jobId: 'job',
      session: 's1',
      version: 1,
      draft: 'Saved wording',
      baseDraft: 'Saved wording',
      blocker: 'Required personal answer; keep submission on hold',
      baseBlocker: 'Required personal answer; keep submission on hold',
      progressNote:
        'Use the confirmed database project; omit the optional anecdote.',
    },
    current: {
      id: 'job',
      draft: 'Saved wording',
      blocker: 'Required personal answer; keep submission on hold',
    },
    canSave: () => true,
    sessionRef: { current: { viewer: 'alice' } },
    draftingPreference: defaultDraftingPreference,
    decisionAttempt: { current: null },
    async run(body) {
      posted.push(body);
      return true;
    },
    setModal() {},
    saveProfile: true,
  };
  // oxlint-disable-next-line typescript/no-implied-eval -- compile actual plant blocked submit
  const submit = new Function(
    ...Object.keys(deps),
    compile(saveSrc) +
      ';\nreturn async () => {\n' +
      compile(submitSrc) +
      '\n};',
  )(...Object.values(deps));
  await submit();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].action, 'drafting-decision');
  assert.equal(posted[0].choice, 'answer');
  assert.equal(posted[0].remember, false);
  assert.equal(posted[0].save_profile, true);
  assert.equal(
    posted[0].answer,
    'Use the confirmed database project; omit the optional anecdote.',
  );
  assert.equal(posted[0].id, 'job');
  assert.equal(posted[0].viewer, 'alice');
  assert.ok(posted[0].operation_id);
});

void test('modal profile GET json reject after expiry is ignored', async () => {
  const session = helper.createWorkspaceSession();
  helper.bindViewer(session, 'owner-a');
  const outcome = await readRuntimeModalProfile(session, async () => ({
    status: 502,
    ok: false,
    json: async () => {
      helper.expireSession(session);
      throw new SyntaxError('Unexpected token <');
    },
  }));
  assert.equal(outcome.type, 'ignore');
  assert.equal(session.viewer, undefined);
});
