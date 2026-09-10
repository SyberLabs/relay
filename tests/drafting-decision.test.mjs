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
import {
  confirmProfileFact,
  factClaimFromAnswer,
  retireProfileFact,
  usableFact,
} from '../lib/profile.ts';

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
const startDateQuestion = 'do not submit until the start date is confirmed.';
const startDateClaim = (answer) =>
  factClaimFromAnswer(startDateQuestion, answer);

for (const choice of ['answer', 'delegate', 'reset']) {
  void test(`legacy ${choice} receipt replays without writes or expanded permission`, async () => {
    const db = database();
    try {
      const b = input({
        choice,
        remember: choice === 'delegate',
        answer: choice === 'answer' ? 'Two weeks after offer.' : '',
      });
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(['alice', b.operation_id])),
      );
      const eventId = `decision:${Buffer.from(digest).toString('hex')}`;
      // Exact serialization written before save_profile was introduced.
      const detail = JSON.stringify({
        version: 1,
        preference_version: 1,
        choice,
        remember: b.remember,
        answer: b.answer,
      });
      db.sqlite
        .prepare(
          "INSERT INTO events(id,owner,job_id,kind,detail,created) VALUES (?,'alice','job','Drafting decision',?,'before')",
        )
        .run(eventId, detail);
      db.sqlite.exec("UPDATE jobs SET version=2 WHERE id='job'");
      const before = snapshot(db);
      assert.deepEqual((await save(db, b)).data, { ok: true, replayed: true });
      assert.deepEqual((await save(db, { ...b, save_profile: false })).data, {
        ok: true,
        replayed: true,
      });
      for (const change of [
        { answer: 'Changed answer', choice: 'answer', remember: false },
        { preference_version: 2 },
        { id: 'other' },
        ...(choice === 'answer' ? [{ save_profile: true }] : []),
      ]) {
        assert.equal((await save(db, { ...b, ...change })).status, 409);
      }
      assert.deepEqual(snapshot(db), before);
      assert.equal(
        db.sqlite.prepare('SELECT COUNT(*) n FROM profile_facts').get().n,
        0,
      );
    } finally {
      db.sqlite.close();
    }
  });
}

void test('citizenship and authorization answers preserve both distinct proposals', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='Are you authorized to work in the United States?' WHERE id='job'; UPDATE jobs SET blocker='Do you hold United States citizenship?' WHERE id='other'",
    );
    for (const [id, answer] of [
      ['job', 'Yes'],
      ['other', 'No'],
    ]) {
      assert.equal(
        (
          await save(db, {
            id,
            operation_id: id,
            choice: 'answer',
            remember: false,
            save_profile: true,
            answer,
          })
        ).status,
        200,
      );
    }
    const facts = db.sqlite
      .prepare(
        'SELECT claim,field_key,status FROM profile_facts ORDER BY field_key',
      )
      .all();
    assert.equal(facts.length, 2);
    assert.deepEqual(
      facts.map((f) => f.field_key),
      ['citizenship.us', 'work_authorization.us'],
    );
    assert.ok(
      facts.some(
        (f) =>
          f.claim === 'Are you authorized to work in the United States?: Yes',
      ),
    );
    assert.ok(
      facts.some(
        (f) => f.claim === 'Do you hold United States citizenship?: No',
      ),
    );
    assert.ok(facts.every((f) => f.status === 'Proposed'));
  } finally {
    db.sqlite.close();
  }
});

