import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  loadDraftingPreference,
  saveDraftingDecision,
  validateDraftingDecision,
} from '../lib/drafting-decision.ts';
import { readApplicationContext } from '../lib/application-context.ts';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  sqlite.exec(`INSERT INTO jobs (id,owner,job_key,name,status,draft,blocker,updated)
    VALUES ('job','alice','job','Example Engineer','Held','Saved wording','Required personal answer; keep submission on hold','before'),
    ('other','alice','other','Other Engineer','Held','Other wording','Optional writing choice','before');`);
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
        const results = statements.map((s) => s.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
const input = (changes = {}) => ({
  action: 'drafting-decision',
  id: 'job',
  viewer: 'alice',
  version: 1,
  preference_version: 1,
  operation_id: 'decision-1',
  choice: 'delegate',
  remember: true,
  answer: '',
  ...changes,
});
const snapshot = (db) =>
  ['jobs', 'events', 'preferences'].map((table) =>
    db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  );
const save = (db, changes = {}, owner = 'alice') =>
  saveDraftingDecision(
    db,
    owner,
    validateDraftingDecision(input(changes)),
    'after',
  );

void test('delegation remembers a bounded preference without resolving facts, holds or exact acceptance; replay is idempotent', async () => {
  const db = database();
  try {
    const before = snapshot(db);
    assert.equal((await save(db)).status, 200);
    const after = snapshot(db);
    assert.equal(after[0][0].blocker, before[0][0].blocker);
    assert.equal(after[0][0].draft, before[0][0].draft);
    assert.equal(after[0][0].status, 'Held');
    assert.equal(after[0][0].accepted_draft, null);
    assert.match(
      after[0][0].drafting_direction,
      /Omit unsupported optional claims/,
    );
    assert.deepEqual(after[0][1], before[0][1]);
    assert.equal(after[1].length, 1);
    assert.deepEqual(await loadDraftingPreference(db, 'alice'), {
      routine: true,
      version: 2,
    });
    assert.deepEqual(await loadDraftingPreference(db, 'bob'), {
      routine: false,
      version: 1,
    });
    assert.deepEqual((await save(db)).data, { ok: true, replayed: true });
    assert.deepEqual(snapshot(db), after);
    assert.equal(
      (await save(db, { answer: 'Answer', choice: 'answer', remember: false }))
        .status,
      409,
    );
    assert.deepEqual(snapshot(db), after);
  } finally {
    db.sqlite.close();
  }
});

void test('stale job, stale global preference, wrong viewer and other owner refuse every write', async () => {
  const db = database();
  try {
    const before = snapshot(db);
    for (const change of [
      { version: 2 },
      { preference_version: 2 },
      { viewer: 'bob' },
    ])
      assert.equal((await save(db, change)).status, 409);
    assert.equal((await save(db, { viewer: 'bob' }, 'bob')).status, 404);
    assert.deepEqual(snapshot(db), before);
    await save(db);
    const after = snapshot(db);
    assert.equal(
      (
        await save(db, {
          id: 'other',
          operation_id: 'other',
          preference_version: 1,
        })
      ).status,
      409,
    );
    assert.deepEqual(snapshot(db), after);
  } finally {
    db.sqlite.close();
  }
});

void test('a preference race or exhausted history quota rolls back the entire decision', async () => {
  for (const failure of ['race', 'quota']) {
    const db = database();
    try {
      const batch = db.batch.bind(db);
      if (failure === 'race')
        db.batch = (statements) => {
          db.sqlite.exec(
            "INSERT INTO preferences (owner,routine_drafting,drafting_version,updated) VALUES ('alice',0,2,'race')",
          );
          return batch(statements);
        };
      else
        db.sqlite.exec(
          "CREATE TRIGGER reject_decision BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;",
        );
      const beforeJobs = snapshot(db)[0];
      if (failure === 'quota') await assert.rejects(save(db), /quota/);
      else assert.equal((await save(db)).status, 409);
      assert.deepEqual(snapshot(db)[0], beforeJobs);
      assert.equal(snapshot(db)[1].length, 0);
      assert.equal((await loadDraftingPreference(db, 'alice')).routine, false);
    } finally {
      db.sqlite.close();
    }
  }
});

void test('one-time context remains job-specific; remembered preference reaches future jobs and revocation invalidates old decisions', async () => {
  const db = database();
  try {
    await save(db, {
      choice: 'answer',
      remember: false,
      answer: 'Use the confirmed database project; omit the optional anecdote.',
    });
    assert.equal((await loadDraftingPreference(db, 'alice')).routine, false);
    await save(db, { version: 2, operation_id: 'remember' });
    const call = async (_path, body) =>
      body
        ? { events: [], next: null }
        : {
            jobs: snapshot(db)[0],
            sources: [],
            facts: [],
            draftingPreference: await loadDraftingPreference(db, 'alice'),
          };
    const future = await readApplicationContext(call, 'other');
    assert.equal(future.drafting.routine, true);
    assert.equal(future.drafting.direction, '');
    assert.match(future.drafting.guidance, /Never invent/);
    assert.match(future.drafting.guidance, /required answer/);
    await save(db, {
      version: 3,
      preference_version: 2,
      choice: 'reset',
      remember: false,
      operation_id: 'reset',
    });
    assert.deepEqual(await loadDraftingPreference(db, 'alice'), {
      routine: false,
      version: 3,
    });
    const before = snapshot(db);
    assert.equal(
      (
        await save(db, {
          id: 'other',
          preference_version: 2,
          operation_id: 'stale',
        })
      ).status,
      409,
    );
    assert.deepEqual(snapshot(db), before);
  } finally {
    db.sqlite.close();
  }
});

void test('decision validation refuses excessive input and permission-changing fields', () => {
  for (const change of [
    { draft: 'replace' },
    { status: 'Ready' },
    { accepted_draft: 'approved' },
    { answer: 'a'.repeat(2001), choice: 'answer', remember: false },
    { choice: 'answer', answer: '' },
    { choice: 'reset' },
    { version: 0 },
    { viewer: undefined },
    { remember: 'yes' },
  ])
    assert.throws(() => validateDraftingDecision(input(change)));
});
