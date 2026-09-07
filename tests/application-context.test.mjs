import test from 'node:test';
import assert from 'node:assert/strict';
import { readApplicationContext } from '../lib/application-context.ts';
import { run } from '../integrations/cli.mjs';
import { request, EXIT, exitFor } from '../integrations/client.mjs';

const snapshot = {
  jobs: [
    {
      id: 'j1',
      owner: 'a',
      job_key: 'one',
      version: 4,
      draft: 'Edited words',
      accepted_draft: null,
      blocker: 'Confirm location',
    },
    { id: 'j2', owner: 'a', job_key: 'two', draft: 'Unrelated draft' },
  ],
  sources: [
    { owner: 'a', job_key: 'one', notes: 'Research; not candidate facts' },
    { owner: 'a', job_key: 'two', notes: 'Unrelated research' },
  ],
  facts: [
    {
      id: 'f1',
      owner: 'a',
      claim: 'User-confirmed skill',
      status: 'Verified',
      expires: null,
    },
  ],
};

void test('selected context preserves exact text, source evidence and one history page without leaking other jobs', async () => {
  const calls = [];
  const next = '2026-09-01T00:00:00.000Z';
  const context = await readApplicationContext(
    async (path, body) => {
      calls.push({ path, body });
      return body
        ? {
            events: [
              {
                owner: 'a',
                job_id: 'j1',
                kind: 'Draft accepted',
                detail: '{"draft":"Earlier exact words"}',
              },
              { job_id: 'j2', detail: 'Other history' },
            ],
            next,
          }
        : snapshot;
    },
    'j1',
    next,
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, {
    action: 'history',
    id: 'j1',
    limit: 50,
    before: next,
  });
  assert.equal(context.job.draft, 'Edited words');
  assert.equal(
    context.job.accepted_draft,
    null,
    'old acceptance is not applied to edited words',
  );
  assert.equal(context.job.blocker, 'Confirm location');
  assert.equal(context.research.length, 1);
  assert.equal(context.facts[0].id, 'f1');
  assert.equal(context.history.events.length, 1);
  assert.equal(
    context.history.next,
    next,
    'truncation is explicit, never followed automatically',
  );
  assert.ok(!JSON.stringify(context).includes('"owner"'));
  assert.ok(!JSON.stringify(context).includes('Unrelated'));
  assert.deepEqual(snapshot.jobs[0].draft, 'Edited words');
});

void test('missing or invalid jobs and cursors cannot trigger a history request', async () => {
  for (const [id, before, expectedCalls] of [
    [undefined, undefined, 0],
    ['', undefined, 0],
    ['j1', true, 0],
    ['j1', 'nonsense', 0],
    ['missing', undefined, 1],
  ]) {
    let calls = 0;
    await assert.rejects(
      readApplicationContext(
        async () => {
          calls++;
          return snapshot;
        },
        id,
        before,
      ),
    );
    assert.equal(calls, expectedCalls);
  }
});

void test('history refusal discards partial context and does not retry', async () => {
  let calls = 0;
  await assert.rejects(
    readApplicationContext(async (_path, body) => {
      calls++;
      if (body) throw Error('Sign in first.');
      return snapshot;
    }, 'j1'),
    /Sign in first/,
  );
  assert.equal(calls, 2);
});

void test('quota and unexpected HTTP failures never report a successful CLI exit or retry', async () => {
  for (const status of [403, 408, 429, 503]) {
    let attempts = 0;
    await assert.rejects(
      request(
        '/api/workspace',
        { action: 'history', id: 'j1' },
        {
          session: 'fictional=1',
          fetchImpl: async () => {
            attempts++;
            return new Response(JSON.stringify({ error: 'Refused' }), {
              status,
            });
          },
        },
      ),
      (error) => error.code !== EXIT.ok && error.code === exitFor(status),
    );
    assert.equal(attempts, 1);
  }
});

void test('context CLI emits the selected application as JSON through the authenticated client', async () => {
  const previous = process.stdout.write.bind(process.stdout);
  let stdout = '';
  process.stdout.write = (chunk) => {
    stdout += chunk;
    return true;
  };
  try {
    assert.equal(
      await run(['context', 'j1', '--json'], {
        session: 'fictional=1',
        fetchImpl: async (_url, init) => {
          assert.equal(init.headers.cookie, 'fictional=1');
          return Response.json(
            init.body ? { events: [], next: null } : snapshot,
          );
        },
      }),
      EXIT.ok,
    );
    assert.equal(JSON.parse(stdout).job.id, 'j1');
  } finally {
    process.stdout.write = previous;
  }
});
