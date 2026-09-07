import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { saveProgress, validateProgress } from '../lib/application-progress.ts';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      return {
        bind: (...args) => ({
          first: async () => sqlite.prepare(sql).get(...args) ?? null,
          run: () => ({ meta: sqlite.prepare(sql).run(...args) }),
        }),
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
function addJob(db, status = 'Ready', id = 'job-a', owner = 'alice') {
  db.sqlite
    .prepare(`INSERT INTO jobs
    (id,owner,job_key,name,status,draft,accepted_draft,blocker,updated)
    VALUES (?,?,?,?,?,'Exact reviewed draft','Exact reviewed draft','Old next action','before')`)
    .run(id, owner, id, 'Example — Engineer', status);
}
const input = (overrides = {}) => ({
  action: 'progress',
  id: 'job-a',
  version: 1,
  operation_id: 'operation-1',
  note: 'Essay saved; resume with the question about teamwork.',
  blocker: 'Review the essay.',
  ...overrides,
});
const save = (db, overrides, owner = 'alice') =>
  saveProgress(db, owner, input(overrides), 'after');
const snapshot = (db) => ({
  jobs: db.sqlite.prepare('SELECT * FROM jobs ORDER BY id').all(),
  events: db.sqlite.prepare('SELECT * FROM events ORDER BY id').all(),
});

void test('progress preserves exact acceptance and every application stage, with durable note and next action', async () => {
  const db = database();
  try {
    for (const status of ['Held', 'Ready', 'Submitted', 'Skip', 'Live loop']) {
      addJob(db, status, status);
      const before = snapshot(db).jobs.find((j) => j.id === status);
      const result = await save(db, { id: status, operation_id: status });
      assert.deepEqual(result, {
        status: 200,
        data: { ok: true, replayed: false },
      });
      const after = snapshot(db).jobs.find((j) => j.id === status);
      assert.deepEqual(
        { ...after },
        {
          ...before,
          blocker: input().blocker,
          version: 2,
          updated: 'after',
        },
      );
      const event = snapshot(db).events.find((e) => e.job_id === status);
      assert.equal(event.owner, 'alice');
      assert.equal(event.kind, 'Progress saved');
      assert.deepEqual(JSON.parse(event.detail), {
        version: 1,
        operation_id: status,
        note: input().note,
        blocker: input().blocker,
      });
    }
  } finally {
    db.sqlite.close();
  }
});

void test('replays remain read-only after later edits; operation IDs are owner-scoped and payload-bound', async () => {
  const db = database();
  try {
    addJob(db);
    addJob(db, 'Held', 'job-b', 'bob');
    addJob(db, 'Held', 'job-c');
    assert.equal((await save(db)).status, 200);
    assert.equal((await save(db, { id: 'job-b' }, 'bob')).status, 200);
    assert.equal(
      (await save(db, { version: 2, operation_id: 'operation-2', blocker: '' }))
        .status,
      200,
    );
    const before = snapshot(db);
    assert.deepEqual(await save(db), {
      status: 200,
      data: { ok: true, replayed: true },
    });
    for (const changed of [
      { note: 'Different content' },
      { blocker: '' },
      { version: 3 },
      { id: 'job-b' },
      { id: 'job-c' },
      { operation_id: 'new-stale-operation' },
    ])
      assert.equal(
        (await save(db, changed)).status,
        changed.id === 'job-b' ? 404 : 409,
      );
    assert.equal((await save(db, {}, 'bob')).status, 404);
    assert.deepEqual(snapshot(db), before);
  } finally {
    db.sqlite.close();
  }
});

void test('concurrent retries write once; competing stale saves and operation collisions refuse without partial writes', async () => {
  for (const contender of [
    {},
    { note: 'Different payload' },
    { operation_id: 'operation-2' },
  ]) {
    const db = database();
    try {
      addJob(db);
      const results = await Promise.all([save(db), save(db, contender)]);
      assert.deepEqual(
        results.map((r) => r.status).sort((a, b) => a - b),
        [200, Object.keys(contender).length ? 409 : 200],
      );
      assert.equal(snapshot(db).jobs[0].version, 2);
      assert.equal(snapshot(db).events.length, 1);
      const winner = results[0].status === 200 ? input() : input(contender);
      assert.equal(JSON.parse(snapshot(db).events[0].detail).note, winner.note);
    } finally {
      db.sqlite.close();
    }
  }
});

void test('stale calls cannot inherit changes() from an unrelated connection write', async () => {
  const db = database();
  try {
    addJob(db);
    const batch = db.batch.bind(db);
    db.batch = (statements) => {
      // A different editor wins after both prechecks, on this same connection.
      db.sqlite
        .prepare(
          "UPDATE jobs SET version=2,blocker='Newer work' WHERE id='job-a'",
        )
        .run();
      return batch(statements);
    };
    assert.equal((await save(db)).status, 409);
    assert.equal(snapshot(db).jobs[0].blocker, 'Newer work');
    assert.equal(snapshot(db).jobs[0].version, 2);
    assert.equal(snapshot(db).events.length, 0);
  } finally {
    db.sqlite.close();
  }
});

void test('transaction failures retain previous work and roll back the progress receipt', async () => {
  const db = database();
  try {
    addJob(db);
    const before = snapshot(db);
    db.sqlite.exec(`CREATE TRIGGER unavailable_storage BEFORE UPDATE ON jobs
      BEGIN SELECT RAISE(ABORT, 'simulated storage refusal'); END;`);
    await assert.rejects(save(db), /storage refusal/);
    assert.deepEqual(snapshot(db), before);
    db.sqlite.exec('DROP TRIGGER unavailable_storage');
    assert.equal(
      (await save(db)).status,
      200,
      'A rolled-back attempt must not consume its operation ID',
    );
  } finally {
    db.sqlite.close();
  }
});

void test('event storage exhaustion refuses progress without changing the job', async () => {
  const db = database();
  try {
    addJob(db);
    db.sqlite
      .exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<20000)
      INSERT INTO events (id,owner,job_id,kind,detail,created)
      SELECT 'old-'||x,'alice','job-a','Review saved','{}','before' FROM n;`);
    const before = snapshot(db);
    await assert.rejects(save(db), /storage quota/);
    assert.deepEqual(snapshot(db), before);
  } finally {
    db.sqlite.close();
  }
});

void test('progress validates strict bounded fields and refuses attempts to change acceptance', () => {
  assert.deepEqual(
    validateProgress(
      input({ note: 'x'.repeat(4000), blocker: 'y'.repeat(4000) }),
    ),
    input({ note: 'x'.repeat(4000), blocker: 'y'.repeat(4000) }),
  );
  for (const change of [
    { note: '' },
    { note: ' \n\t' },
    { note: 5 },
    { note: 'x'.repeat(4001) },
    { blocker: null },
    { blocker: 'x'.repeat(4001) },
    { version: 0 },
    { version: -1 },
    { version: 1.5 },
    { version: '1' },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { id: '' },
    { id: 'x'.repeat(129) },
    { operation_id: '' },
    { operation_id: 'x'.repeat(129) },
    { draft: 'Unreviewed' },
    { status: 'Submitted' },
    { accepted_draft: 'Unreviewed' },
    { viewer: 3 },
  ])
    assert.throws(
      () => validateProgress(input(change)),
      Error,
      JSON.stringify(change),
    );
});