for (const transition of [confirmProfileFact, retireProfileFact]) {
  void test(`${transition.name} bumps only on a transition, not replay or refusal`, async () => {
    const db = database();
    try {
      db.sqlite.exec(
        "INSERT INTO profile_facts(id,owner,claim,tag,status,created) VALUES ('fact','alice','Exact displayed claim','detail','Proposed','before'); INSERT INTO profile_state(owner,profile_version,updated) VALUES ('alice',7,'before')",
      );
      const body = {
        id: 'fact',
        claim: 'Exact displayed claim',
        expires: null,
      };
      assert.equal(
        (await transition(db, 'alice', body, 'changed')).status,
        200,
      );
      assert.equal(
        db.sqlite.prepare('SELECT profile_version FROM profile_state').get()
          .profile_version,
        8,
      );
      const state = () =>
        ['profile_facts', 'profile_state'].map((t) =>
          db.sqlite.prepare(`SELECT * FROM ${t}`).all(),
        );
      const after = state();
      assert.deepEqual((await transition(db, 'alice', body, 'replayed')).data, {
        ok: true,
        replayed: true,
      });
      assert.equal(
        (
          await transition(
            db,
            'alice',
            { ...body, claim: 'Unseen replacement' },
            'stale',
          )
        ).status,
        409,
      );
      assert.equal(
        (await transition(db, 'bob', body, 'wrong-owner')).status,
        404,
      );
      assert.equal(
        (await transition(db, 'alice', { id: 'fact' }, 'missing-claim')).status,
        400,
      );
      assert.deepEqual(state(), after);
    } finally {
      db.sqlite.close();
    }
  });
}

void test('an equal retired legacy claim without a key can be proposed at the fact cap', async () => {
  const db = database();
  try {
    db.sqlite
      .prepare('UPDATE jobs SET blocker=? WHERE id=?')
      .run(startDateQuestion, 'job');
    db.sqlite
      .prepare(
        "INSERT INTO profile_facts(id,owner,claim,evidence,tag,status,verified,created) VALUES ('legacy','alice',?,'prior','detail','Retired','before','before')",
      )
      .run(startDateClaim('Two weeks after offer.'));
    db.sqlite.exec(
      "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<499) INSERT INTO profile_facts(id,owner,claim,tag,status,created) SELECT 'f'||x,'alice','Claim '||x,'detail','Verified','before' FROM n",
    );
    const verified = db.sqlite
      .prepare("SELECT * FROM profile_facts WHERE status='Verified'")
      .all();
    const b = {
      choice: 'answer',
      remember: false,
      save_profile: true,
      answer: 'Two weeks after offer.',
    };
    assert.equal((await save(db, b)).status, 200);
    const row = db.sqlite
      .prepare("SELECT * FROM profile_facts WHERE id='legacy'")
      .get();
    assert.equal(row.status, 'Proposed');
    assert.equal(row.verified, null);
    assert.equal(row.expires, null);
    assert.equal(row.claim, startDateClaim(b.answer));
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) n FROM profile_facts').get().n,
      500,
    );
    assert.deepEqual(
      db.sqlite
        .prepare("SELECT * FROM profile_facts WHERE status='Verified'")
        .all(),
      verified,
    );
    const after = snapshot(db);
    assert.deepEqual((await save(db, b)).data, { ok: true, replayed: true });
    assert.deepEqual(snapshot(db), after);
  } finally {
    db.sqlite.close();
  }
});

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
      {
        version: 2,
        choice: 'answer',
        remember: false,
        save_profile: true,
        answer: 'Two weeks from a signed offer.',
      },
    ])
      assert.equal((await save(db, change)).status, 409);
    assert.equal((await save(db, { viewer: 'bob' }, 'bob')).status, 404);
    assert.deepEqual(snapshot(db), before);
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) AS n FROM profile_facts').get().n,
      0,
    );
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
    {
      choice: 'answer',
      remember: true,
      answer: 'Use the confirmed database project; omit the optional anecdote.',
    },
    { choice: 'reset' },
    { version: 0 },
    { viewer: undefined },
    { remember: 'yes' },
    {
      choice: 'delegate',
      remember: false,
      save_profile: true,
      answer: '',
    },
    { save_profile: 'yes' },
  ])
    assert.throws(() => validateDraftingDecision(input(change)));
  const longJobAnswer = validateDraftingDecision(
    input({
      choice: 'answer',
      remember: false,
      save_profile: true,
      answer: 'a'.repeat(501),
    }),
  );
  assert.equal(longJobAnswer.save_profile, true);
  assert.equal(longJobAnswer.answer.length, 501);
});

