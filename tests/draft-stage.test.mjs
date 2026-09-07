import test from 'node:test';
import assert from 'node:assert/strict';
import { stageDraft } from '../lib/draft-stage.ts';

const input = {
  id: 'owned',
  version: 2,
  draft: ' Exact words.\r\n',
  blocker: 'Confirm location.',
};

void test('stage preserves exact text, blocker and generation version; never forwards acceptance', async () => {
  for (const status of [
    'Held',
    'Ready',
    'Skip',
    'Submitted',
    'Live loop',
    'Offer',
    'Accepted',
    'Closed',
  ]) {
    const calls = [];
    const result = await stageDraft(
      async (path, body) => {
        calls.push({ path, body });
        return body
          ? { ok: true }
          : { jobs: [{ id: input.id, version: 9, status }] };
      },
      {
        ...input,
        status: 'Ready',
        accepted_draft: input.draft,
        action: 'record',
      },
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [
      { path: '/api/workspace', body: undefined },
      {
        path: '/api/workspace',
        body: {
          ...input,
          action: 'save',
          status: ['Held', 'Ready', 'Skip'].includes(status) ? 'Held' : status,
        },
      },
    ]);
  }
});

void test('stage cannot mutate a job absent from the authenticated owner snapshot', async () => {
  let calls = 0;
  await assert.rejects(
    stageDraft(async () => {
      calls++;
      return { jobs: [{ id: 'someone-elses-job', status: 'Held' }] };
    }, input),
    /Record not found/,
  );
  assert.equal(calls, 1);
});

void test('stage requires bounded exact fields before reading or writing', async () => {
  for (const bad of [
    { id: '' },
    { id: 'x'.repeat(201) },
    { version: undefined },
    { version: '2' },
    { version: 0 },
    { version: 1.5 },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { draft: null },
    { draft: 'x'.repeat(20001) },
    { blocker: undefined },
    { blocker: null },
    { blocker: 'x'.repeat(4001) },
  ]) {
    await assert.rejects(
      stageDraft(async () => assert.fail('invalid input reached network'), {
        ...input,
        ...bad,
      }),
    );
  }
});

void test('stage preserves failures without automatic mutation retries', async () => {
  for (const failedCall of [1, 2]) {
    let calls = 0;
    const refusal = Error('Authentication, quota or stale-work refusal');
    await assert.rejects(
      stageDraft(async () => {
        calls++;
        if (calls === failedCall) throw refusal;
        return { jobs: [{ id: input.id, status: 'Ready' }] };
      }, input),
      (error) => error === refusal,
    );
    assert.equal(calls, failedCall);
  }
});
