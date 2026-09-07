import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = readFileSync('app/inspect.tsx', 'utf8');
const start = source.indexOf('  async function mutate(');
const end = source.indexOf('\n  return {\n    view:', start);
assert.ok(start >= 0 && end > start);
const compiled = stripTypeScriptTypes(source.slice(start, end), {
  mode: 'transform',
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const action of ['approve', 'answer']) {
  for (const boundary of ['response', 'json']) {
    void test(`Inspect ${action} ignores session expiry during ${boundary}`, async () => {
      const waiting = deferred();
      const parsing = deferred();
      const session = { gate: { epoch: 3 }, viewer: 'owner-a' };
      const current = {
        jobId: 'job-a',
        viewer: 'owner-a',
        generation: 4,
        expired: false,
        pending: false,
        answerRevisions: new Map(),
        session: { sessionRef: { current: session } },
      };
      const writes = [];
      let reads = 0;
      let refreshes = 0;
      let expiries = 0;
      const deps = {
        contextRef: { current },
        jobId: 'job-a',
        viewer: 'owner-a',
        setBusy: (value) => writes.push(['busy', value]),
        setError: (value) => writes.push(['error', value]),
        fetch: async () => waiting.promise,
        load: async () => {
          refreshes += 1;
        },
        expire: () => {
          expiries += 1;
        },
      };
      const mutate = runInNewContext(`(${compiled})`, deps);
      const pending = mutate({ action, label: 'Project' }, 'Unable to save.');
      const response = {
        ok: true,
        status: 200,
        json: async () => {
          reads += 1;
          return parsing.promise;
        },
      };
      if (boundary === 'json') {
        waiting.resolve(response);
        // Let the actual callback enter response.json().
        await new Promise((done) => setImmediate(done));
        assert.equal(reads, 1);
      }
      session.gate.epoch += 1;
      session.viewer = undefined;
      const before = [...writes];
      waiting.resolve(response);
      parsing.resolve({ viewer: 'owner-a' });
      await pending;
      assert.deepEqual(writes, before);
      assert.equal(refreshes, 0);
      assert.equal(expiries, 0);
      assert.equal(reads, boundary === 'json' ? 1 : 0);
    });
  }
}