void test('a profile-too-long answer still saves on the job and writes no fact', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    const answer = 'a'.repeat(501);
    const result = await save(db, {
      choice: 'answer',
      remember: false,
      save_profile: true,
      answer,
    });
    assert.equal(result.status, 200);
    const job = db.sqlite.prepare('SELECT * FROM jobs WHERE id=?').get('job');
    assert.equal(job.drafting_direction, answer);
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) AS n FROM profile_facts').get().n,
      0,
    );
    const event = db.sqlite.prepare('SELECT detail FROM events').get();
    assert.equal(JSON.parse(event.detail).save_profile, false);
  } finally {
    db.sqlite.close();
  }
});

void test('a reusable blocked answer proposes an owner-scoped fact without verifying or preferring routine drafting', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    const before = db.sqlite
      .prepare('SELECT * FROM profile_facts ORDER BY rowid')
      .all();
    assert.equal(before.length, 0);
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'Two weeks from a signed offer.',
        })
      ).status,
      200,
    );
    const facts = db.sqlite
      .prepare('SELECT * FROM profile_facts ORDER BY rowid')
      .all();
    assert.equal(facts.length, 1);
    assert.equal(facts[0].owner, 'alice');
    assert.equal(
      facts[0].claim,
      startDateClaim('Two weeks from a signed offer.'),
    );
    assert.equal(facts[0].field_key, 'earliest_start');
    assert.equal(facts[0].status, 'Proposed');
    assert.equal(facts[0].tag, 'detail');
    assert.match(facts[0].evidence, /start date/);
    assert.equal(facts[0].verified, null);
    assert.equal(usableFact(facts[0], 'after'), false);
    assert.equal((await loadDraftingPreference(db, 'alice')).routine, false);
    const bob = db.sqlite
      .prepare('SELECT * FROM profile_facts WHERE owner=?')
      .all('bob');
    assert.equal(bob.length, 0);
    assert.deepEqual(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'Two weeks from a signed offer.',
        })
      ).data,
      { ok: true, replayed: true },
    );
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) AS n FROM profile_facts').get().n,
      1,
    );
  } finally {
    db.sqlite.close();
  }
});

void test('job-only answers and unverified proposed facts stay out of drafting context', async () => {
  const db = database();
  try {
    await save(db, {
      choice: 'answer',
      remember: false,
      answer: 'Use the confirmed database project; omit the optional anecdote.',
    });
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) AS n FROM profile_facts').get().n,
      0,
    );
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.', version=2 WHERE id='job'",
    );
    await save(db, {
      version: 2,
      operation_id: 'save-start',
      choice: 'answer',
      remember: false,
      save_profile: true,
      answer: '12 June 2027.',
    });
    const proposed = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    const call = async (_path, body) =>
      body
        ? { events: [], next: null }
        : {
            jobs: db.sqlite.prepare('SELECT * FROM jobs ORDER BY rowid').all(),
            sources: [],
            facts: db.sqlite
              .prepare('SELECT * FROM profile_facts')
              .all()
              .filter((row) => usableFact(row, 'after')),
            draftingPreference: await loadDraftingPreference(db, 'alice'),
          };
    const unread = await readApplicationContext(call, 'job');
    assert.equal(unread.facts.length, 0);
    assert.equal(
      (
        await confirmProfileFact(
          db,
          'alice',
          { id: proposed.id, claim: proposed.claim },
          'after',
        )
      ).status,
      200,
    );
    const ready = await readApplicationContext(call, 'job');
    assert.equal(ready.facts.length, 1);
    assert.equal(ready.facts[0].field_key, 'earliest_start');
    assert.equal(ready.facts[0].claim, startDateClaim('12 June 2027.'));
    assert.match(ready.guidance.join(' '), /may propose a profile fact/);
  } finally {
    db.sqlite.close();
  }
});

