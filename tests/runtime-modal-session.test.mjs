import test from 'node:test';
import assert from 'node:assert/strict';
import * as helper from '../lib/workspace-refresh.ts';
import {
  emptyRuntimeModalPrivate,
  postRuntimeModalProfile,
  readRuntimeModalProfile,
} from '../lib/runtime-modal-session.ts';

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
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