void test('a stale confirmation of a replaced Proposed claim does not verify the unseen wording', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: '1 June 2027',
        })
      ).status,
      200,
    );
    const displayed = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(displayed.claim, startDateClaim('1 June 2027'));
    assert.equal(displayed.status, 'Proposed');
    assert.equal(
      (
        await save(db, {
          version: 2,
          operation_id: 'decision-2',
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: '1 July 2027',
        })
      ).status,
      200,
    );
    const stale = await confirmProfileFact(
      db,
      'alice',
      { id: displayed.id, claim: displayed.claim },
      'confirm',
    );
    assert.equal(stale.status, 409);
    const row = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(row.id, displayed.id);
    assert.equal(row.claim, startDateClaim('1 July 2027'));
    assert.equal(row.status, 'Proposed');
    assert.equal(row.verified, null);
    assert.equal(
      db.sqlite
        .prepare('SELECT profile_version FROM profile_state WHERE owner=?')
        .get('alice'),
      undefined,
    );
    const missingClaim = await confirmProfileFact(
      db,
      'alice',
      { id: displayed.id },
      'confirm',
    );
    assert.equal(missingClaim.status, 400);
    assert.equal(
      db.sqlite.prepare('SELECT status FROM profile_facts').get().status,
      'Proposed',
    );
    const current = await confirmProfileFact(
      db,
      'alice',
      { id: displayed.id, claim: startDateClaim('1 July 2027') },
      'confirm',
    );
    assert.equal(current.status, 200);
    const verified = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(verified.claim, startDateClaim('1 July 2027'));
    assert.equal(verified.status, 'Verified');
    assert.equal(verified.verified, 'confirm');
    assert.equal(
      db.sqlite
        .prepare('SELECT profile_version FROM profile_state WHERE owner=?')
        .get('alice').profile_version,
      2,
    );
  } finally {
    db.sqlite.close();
  }
});

void test('Your facts Confirm fact and Discard send the displayed claim', () => {
  const source = readFileSync('app/profile/page.tsx', 'utf8');
  assert.match(source, /action: 'verify',\s*id: f\.id,\s*claim: f\.claim/);
  assert.match(source, /action: 'retire', id: f\.id, claim: f\.claim/);
});

void test('a stale discard of a replaced Proposed claim does not retire the unseen wording', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: '1 June 2027',
        })
      ).status,
      200,
    );
    const displayed = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(
      (
        await save(db, {
          version: 2,
          operation_id: 'decision-2',
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: '1 July 2027',
        })
      ).status,
      200,
    );
    const stale = await retireProfileFact(
      db,
      'alice',
      { id: displayed.id, claim: displayed.claim },
      'retire',
    );
    assert.equal(stale.status, 409);
    const row = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(row.claim, startDateClaim('1 July 2027'));
    assert.equal(row.status, 'Proposed');
  } finally {
    db.sqlite.close();
  }
});

void test('a later proposed answer updates the same field_key without adding a row', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'Two weeks from a signed offer.',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await save(db, {
          version: 2,
          operation_id: 'decision-2',
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: '12 June 2027.',
        })
      ).status,
      200,
    );
    const facts = db.sqlite
      .prepare('SELECT * FROM profile_facts ORDER BY rowid')
      .all();
    assert.equal(facts.length, 1);
    assert.equal(facts[0].field_key, 'earliest_start');
    assert.equal(facts[0].claim, startDateClaim('12 June 2027.'));
    assert.equal(facts[0].status, 'Proposed');
    assert.equal((await loadDraftingPreference(db, 'alice')).routine, false);
  } finally {
    db.sqlite.close();
  }
});

void test('an existing claim does not abort the decision or duplicate the ledger row', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    db.sqlite.exec(
      "INSERT INTO profile_facts (id,owner,claim,evidence,tag,status,created) VALUES ('fact-claim','alice','" +
        startDateClaim('Two weeks from a signed offer.').replaceAll("'", "''") +
        "','resume','detail','Proposed','before')",
    );
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'Two weeks from a signed offer.',
        })
      ).status,
      200,
    );
    const facts = db.sqlite
      .prepare('SELECT * FROM profile_facts ORDER BY rowid')
      .all();
    assert.equal(facts.length, 1);
    assert.equal(facts[0].id, 'fact-claim');
    assert.equal(facts[0].field_key, null);
    assert.equal(
      db.sqlite
        .prepare('SELECT drafting_direction FROM jobs WHERE id=?')
        .get('job').drafting_direction,
      'Two weeks from a signed offer.',
    );
  } finally {
    db.sqlite.close();
  }
});

void test('a full fact ledger refuses save_profile without writing the decision', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    db.sqlite
      .exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<500)
      INSERT INTO profile_facts (id,owner,claim,evidence,tag,status,created)
      SELECT 'fact-'||x,'alice','Claim '||x,'','detail','Proposed','before' FROM n;`);
    const before = snapshot(db);
    await assert.rejects(
      save(db, {
        choice: 'answer',
        remember: false,
        save_profile: true,
        answer: 'Two weeks from a signed offer.',
      }),
      /storage quota/,
    );
    assert.deepEqual(snapshot(db), before);
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) AS n FROM profile_facts').get().n,
      500,
    );
    assert.equal((await loadDraftingPreference(db, 'alice')).routine, false);
  } finally {
    db.sqlite.close();
  }
});

void test('authorization questions in different jurisdictions keep separate proposed facts', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='Are you authorized to work in the United States?' WHERE id='job'",
    );
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'Yes',
        })
      ).status,
      200,
    );
    db.sqlite.exec(
      "UPDATE jobs SET blocker='Do you require visa sponsorship?' WHERE id='job'",
    );
    assert.equal(
      (
        await save(db, {
          version: 2,
          operation_id: 'sponsorship',
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'Yes',
        })
      ).status,
      200,
    );
    db.sqlite.exec(
      "UPDATE jobs SET blocker='Are you authorized to work in Canada?' WHERE id='job'",
    );
    assert.equal(
      (
        await save(db, {
          version: 3,
          operation_id: 'canada',
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'Yes',
        })
      ).status,
      200,
    );
    const facts = db.sqlite
      .prepare('SELECT * FROM profile_facts ORDER BY field_key')
      .all();
    assert.equal(facts.length, 3);
    assert.deepEqual(
      facts.map((row) => row.field_key),
      ['visa_sponsorship', 'work_authorization.ca', 'work_authorization.us'],
    );
    assert.equal(
      facts.find((row) => row.field_key === 'work_authorization.us').claim,
      factClaimFromAnswer(
        'Are you authorized to work in the United States?',
        'Yes',
      ),
    );
    assert.equal(
      facts.find((row) => row.field_key === 'work_authorization.ca').claim,
      factClaimFromAnswer('Are you authorized to work in Canada?', 'Yes'),
    );
    assert.equal(
      facts.find((row) => row.field_key === 'visa_sponsorship').claim,
      factClaimFromAnswer('Do you require visa sponsorship?', 'Yes'),
    );
    assert.ok(facts.every((row) => row.status === 'Proposed'));
  } finally {
    db.sqlite.close();
  }
});

void test('a verified field is not overwritten by a later proposed answer', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    db.sqlite.exec(
      "INSERT INTO profile_facts (id,owner,claim,evidence,tag,status,verified,field_key,created) VALUES ('fact-1','alice','Already confirmed start','prior','detail','Verified','before','earliest_start','before')",
    );
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: 'A conflicting later start date.',
        })
      ).status,
      200,
    );
    const row = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(row.claim, 'Already confirmed start');
    assert.equal(row.status, 'Verified');
    assert.equal((await loadDraftingPreference(db, 'alice')).routine, false);
  } finally {
    db.sqlite.close();
  }
});

void test('a discarded field_key is proposed again without an extra row or a profile-version bump', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: '1 June 2027',
        })
      ).status,
      200,
    );
    const proposed = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(
      (
        await retireProfileFact(
          db,
          'alice',
          { id: proposed.id, claim: proposed.claim },
          'retire',
        )
      ).status,
      200,
    );
    const retired = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(retired.status, 'Retired');
    assert.equal(retired.id, proposed.id);
    const versionAfterRetire = db.sqlite
      .prepare('SELECT profile_version FROM profile_state WHERE owner=?')
      .get('alice')?.profile_version;
    assert.equal(
      (
        await save(db, {
          version: 2,
          operation_id: 'decision-2',
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer: '1 July 2027',
        })
      ).status,
      200,
    );
    const facts = db.sqlite
      .prepare('SELECT * FROM profile_facts ORDER BY rowid')
      .all();
    assert.equal(facts.length, 1);
    assert.equal(facts[0].id, proposed.id);
    assert.equal(facts[0].status, 'Proposed');
    assert.equal(facts[0].claim, startDateClaim('1 July 2027'));
    assert.equal(facts[0].verified, null);
    assert.equal(facts[0].expires, null);
    assert.equal(
      db.sqlite
        .prepare('SELECT profile_version FROM profile_state WHERE owner=?')
        .get('alice')?.profile_version,
      versionAfterRetire,
    );
    assert.equal(
      JSON.parse(
        db.sqlite.prepare('SELECT detail FROM events ORDER BY rowid DESC').get()
          .detail,
      ).save_profile,
      true,
    );
    assert.equal(
      (
        await confirmProfileFact(
          db,
          'alice',
          { id: facts[0].id, claim: facts[0].claim },
          'confirm',
        )
      ).status,
      200,
    );
    assert.equal(
      db.sqlite.prepare('SELECT status FROM profile_facts').get().status,
      'Verified',
    );
    assert.equal(
      db.sqlite
        .prepare('SELECT profile_version FROM profile_state WHERE owner=?')
        .get('alice').profile_version,
      versionAfterRetire + 1,
    );
  } finally {
    db.sqlite.close();
  }
});

void test('a discarded fact with the same wording can be proposed again', async () => {
  const db = database();
  try {
    db.sqlite.exec(
      "UPDATE jobs SET blocker='do not submit until the start date is confirmed.' WHERE id='job'",
    );
    const answer = 'Two weeks from a signed offer.';
    assert.equal(
      (
        await save(db, {
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer,
        })
      ).status,
      200,
    );
    const proposed = db.sqlite.prepare('SELECT * FROM profile_facts').get();
    assert.equal(
      (
        await retireProfileFact(
          db,
          'alice',
          { id: proposed.id, claim: proposed.claim },
          'retire',
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await save(db, {
          version: 2,
          operation_id: 'decision-2',
          choice: 'answer',
          remember: false,
          save_profile: true,
          answer,
        })
      ).status,
      200,
    );
    const facts = db.sqlite
      .prepare('SELECT * FROM profile_facts ORDER BY rowid')
      .all();
    assert.equal(facts.length, 1);
    assert.equal(facts[0].id, proposed.id);
    assert.equal(facts[0].status, 'Proposed');
    assert.equal(facts[0].claim, startDateClaim(answer));
    assert.equal(facts[0].verified, null);
    assert.equal(
      db.sqlite
        .prepare('SELECT drafting_direction FROM jobs WHERE id=?')
        .get('job').drafting_direction,
      answer,
    );
  } finally {
    db.sqlite.close();
  }
});
