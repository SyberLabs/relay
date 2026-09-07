import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  actOnApplication,
  armPreparation as armCurrentPreparation,
  changeApplicationPolicy,
  proposeApplication,
  loadOperation,
  loadApplicationPolicy,
  validateManifest,
  digest,
  inspectApplication,
  upsertPreparation as replaceCurrentPreparation,
  answerPreparation as answerCurrentPreparation,
  cancelPreBeginForJob,
} from '../lib/application-automation.ts';

const now = '2026-09-07T12:00:00.000Z';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${f}`, 'utf8'));
  let pending = Promise.resolve();
  const db = {
    sqlite,
    prepare(sql) {
      const s = sqlite.prepare(sql);
      const bound = (args) => ({
        async first() {
          return s.get(...args) || null;
        },
        async all() {
          return { results: s.all(...args) };
        },
        async run() {
          return { meta: s.run(...args) };
        },
      });
      return { bind: (...args) => bound(args), ...bound([]) };
    },
    batch(statements) {
      const work = pending.then(async () => {
        sqlite.exec('BEGIN');
        try {
          const out = [];
          for (const s of statements) out.push(await s.run());
          sqlite.exec('COMMIT');
          return out;
        } catch (e) {
          sqlite.exec('ROLLBACK');
          throw e;
        }
      });
      pending = work.catch(() => {});
      return work;
    },
  };
  for (const owner of ['alice', 'bob'])
    for (let i = 0; i < 12; i++)
      sqlite
        .prepare(
          "INSERT INTO jobs (id,owner,job_key,name,url,status,version,updated) VALUES (?,?,?,?,?,'Held',1,?)",
        )
        .run(
          `${owner}-${i}`,
          owner,
          `job-${i}`,
          `Fictional role ${i}`,
          `https://employer.example/jobs/${i}`,
          now,
        );
  return db;
}
const config = (extra = {}) => ({
  version: 0,
  enabled: true,
  review: 'sensitive',
  jobs: Array.from({ length: 12 }, (_, i) => `alice-${i}`),
  maximum: 12,
  expires: '2026-09-08T12:00:00.000Z',
  ...extra,
});
const proposal = (i = 0, extra = {}) => ({
  id: `op-${i}`,
  job: `alice-${i}`,
  version: 1,
  actor: 'Fictional applying agent',
  manifest: {
    destination: `https://employer.example/jobs/${i}`,
    fields: [{ label: 'Full name', value: 'Avery Example' }],
    files: [],
  },
  ...extra,
});
const action = (op, verb, extra = {}) => ({
  id: op.id,
  digest: op.digest,
  action: verb,
  ...extra,
});
const counts = (db) =>
  db.sqlite
    .prepare(
      'SELECT (SELECT COUNT(*) FROM application_operations) AS operations,(SELECT COUNT(*) FROM events) AS events,(SELECT SUM(version) FROM jobs) AS versions',
    )
    .get();

// Existing scenario fixtures read their revision before each intended write.
// Staleness regressions pass the captured revision explicitly instead.
async function withRevision(fn, db, owner, input, at) {
  const revision = Object.hasOwn(input, 'preparation_revision')
    ? input.preparation_revision
    : (await inspectApplication(db, owner, input.job, at)).preparation_revision;
  return fn(db, owner, { ...input, preparation_revision: revision }, at);
}
const upsertPreparation = (...args) =>
  withRevision(replaceCurrentPreparation, ...args);
const armPreparation = (...args) =>
  withRevision(armCurrentPreparation, ...args);
const answerPreparation = (...args) =>
  withRevision(answerCurrentPreparation, ...args);

void test('prepare streams field fill into inspect without creating an operation', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const view = await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [
        { label: 'Full name', value: 'Avery Example', unknown: false },
        { label: 'Work authorization', value: '', unknown: true },
      ],
      files: [],
    },
    now,
  );
  assert.equal(view.job_id, 'alice-0');
  assert.equal(view.ready, false);
  assert.equal(view.armed, false);
  assert.equal(view.accept_enabled, false);
  assert.deepEqual(view.missing, ['Work authorization']);
  assert.equal(view.fields[1].unknown, true);
  assert.equal(view.fields[0].filled, true);
  assert.equal(view.fields[0].value, 'Avery Example');
  assert.equal(view.fields[1].filled, false);
  assert.equal(view.fields[1].value, '');
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) c FROM application_operations').get().c,
    0,
  );
  const stored = db.sqlite
    .prepare(
      'SELECT armed_until, ready, operation_id FROM application_preparations WHERE owner=? AND job_id=?',
    )
    .get('alice', 'alice-0');
  assert.equal(stored.armed_until, '');
  assert.equal(stored.ready, 0);
  assert.equal(stored.operation_id, null);
  db.sqlite.close();
});

void test('prepare refuses another owner job and oversized snapshots', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  await assert.rejects(
    () =>
      upsertPreparation(
        db,
        'alice',
        {
          job: 'bob-0',
          actor: 'Fictional applying agent',
          destination: 'https://employer.example/jobs/0',
          fields: [{ label: 'Full name', value: 'Avery', unknown: false }],
          files: [],
        },
        now,
      ),
    /unavailable/i,
  );
  await assert.rejects(
    () =>
      upsertPreparation(
        db,
        'alice',
        {
          job: 'alice-0',
          actor: 'Fictional applying agent',
          destination: 'https://employer.example/jobs/0',
          fields: Array.from({ length: 20 }, (_, i) => ({
            label: `Question ${i}`,
            value: 'é'.repeat(10000),
            unknown: false,
          })),
          files: [],
        },
        now,
      ),
    /240,000/,
  );
  assert.throws(
    () =>
      db.sqlite
        .prepare(
          `INSERT INTO application_preparations (owner,job_id,actor,job_version,destination,fields,files,ready,armed_until,updated)
           VALUES (?,?,?,?,?,?,?,0,'',?)`,
        )
        .run(
          'alice',
          'alice-0',
          'agent',
          1,
          'https://employer.example/jobs/0',
          'x'.repeat(240001),
          '[]',
          now,
        ),
    /too large/,
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) c FROM application_preparations').get()
      .c,
    0,
  );
  db.sqlite.close();
});

void test('inspect of another owner job is unavailable', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Full name', value: 'Avery', unknown: false }],
      files: [],
    },
    now,
  );
  await assert.rejects(
    () => inspectApplication(db, 'bob', 'alice-0', now),
    /unavailable/i,
  );
  await assert.rejects(
    () => inspectApplication(db, 'alice', 'bob-0', now),
    /unavailable/i,
  );
  const empty = await inspectApplication(db, 'alice', 'alice-1', now);
  assert.equal(empty.job_id, 'alice-1');
  assert.equal(empty.destination, null);
  assert.deepEqual(empty.fields, []);
  assert.equal(empty.accept_enabled, false);
  db.sqlite.close();
});

void test('arm refuses incomplete or unknown fields and freezes a complete snapshot', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Full name', value: '', unknown: false }],
      files: [],
    },
    now,
  );
  await assert.rejects(
    () =>
      armPreparation(
        db,
        'alice',
        { job: 'alice-0', id: 'op-arm-0', actor: 'Fictional applying agent' },
        now,
      ),
    /complete/i,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Work authorization', value: 'Yes', unknown: false }],
      files: [],
    },
    now,
  );
  const armed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-arm-0', actor: 'Fictional applying agent' },
    now,
  );
  assert.equal(armed.ready, true);
  assert.equal(armed.armed, true);
  assert.equal(armed.accept_enabled, true);
  assert.equal(armed.state, 'proposed');
  const op = await loadOperation(db, 'alice', 'op-arm-0');
  assert.equal(op.state, 'proposed');
  db.sqlite.close();
});

void test('a concurrent prepare cannot arm the old payload behind newly displayed fields', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config({ review: 'all' }), now);
  const prepare = (value) => ({
    job: 'alice-0',
    actor: 'Fictional applying agent',
    destination: 'https://employer.example/jobs/0',
    fields: [{ label: 'Cover letter', value, unknown: false }],
    files: [],
  });
  await upsertPreparation(db, 'alice', prepare('Old payload'), now);
  const originalPrepare = db.prepare.bind(db);
  let release, reached;
  const paused = new Promise((resolve) => {
    reached = resolve;
  });
  const resume = new Promise((resolve) => {
    release = resolve;
  });
  let intercept = true;
  db.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (
      intercept &&
      sql ===
        'SELECT * FROM application_preparations WHERE owner=? AND job_id=?'
    ) {
      intercept = false;
      const bind = statement.bind;
      statement.bind = (...args) => {
        const bound = bind(...args);
        const first = bound.first.bind(bound);
        bound.first = async () => {
          const row = await first();
          reached();
          await resume;
          return row;
        };
        return bound;
      };
    }
    return statement;
  };
  const arming = armPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      id: 'race-op',
      actor: 'Fictional applying agent',
    },
    now,
  );
  await paused;
  await upsertPreparation(db, 'alice', prepare('New reviewed payload'), now);
  const refused = assert.rejects(arming, /Preparation changed/);
  release();
  await refused;
  const view = await inspectApplication(db, 'alice', 'alice-0', now);
  assert.equal(view.fields[0].value, 'New reviewed payload');
  assert.equal(view.operation_id, null);
  assert.equal(view.armed, false);
  assert.equal(view.accept_enabled, false);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) c FROM application_operations').get().c,
    0,
  );
  const before = counts(db);
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      { id: 'race-op', digest: 'stale', action: 'approve' },
      now,
    ),
    /not found/,
  );
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      { id: 'race-op', digest: 'stale', action: 'begin' },
      now,
    ),
    /not found/,
  );
  assert.deepEqual(counts(db), before);
  db.sqlite.close();
});

void test('approve without a live arm refuses; approve with arm authorizes and does not begin', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
    now,
  );
  const armed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-arm-1', actor: 'Fictional applying agent' },
    now,
  );
  const expired = '2026-09-07T12:00:21.000Z';
  await assert.rejects(
    async () =>
      actOnApplication(
        db,
        'alice',
        action(await loadOperation(db, 'alice', 'op-arm-1'), 'approve'),
        expired,
      ),
    /arm|presence|page/i,
  );
  const approved = await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-arm-1'), 'approve'),
    now,
  );
  assert.equal(approved.operation.state, 'authorized');
  assert.equal(approved.execute, undefined);
  assert.equal(armed.ready, true);
  const begun = await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-arm-1'), 'begin'),
    now,
  );
  assert.equal(begun.execute, true);
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      action(await loadOperation(db, 'alice', 'op-arm-1'), 'begin'),
      now,
    ),
  );
  await assert.rejects(
    () =>
      upsertPreparation(
        db,
        'alice',
        {
          job: 'alice-0',
          actor: 'Fictional applying agent',
          destination: 'https://employer.example/jobs/0',
          fields: [
            { label: 'Full name', value: 'Changed after send', unknown: false },
          ],
          files: [],
        },
        now,
      ),
    /execut/i,
  );
  db.sqlite.close();
});

const completePrep = (value = 'Avery Example') => ({
  job: 'alice-0',
  actor: 'Fictional applying agent',
  destination: 'https://employer.example/jobs/0',
  fields: [{ label: 'Full name', value, unknown: false }],
  files: [],
});
async function inspectAuthorize(db, owner, op, at = now) {
  const manifest = JSON.parse(op.manifest);
  await upsertPreparation(
    db,
    owner,
    {
      job: op.job_id,
      actor: op.actor,
      destination: manifest.destination,
      fields: manifest.fields.map((field) => ({
        ...field,
        unknown: false,
      })),
      files: manifest.files,
    },
    at,
  );
  await armPreparation(
    db,
    owner,
    { job: op.job_id, id: op.id, actor: op.actor },
    at,
  );
  await actOnApplication(db, owner, action(op, 'approve'), at);
  return loadOperation(db, owner, op.id);
}
function grantExplicitReview(db, id) {
  const result = db.sqlite
    .prepare(
      "UPDATE application_operations SET state='authorized', authority='explicit-review' WHERE id=? AND state='proposed'",
    )
    .run(id);
  assert.equal(result.changes, 1);
}

void test('prepare of a different digest cancels a frozen op so begin cannot execute', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep('Digest A'), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-prep-a', actor: 'Fictional applying agent' },
    now,
  );
  const frozen = await loadOperation(db, 'alice', 'op-prep-a');
  await actOnApplication(db, 'alice', action(frozen, 'approve'), now);
  await upsertPreparation(db, 'alice', completePrep('Digest B'), now);
  assert.equal(
    (await loadOperation(db, 'alice', 'op-prep-a')).state,
    'cancelled',
  );
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      action(await loadOperation(db, 'alice', 'op-prep-a'), 'begin'),
      now,
    ),
  );
  db.sqlite.close();
});

void test('same-digest prepare clears arm without cancel so re-arm then begin still works', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep(), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-prep-same', actor: 'Fictional applying agent' },
    now,
  );
  const expired = '2026-09-07T12:00:21.000Z';
  await upsertPreparation(db, 'alice', completePrep(), expired);
  assert.equal(
    (await loadOperation(db, 'alice', 'op-prep-same')).state,
    'proposed',
  );
  const stored = db.sqlite
    .prepare(
      'SELECT ready, armed_until, operation_id FROM application_preparations WHERE owner=? AND job_id=?',
    )
    .get('alice', 'alice-0');
  assert.equal(stored.ready, 0);
  assert.equal(stored.armed_until, '');
  assert.equal(stored.operation_id, 'op-prep-same');
  const view = await inspectApplication(db, 'alice', 'alice-0', expired);
  assert.equal(view.state, 'proposed');
  assert.equal(view.accept_enabled, false);
  const rearmed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-prep-same', actor: 'Fictional applying agent' },
    expired,
  );
  assert.equal(rearmed.state, 'proposed');
  assert.equal(rearmed.accept_enabled, true);
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-prep-same'), 'approve'),
    expired,
  );
  const begun = await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-prep-same'), 'begin'),
    expired,
  );
  assert.equal(begun.execute, true);
  db.sqlite.close();
});

void test('same-digest prepare after Accept keeps authorized freeze so re-arm does not cancel begin', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep(), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-prep-auth', actor: 'Fictional applying agent' },
    now,
  );
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-prep-auth'), 'approve'),
    now,
  );
  const later = '2026-09-07T12:00:10.000Z';
  await upsertPreparation(db, 'alice', completePrep(), later);
  const view = await inspectApplication(db, 'alice', 'alice-0', later);
  assert.equal(view.state, 'authorized');
  assert.equal(view.operation_id, 'op-prep-auth');
  assert.equal(view.accept_enabled, false);
  assert.equal(
    (await loadOperation(db, 'alice', 'op-prep-auth')).state,
    'authorized',
  );
  const rearmed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-prep-auth', actor: 'Fictional applying agent' },
    later,
  );
  assert.equal(rearmed.state, 'authorized');
  assert.equal(
    (await loadOperation(db, 'alice', 'op-prep-auth')).state,
    'authorized',
  );
  const begun = await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-prep-auth'), 'begin'),
    later,
  );
  assert.equal(begun.execute, true);
  db.sqlite.close();
});

void test('blocked job keeps accept_enabled false even while armed', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep(), now);
  const armed = await armPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      id: 'op-blocked-accept',
      actor: 'Fictional applying agent',
    },
    now,
  );
  assert.equal(armed.accept_enabled, true);
  db.sqlite
    .prepare(
      "UPDATE jobs SET blocker='Unknown required answer' WHERE id='alice-0'",
    )
    .run();
  const blocked = await inspectApplication(db, 'alice', 'alice-0', now);
  assert.equal(blocked.armed, true);
  assert.equal(blocked.state, 'proposed');
  assert.equal(blocked.accept_enabled, false);
  db.sqlite.close();
});

void test('expired arm approve names the absent operative; policy miss does not', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep(), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-409-copy', actor: 'Fictional applying agent' },
    now,
  );
  const op = await loadOperation(db, 'alice', 'op-409-copy');
  const expired = '2026-09-07T12:00:21.000Z';
  await assert.rejects(
    () => actOnApplication(db, 'alice', action(op, 'approve'), expired),
    (err) => {
      assert.equal(err.message, 'Operative is not on the page.');
      assert.equal(err.status, 409);
      return true;
    },
  );
  await changeApplicationPolicy(
    db,
    'alice',
    config({ version: 1, review: 'all', enabled: false }),
    now,
  );
  await assert.rejects(
    () => actOnApplication(db, 'alice', action(op, 'approve'), now),
    (err) => {
      assert.match(err.message, /No permission issued/);
      assert.doesNotMatch(err.message, /Operative is not on the page/);
      assert.equal(err.status, 409);
      return true;
    },
  );
  db.sqlite.close();
});

void test('skip cancels pre-begin operations for that job', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep(), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-skip', actor: 'Fictional applying agent' },
    now,
  );
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-skip'), 'approve'),
    now,
  );
  await cancelPreBeginForJob(db, 'alice', 'alice-0', now);
  assert.equal(
    (await loadOperation(db, 'alice', 'op-skip')).state,
    'cancelled',
  );
  const view = await inspectApplication(db, 'alice', 'alice-0', now);
  assert.equal(view.accept_enabled, false);
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      action(await loadOperation(db, 'alice', 'op-skip'), 'begin'),
      now,
    ),
  );
  db.sqlite.close();
});

void test('inspect accept_enabled requires a sendable Held or Ready job', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep(), now);
  const armed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-status', actor: 'Fictional applying agent' },
    now,
  );
  assert.equal(armed.accept_enabled, true);
  db.sqlite.prepare("UPDATE jobs SET status='Skip' WHERE id='alice-0'").run();
  const skipped = await inspectApplication(db, 'alice', 'alice-0', now);
  assert.equal(skipped.state, 'proposed');
  assert.equal(skipped.accept_enabled, false);
  db.sqlite.close();
});

void test('arm of a different digest cancels a pre-begin freeze', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Work authorization', value: 'Yes', unknown: false }],
      files: [],
    },
    now,
  );
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-arm-old', actor: 'Fictional applying agent' },
    now,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Work authorization', value: 'No', unknown: false }],
      files: [],
    },
    now,
  );
  const armed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-arm-new', actor: 'Fictional applying agent' },
    now,
  );
  assert.equal(armed.operation_id, 'op-arm-new');
  assert.equal(
    (await loadOperation(db, 'alice', 'op-arm-old')).state,
    'cancelled',
  );
  assert.equal(
    (await loadOperation(db, 'alice', 'op-arm-new')).state,
    'proposed',
  );
  db.sqlite.close();
});

void test('arm after cancel proposes a new freeze; cancelled is not a live arm', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
    now,
  );
  const first = await armPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      id: 'op-arm-cancelled',
      actor: 'Fictional applying agent',
    },
    now,
  );
  assert.equal(first.state, 'proposed');
  assert.equal(first.accept_enabled, true);
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-arm-cancelled'), 'cancel'),
    now,
  );
  const cancelled = await inspectApplication(db, 'alice', 'alice-0', now);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.accept_enabled, false);
  await assert.rejects(
    () =>
      armPreparation(
        db,
        'alice',
        {
          job: 'alice-0',
          id: 'op-arm-cancelled',
          actor: 'Fictional applying agent',
        },
        now,
      ),
    /review|already|id|content/i,
  );
  assert.equal(
    (await loadOperation(db, 'alice', 'op-arm-cancelled')).state,
    'cancelled',
  );
  const second = await armPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      id: 'op-arm-after-cancel',
      actor: 'Fictional applying agent',
    },
    now,
  );
  assert.equal(second.state, 'proposed');
  assert.equal(second.accept_enabled, true);
  assert.equal(second.operation_id, 'op-arm-after-cancel');
  assert.equal(
    (await loadOperation(db, 'alice', 'op-arm-cancelled')).state,
    'cancelled',
  );
  assert.equal(
    (await loadOperation(db, 'alice', 'op-arm-after-cancel')).state,
    'proposed',
  );
  db.sqlite.close();
});

void test('same-digest arm refuses executing and submitted operations', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
    now,
  );
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-arm-exec', actor: 'Fictional applying agent' },
    now,
  );
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-arm-exec'), 'approve'),
    now,
  );
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-arm-exec'), 'begin'),
    now,
  );
  await assert.rejects(
    () =>
      armPreparation(
        db,
        'alice',
        {
          job: 'alice-0',
          id: 'op-arm-exec',
          actor: 'Fictional applying agent',
        },
        now,
      ),
    /execut/i,
  );
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-arm-exec'), 'complete', {
      receipt: 'Fictional employer confirmation ABC',
    }),
    now,
  );
  await assert.rejects(
    () =>
      armPreparation(
        db,
        'alice',
        {
          job: 'alice-0',
          id: 'op-arm-exec',
          actor: 'Fictional applying agent',
        },
        now,
      ),
    /execut|payload/i,
  );
  db.sqlite.close();
});

void test('ordinary fields under sensitive review refuse inspect arm without leaving an authorized operation', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
    now,
  );
  await assert.rejects(
    () =>
      armPreparation(
        db,
        'alice',
        {
          job: 'alice-0',
          id: 'op-arm-sensitive-ordinary',
          actor: 'Fictional applying agent',
        },
        now,
      ),
    /review/i,
  );
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT COUNT(*) c FROM application_operations WHERE owner='alice'",
      )
      .get().c,
    0,
  );
  db.sqlite.close();
});

void test('exact fields/files survive proposal, restart, execution and confirmation without draft acceptance', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const body = proposal();
  const bytes = new TextEncoder().encode('Fictional resume\nExact second line');
  body.manifest.files = [
    {
      name: 'resume.txt',
      base64: btoa(new TextDecoder().decode(bytes)),
      sha256: await digest(bytes),
    },
  ];
  const op = await proposeApplication(db, 'alice', body, now);
  assert.equal(op.state, 'proposed');
  assert.equal(op.authority, 'review-required');
  assert.deepEqual(JSON.parse(op.manifest), body.manifest);
  assert.equal(JSON.parse(op.policy_snapshot).version, 1);
  assert.deepEqual(await proposeApplication(db, 'alice', body, now), op);
  await assert.rejects(
    actOnApplication(db, 'alice', action(op, 'begin'), now),
    /No permission issued/,
  );
  await inspectAuthorize(db, 'alice', op, now);
  const before = counts(db);
  assert.equal(
    (await actOnApplication(db, 'alice', action(op, 'begin'), now)).execute,
    true,
  );
  await assert.rejects(
    actOnApplication(db, 'alice', action(op, 'begin'), now),
    /No permission issued/,
  );
  assert.equal(counts(db).events, before.events + 1);
  const finished = await actOnApplication(
    db,
    'alice',
    action(op, 'complete', { receipt: 'Fictional employer confirmation ABC' }),
    now,
  );
  assert.equal(finished.operation.state, 'submitted');
  const job = db.sqlite.prepare('SELECT * FROM jobs WHERE id=?').get(body.job);
  assert.equal(job.status, 'Submitted');
  assert.equal(job.accepted_draft, null);
  assert.equal((await loadOperation(db, 'alice', op.id)).manifest, op.manifest);
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      action(op, 'complete', { receipt: 'replacement' }),
      now,
    ),
  );
  db.sqlite.close();
});

void test('policy-authority leftover cannot begin without explicit Inspect Accept', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const op = await proposeApplication(db, 'alice', proposal(), now);
  db.sqlite
    .prepare(
      "UPDATE application_operations SET state='authorized', authority='policy' WHERE id=?",
    )
    .run(op.id);
  await assert.rejects(
    actOnApplication(db, 'alice', action(op, 'begin'), now),
    (err) => {
      assert.match(err.message, /No permission issued/);
      assert.doesNotMatch(err.message, /Operative is not on the page/);
      return true;
    },
  );
  db.sqlite.close();
});

void test('two agents cannot start the same job or execute concurrently; uncertainty never frees its job', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const a = await proposeApplication(db, 'alice', proposal(), now);
  const other = await proposeApplication(db, 'alice', proposal(1), now);
  await inspectAuthorize(db, 'alice', a, now);
  const b = await proposeApplication(
    db,
    'alice',
    proposal(0, { id: 'other-agent', actor: 'Other agent' }),
    now,
  );
  grantExplicitReview(db, b.id);
  await inspectAuthorize(db, 'alice', other, now);
  await actOnApplication(db, 'alice', action(a, 'begin'), now);
  await assert.rejects(actOnApplication(db, 'alice', action(b, 'begin'), now));
  await assert.rejects(
    actOnApplication(db, 'alice', action(other, 'begin'), now),
  );
  await actOnApplication(
    db,
    'alice',
    action(a, 'uncertain', { receipt: 'Connection lost after click.' }),
    now,
  );
  await assert.rejects(actOnApplication(db, 'alice', action(b, 'begin'), now));
  await actOnApplication(db, 'alice', action(other, 'begin'), now);
  await actOnApplication(
    db,
    'alice',
    action(a, 'complete', { receipt: 'Confirmed by employer email.' }),
    now,
  );
  assert.ok(
    db.sqlite
      .prepare('SELECT detail FROM events WHERE kind=?')
      .get('Application outcome uncertain')
      .detail.includes('Connection lost after click.'),
  );
  db.sqlite.close();
});

void test('sensitive questions and changed destinations require exact review; wrong digest cannot approve', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const p = proposal();
  p.manifest.fields.push({
    label: 'Work authorization',
    value: 'Needs user input',
  });
  const op = await proposeApplication(db, 'alice', p, now);
  assert.equal(op.state, 'proposed');
  const before = counts(db);
  await assert.rejects(actOnApplication(db, 'alice', action(op, 'begin'), now));
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      { ...action(op, 'approve'), digest: 'wrong' },
      now,
    ),
  );
  assert.deepEqual(counts(db), before);
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [
        { label: 'Full name', value: 'Avery Example', unknown: false },
        {
          label: 'Work authorization',
          value: 'Needs user input',
          unknown: false,
        },
      ],
      files: [],
    },
    now,
  );
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: op.id, actor: 'Fictional applying agent' },
    now,
  );
  await actOnApplication(db, 'alice', action(op, 'approve'), now);
  assert.equal(
    (await loadOperation(db, 'alice', op.id)).authority,
    'explicit-review',
  );
  const redirected = proposal(1);
  redirected.manifest.destination = 'https://different.example/apply';
  assert.equal(
    (await proposeApplication(db, 'alice', redirected, now)).state,
    'proposed',
  );
  db.sqlite.close();
});

void test('stale job, revoked or expired policy, wrong owner and reused IDs refuse without changes', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const op = await proposeApplication(db, 'alice', proposal(), now);
  await inspectAuthorize(db, 'alice', op, now);
  const before = counts(db);
  await assert.rejects(loadOperation(db, 'bob', op.id));
  await assert.rejects(actOnApplication(db, 'bob', action(op, 'begin'), now));
  await assert.rejects(
    proposeApplication(db, 'alice', proposal(1, { id: op.id }), now),
  );
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      action(op, 'begin'),
      '2026-09-09T12:00:00.000Z',
    ),
  );
  assert.deepEqual(counts(db), before);
  await changeApplicationPolicy(
    db,
    'alice',
    config({ version: 1, enabled: false }),
    now,
  );
  await assert.rejects(actOnApplication(db, 'alice', action(op, 'begin'), now));
  await assert.rejects(
    changeApplicationPolicy(db, 'alice', config({ version: 1 }), now),
  );
  await changeApplicationPolicy(db, 'alice', config({ version: 2 }), now);
  await assert.rejects(actOnApplication(db, 'alice', action(op, 'begin'), now));
  const fresh = await proposeApplication(db, 'alice', proposal(1), now);
  await inspectAuthorize(db, 'alice', fresh, now);
  db.sqlite
    .prepare('UPDATE jobs SET version=version+1 WHERE id=?')
    .run('alice-1');
  await assert.rejects(
    actOnApplication(db, 'alice', action(fresh, 'begin'), now),
  );
  db.sqlite.close();
});

void test('disabling policy cannot send more than 100 job ids', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  await assert.rejects(
    changeApplicationPolicy(
      db,
      'alice',
      config({
        version: 1,
        enabled: false,
        jobs: Array.from({ length: 101 }, (_, i) => 'overflow-' + i),
      }),
      now,
    ),
    /at most 100 saved jobs/,
  );
  assert.equal((await loadApplicationPolicy(db, 'alice'))?.enabled, 1);
  await changeApplicationPolicy(
    db,
    'alice',
    config({ version: 1, enabled: false, jobs: [] }),
    now,
  );
  assert.equal((await loadApplicationPolicy(db, 'alice'))?.enabled, 0);
  db.sqlite.close();
});

void test('daily and policy capacity count uncertain starts and cannot be exceeded', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  for (let i = 0; i < 10; i++) {
    const op = await proposeApplication(db, 'alice', proposal(i), now);
    await inspectAuthorize(db, 'alice', op, now);
    await actOnApplication(db, 'alice', action(op, 'begin'), now);
    await actOnApplication(
      db,
      'alice',
      action(op, 'uncertain', { receipt: 'Fictional uncertain outcome' }),
      now,
    );
  }
  const eleventh = await proposeApplication(db, 'alice', proposal(10), now);
  await inspectAuthorize(db, 'alice', eleventh, now);
  const before = counts(db);
  await assert.rejects(
    actOnApplication(db, 'alice', action(eleventh, 'begin'), now),
  );
  assert.deepEqual(counts(db), before);
  const tomorrow = '2026-09-08T01:00:00.000Z';
  await actOnApplication(db, 'alice', action(eleventh, 'begin'), tomorrow);
  db.sqlite.close();
});

void test('malformed files and oversized content cannot produce a saved proposal', async () => {
  const p = proposal();
  p.manifest.files = [
    { name: 'resume.txt', base64: btoa('wrong bytes'), sha256: '0'.repeat(64) },
  ];
  await assert.rejects(validateManifest(p.manifest), /checksum/);
  p.manifest.files = [];
  p.manifest.fields = Array.from({ length: 20 }, (_, i) => ({
    label: `Question ${i}`,
    value: 'é'.repeat(10000),
  }));
  await assert.rejects(validateManifest(p.manifest), /240,000/);
});

void test('blockers and policy capacity prevent starts; explicit no-submission evidence permits a fresh proposal', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config({ maximum: 1 }), now);
  const op = await proposeApplication(db, 'alice', proposal(), now);
  await inspectAuthorize(db, 'alice', op, now);
  db.sqlite
    .prepare(
      "UPDATE jobs SET blocker='Unknown required answer' WHERE id='alice-0'",
    )
    .run();
  await assert.rejects(actOnApplication(db, 'alice', action(op, 'begin'), now));
  db.sqlite.prepare("UPDATE jobs SET blocker='' WHERE id='alice-0'").run();
  await actOnApplication(db, 'alice', action(op, 'begin'), now);
  await actOnApplication(
    db,
    'alice',
    action(op, 'not-submitted', {
      receipt: 'Observed empty form; never entered data or clicked submit.',
    }),
    now,
  );
  const fresh = await proposeApplication(
    db,
    'alice',
    proposal(0, { id: 'fresh' }),
    now,
  );
  await inspectAuthorize(db, 'alice', fresh, now);
  await assert.rejects(
    actOnApplication(db, 'alice', action(fresh, 'begin'), now),
  );
  await changeApplicationPolicy(
    db,
    'alice',
    config({ version: 1, maximum: 2 }),
    now,
  );
  const newlyPermitted = await proposeApplication(
    db,
    'alice',
    proposal(0, { id: 'new-policy' }),
    now,
  );
  grantExplicitReview(db, newlyPermitted.id);
  await actOnApplication(db, 'alice', action(newlyPermitted, 'begin'), now);
  assert.equal(
    (await loadOperation(db, 'alice', op.id)).state,
    'not-submitted',
  );
  db.sqlite.close();
});

void test('database protects exact evidence and caps history across insertion paths', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const op = await proposeApplication(db, 'alice', proposal(), now);
  for (const column of [
    'owner',
    'manifest',
    'digest',
    'policy_snapshot',
    'job_id',
  ]) {
    assert.throws(
      () =>
        db.sqlite
          .prepare(`UPDATE application_operations SET ${column}=? WHERE id=?`)
          .run('altered', op.id),
      /immutable/,
    );
  }
  const cols = Object.keys(op),
    values = Object.values(op);
  const insert = db.sqlite.prepare(
    `INSERT INTO application_operations (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
  );
  for (let i = 1; i < 500; i++) {
    const row = [...values];
    row[cols.indexOf('id')] = `capacity-${i}`;
    insert.run(...row);
  }
  const row = [...values];
  row[cols.indexOf('id')] = 'over-cap';
  assert.throws(() => insert.run(...row), /storage limit/);
  assert.equal((await loadOperation(db, 'alice', op.id)).manifest, op.manifest);
  await changeApplicationPolicy(
    db,
    'alice',
    config({ version: 1, enabled: false }),
    '2026-10-01T00:00:00.000Z',
  );
  db.sqlite.close();
});

void test('0010 drops and recreates the preparations capacity trigger with the existing-row exception', () => {
  const files = readdirSync('drizzle').filter(
    (f) => f.startsWith('0010_') && f.endsWith('.sql'),
  );
  assert.equal(files.length, 1);
  const sql = readFileSync(`drizzle/${files[0]}`, 'utf8');
  assert.match(sql, /DROP TRIGGER IF EXISTS application_preparations_capacity/);
  assert.match(
    sql,
    /WHEN \(SELECT COUNT\(\*\) FROM application_preparations WHERE owner=NEW\.owner\)>=500 AND NOT EXISTS \(SELECT 1 FROM application_preparations WHERE owner=NEW\.owner AND job_id=NEW\.job_id\)/,
  );
});

void test('preparations cap allows overwrite of an existing job at 500 and aborts a 501st distinct job', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  await upsertPreparation(db, 'alice', completePrep(), now);
  const template = db.sqlite
    .prepare(
      'SELECT * FROM application_preparations WHERE owner=? AND job_id=?',
    )
    .get('alice', 'alice-0');
  const cols = Object.keys(template);
  const insert = db.sqlite.prepare(
    `INSERT INTO application_preparations (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
  );
  for (let i = 1; i < 500; i++) {
    const row = cols.map((col) => template[col]);
    row[cols.indexOf('job_id')] = `capacity-${i}`;
    insert.run(...row);
  }
  assert.equal(
    db.sqlite
      .prepare('SELECT COUNT(*) c FROM application_preparations WHERE owner=?')
      .get('alice').c,
    500,
  );
  await upsertPreparation(db, 'alice', completePrep('Updated at cap'), now);
  const stored = db.sqlite
    .prepare(
      'SELECT fields FROM application_preparations WHERE owner=? AND job_id=?',
    )
    .get('alice', 'alice-0');
  assert.match(stored.fields, /Updated at cap/);
  const extra = cols.map((col) => template[col]);
  extra[cols.indexOf('job_id')] = 'over-cap';
  assert.throws(() => insert.run(...extra), /storage limit/);
  db.sqlite.close();
});

void test('workspace Skip save cancels pre-begin operations', async () => {
  const src = readFileSync('app/api/workspace/route.ts', 'utf8');
  assert.match(src, /cancelPreBeginForJob/);
  assert.match(src, /b\.status === ['"]Skip['"]/);
});

void test('overlapping uncertainty reports persist only the first report', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const op = await proposeApplication(db, 'alice', proposal(), now);
  await inspectAuthorize(db, 'alice', op, now);
  await actOnApplication(db, 'alice', action(op, 'begin'), now);
  const reports = await Promise.allSettled([
    actOnApplication(
      db,
      'alice',
      action(op, 'uncertain', { receipt: 'First observation' }),
      now,
    ),
    actOnApplication(
      db,
      'alice',
      action(op, 'uncertain', { receipt: 'Later conflicting observation' }),
      now,
    ),
  ]);
  assert.equal(reports.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await loadOperation(db, 'alice', op.id)).receipt,
    'First observation',
  );
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM events WHERE kind='Application outcome uncertain'",
      )
      .get().n,
    1,
  );
  db.sqlite.close();
});

void test('148KB fictional resume round-trips exactly within unchanged gateway limits', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const bytes = Buffer.alloc(148000, 65),
    input = proposal();
  input.manifest.files = [
    {
      name: 'fictional-resume.txt',
      base64: bytes.toString('base64'),
      sha256: await digest(bytes),
    },
  ];
  const serialized = JSON.stringify({
    ...input,
    action: 'propose',
    viewer: 'alice',
  });
  assert.ok(Buffer.byteLength(serialized) < 248000);
  const op = await proposeApplication(db, 'alice', input, now);
  assert.deepEqual(
    Buffer.from(JSON.parse(op.manifest).files[0].base64, 'base64'),
    bytes,
  );
  db.sqlite.close();
});

void test('completion reconciles progress edits and preserves later terminal status', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const first = await proposeApplication(db, 'alice', proposal(), now);
  await inspectAuthorize(db, 'alice', first, now);
  await actOnApplication(db, 'alice', action(first, 'begin'), now);
  db.sqlite
    .prepare(
      "UPDATE jobs SET version=version+1,draft='Newer unsent draft',blocker='Later follow-up question' WHERE id='alice-0'",
    )
    .run();
  await actOnApplication(
    db,
    'alice',
    action(first, 'complete', { receipt: 'Observed confirmation' }),
    now,
  );
  const saved = db.sqlite
    .prepare("SELECT * FROM jobs WHERE id='alice-0'")
    .get();
  assert.equal(saved.status, 'Submitted');
  assert.equal(saved.receipt, 'Observed confirmation');
  assert.equal(saved.draft, 'Newer unsent draft');
  assert.equal(saved.blocker, 'Later follow-up question');
  assert.equal(saved.version, 3);
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM outcomes WHERE job_id='alice-0' AND kind='submitted'",
      )
      .get().n,
    1,
  );
  const second = await proposeApplication(db, 'alice', proposal(1), now);
  await inspectAuthorize(db, 'alice', second, now);
  await actOnApplication(db, 'alice', action(second, 'begin'), now);
  db.sqlite
    .prepare(
      "UPDATE jobs SET version=version+1,status='Closed',receipt='Later closure evidence' WHERE id='alice-1'",
    )
    .run();
  await actOnApplication(
    db,
    'alice',
    action(second, 'complete', { receipt: 'Earlier submission confirmed' }),
    now,
  );
  const terminal = db.sqlite
    .prepare("SELECT * FROM jobs WHERE id='alice-1'")
    .get();
  assert.equal(terminal.status, 'Closed');
  assert.equal(terminal.receipt, 'Later closure evidence');
  assert.equal(
    (await loadOperation(db, 'alice', second.id)).receipt,
    'Earlier submission confirmed',
  );
  db.sqlite.close();
});

void test('answer fills a blocked inspect field without replacing stored files', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  const bytes = new TextEncoder().encode('Fictional resume for blocked answer');
  const file = {
    name: 'resume.txt',
    base64: btoa(new TextDecoder().decode(bytes)),
    sha256: await digest(bytes),
  };
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [
        { label: 'Full name', value: 'Avery Example', unknown: false },
        { label: 'Work authorization', value: '', unknown: true },
      ],
      files: [file],
    },
    now,
  );
  const answered = await answerPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      label: 'Work authorization',
      value: 'Authorized to work in the example country',
    },
    now,
  );
  const work = answered.fields.find(
    (field) => field.label === 'Work authorization',
  );
  assert.equal(work?.unknown, false);
  assert.equal(work?.filled, true);
  assert.equal(work?.value, 'Authorized to work in the example country');
  assert.equal(answered.files.length, 1);
  assert.equal(answered.files[0].name, 'resume.txt');
  assert.equal(answered.files[0].sha256, file.sha256);
  assert.equal('base64' in answered.files[0], false);
  assert.equal(answered.accept_enabled, false);
  assert.equal(answered.ready, false);
  assert.equal(answered.armed, false);
  const stored = db.sqlite
    .prepare(
      'SELECT actor, files, ready, armed_until FROM application_preparations WHERE owner=? AND job_id=?',
    )
    .get('alice', 'alice-0');
  assert.equal(stored.actor, 'Fictional applying agent');
  assert.equal(stored.ready, 0);
  assert.equal(stored.armed_until, '');
  const storedFiles = JSON.parse(stored.files);
  assert.equal(storedFiles[0].name, 'resume.txt');
  assert.equal(storedFiles[0].sha256, file.sha256);
  assert.equal(storedFiles[0].base64, file.base64);
  const armed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-answer-1', actor: 'Fictional applying agent' },
    now,
  );
  assert.equal(armed.accept_enabled, true);
  db.sqlite.close();
});

void test('answer refuses empty value, oversized value, missing preparation, missing label, executing op, and another owner job', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [
        { label: 'Full name', value: 'Avery Example', unknown: false },
        { label: 'Work authorization', value: '', unknown: true },
      ],
      files: [],
    },
    now,
  );
  await assert.rejects(
    () =>
      answerPreparation(
        db,
        'alice',
        { job: 'alice-0', label: 'Work authorization', value: '' },
        now,
      ),
    /invalid field|empty/i,
  );
  await assert.rejects(
    () =>
      answerPreparation(
        db,
        'alice',
        {
          job: 'alice-0',
          label: 'Work authorization',
          value: 'x'.repeat(20001),
        },
        now,
      ),
    /invalid field|20,?000/i,
  );
  await assert.rejects(
    () =>
      answerPreparation(
        db,
        'alice',
        { job: 'alice-1', label: 'Work authorization', value: 'Yes' },
        now,
      ),
    /prepar/i,
  );
  await assert.rejects(
    () =>
      answerPreparation(
        db,
        'alice',
        { job: 'alice-0', label: 'Salary expectation', value: 'Example range' },
        now,
      ),
    /invalid field|label/i,
  );
  await assert.rejects(
    () =>
      answerPreparation(
        db,
        'alice',
        { job: 'bob-0', label: 'Work authorization', value: 'Yes' },
        now,
      ),
    /unavailable/i,
  );
  await upsertPreparation(db, 'alice', completePrep(), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-answer-exec', actor: 'Fictional applying agent' },
    now,
  );
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-answer-exec'), 'approve'),
    now,
  );
  await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-answer-exec'), 'begin'),
    now,
  );
  await assert.rejects(
    () =>
      answerPreparation(
        db,
        'alice',
        { job: 'alice-0', label: 'Full name', value: 'Changed after send' },
        now,
      ),
    /execut/i,
  );
  db.sqlite.close();
});

void test('answer of a different digest cancels a pre-begin freeze', async () => {
  const db = database();
  await changeApplicationPolicy(
    db,
    'alice',
    { ...config(), review: 'all' },
    now,
  );
  await upsertPreparation(db, 'alice', completePrep('Digest A'), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-answer-a', actor: 'Fictional applying agent' },
    now,
  );
  const frozen = await loadOperation(db, 'alice', 'op-answer-a');
  await actOnApplication(db, 'alice', action(frozen, 'approve'), now);
  await answerPreparation(
    db,
    'alice',
    { job: 'alice-0', label: 'Full name', value: 'Digest B' },
    now,
  );
  assert.equal(
    (await loadOperation(db, 'alice', 'op-answer-a')).state,
    'cancelled',
  );
  const view = await inspectApplication(db, 'alice', 'alice-0', now);
  assert.equal(view.accept_enabled, false);
  await assert.rejects(
    actOnApplication(
      db,
      'alice',
      action(await loadOperation(db, 'alice', 'op-answer-a'), 'begin'),
      now,
    ),
  );
  db.sqlite.close();
});

function pauseNextBatch(db) {
  const original = db.batch.bind(db);
  let reached, release;
  const paused = new Promise((resolve) => {
    reached = resolve;
  });
  const resume = new Promise((resolve) => {
    release = resolve;
  });
  db.batch = async (statements) => {
    db.batch = original;
    reached();
    await resume;
    return original(statements);
  };
  return { paused, release: () => release() };
}

async function authorizedPreparation(db) {
  await changeApplicationPolicy(db, 'alice', config({ review: 'all' }), now);
  const view = await upsertPreparation(db, 'alice', completePrep(), now);
  await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'race-authorized', actor: 'Fixture agent' },
    now,
  );
  const op = await loadOperation(db, 'alice', 'race-authorized');
  await actOnApplication(db, 'alice', action(op, 'approve'), now);
  return { view, op };
}

for (const mutation of ['prepare', 'answer']) {
  for (const winner of ['begin', 'edit']) {
    for (const same of [false, true]) {
      void test(`${mutation}/begin is atomic when ${winner} wins with ${same ? 'same' : 'changed'} content`, async () => {
        const db = database();
        const { view, op } = await authorizedPreparation(db);
        const value = same ? view.fields[0].value : 'Updated exact answer';
        const edit = () =>
          mutation === 'prepare'
            ? replaceCurrentPreparation(
                db,
                'alice',
                {
                  ...completePrep(),
                  fields: [
                    { label: view.fields[0].label, value, unknown: false },
                  ],
                  preparation_revision: view.preparation_revision,
                },
                now,
              )
            : answerCurrentPreparation(
                db,
                'alice',
                {
                  job: 'alice-0',
                  label: view.fields[0].label,
                  value,
                  preparation_revision: view.preparation_revision,
                },
                now,
              );
        const begin = () =>
          actOnApplication(db, 'alice', action(op, 'begin'), now);
        const pause = pauseNextBatch(db);
        const loser = winner === 'begin' ? edit() : begin();
        // Attach before releasing the controlled race, including the permitted
        // same-content case where editing wins and exact authorization survives.
        const outcome = loser.then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await pause.paused;
        const won = winner === 'begin' ? await begin() : await edit();
        const stable = await inspectApplication(db, 'alice', 'alice-0', now);
        const history = counts(db);
        pause.release();
        const result = await outcome;
        if (winner === 'edit' && same) {
          assert.equal(result.value.execute, true);
          assert.equal(
            JSON.parse(result.value.operation.manifest).fields[0].value,
            value,
          );
        } else {
          assert.equal(result.error.status, 409);
          assert.deepEqual(
            await inspectApplication(db, 'alice', 'alice-0', now),
            stable,
          );
          assert.deepEqual(counts(db), history);
        }
        const saved = await loadOperation(db, 'alice', op.id);
        assert.equal(
          saved.state,
          winner === 'begin' || same ? 'executing' : 'cancelled',
        );
        assert.equal(
          JSON.parse(saved.manifest).fields[0].value,
          view.fields[0].value,
        );
        if (winner === 'begin') assert.equal(won.execute, true);
        db.sqlite.close();
      });
    }
  }
}

void test('stale prepare after an answer and concurrent answers cannot erase newer work', async () => {
  const db = database();
  const initial = await upsertPreparation(
    db,
    'alice',
    {
      ...completePrep(),
      fields: [
        { label: 'One', value: '', unknown: true },
        { label: 'Two', value: '', unknown: true },
      ],
    },
    now,
  );
  const answer = (label, value) =>
    answerCurrentPreparation(
      db,
      'alice',
      {
        job: 'alice-0',
        label,
        value,
        preparation_revision: initial.preparation_revision,
      },
      now,
    );
  const pause = pauseNextBatch(db);
  const first = answer('One', 'Older answer').then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await pause.paused;
  const newer = await answer('Two', 'Newer answer');
  const before = counts(db);
  pause.release();
  assert.equal((await first).error.status, 409);
  await assert.rejects(
    replaceCurrentPreparation(
      db,
      'alice',
      {
        ...completePrep(),
        preparation_revision: initial.preparation_revision,
      },
      now,
    ),
    /Preparation changed/,
  );
  assert.deepEqual(
    await inspectApplication(db, 'alice', 'alice-0', now),
    newer,
  );
  assert.deepEqual(counts(db), before);
  assert.equal(newer.fields[0].value, '');
  assert.equal(newer.fields[1].value, 'Newer answer');
  assert.notEqual(newer.preparation_revision, initial.preparation_revision);
  db.sqlite.close();
});

void test('a stale arm cannot create history or cancel a newer accepted operation', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config({ review: 'all' }), now);
  const first = await upsertPreparation(db, 'alice', completePrep(), now);
  const pause = pauseNextBatch(db);
  const stale = armCurrentPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      id: 'stale-arm',
      actor: 'Fixture agent',
      preparation_revision: first.preparation_revision,
    },
    now,
  ).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await pause.paused;
  const newer = await upsertPreparation(
    db,
    'alice',
    {
      ...completePrep(),
      fields: [{ label: 'Full name', value: 'Newer name', unknown: false }],
    },
    now,
  );
  await armCurrentPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      id: 'new-arm',
      actor: 'Fixture agent',
      preparation_revision: newer.preparation_revision,
    },
    now,
  );
  const op = await loadOperation(db, 'alice', 'new-arm');
  await actOnApplication(db, 'alice', action(op, 'approve'), now);
  const before = counts(db);
  const current = await inspectApplication(db, 'alice', 'alice-0', now);
  pause.release();
  assert.equal((await stale).error.status, 409);
  assert.deepEqual(counts(db), before);
  assert.deepEqual(
    await inspectApplication(db, 'alice', 'alice-0', now),
    current,
  );
  assert.equal((await loadOperation(db, 'alice', op.id)).state, 'authorized');
  db.sqlite.close();
});

void test('preparation revision is required and uncertain work remains locked', async () => {
  const db = database();
  await assert.rejects(
    replaceCurrentPreparation(db, 'alice', completePrep(), now),
    /preparation_revision/,
  );
  const { view, op } = await authorizedPreparation(db);
  await actOnApplication(db, 'alice', action(op, 'begin'), now);
  await actOnApplication(
    db,
    'alice',
    action(op, 'uncertain', {
      receipt: 'Fictional interrupted operation; do not retry.',
    }),
    now,
  );
  const before = counts(db);
  const current = await inspectApplication(db, 'alice', 'alice-0', now);
  await assert.rejects(
    replaceCurrentPreparation(
      db,
      'alice',
      { ...completePrep(), preparation_revision: view.preparation_revision },
      now,
    ),
    /locked/,
  );
  await assert.rejects(
    answerCurrentPreparation(
      db,
      'alice',
      {
        job: 'alice-0',
        label: view.fields[0].label,
        value: 'Changed',
        preparation_revision: view.preparation_revision,
      },
      now,
    ),
    /locked/,
  );
  await assert.rejects(
    armCurrentPreparation(
      db,
      'alice',
      {
        job: 'alice-0',
        id: 'after-uncertain',
        actor: 'Fixture agent',
        preparation_revision: view.preparation_revision,
      },
      now,
    ),
    /locked/,
  );
  assert.deepEqual(counts(db), before);
  assert.deepEqual(
    await inspectApplication(db, 'alice', 'alice-0', now),
    current,
  );
  db.sqlite.close();
});

void test('preparation revision migration preserves legacy snapshots and requires their empty token', async () => {
  const db = database();
  // Model the schema before the additive migration, preserving an existing row.
  db.sqlite.exec('ALTER TABLE application_preparations DROP COLUMN revision');
  db.sqlite
    .prepare(`INSERT INTO application_preparations
    (owner,job_id,actor,job_version,destination,fields,files,operation_id,ready,armed_until,updated)
    VALUES ('alice','alice-0','Legacy fixture',1,'https://employer.example/jobs/0',?, '[]',NULL,0,'',?)`)
    .run(JSON.stringify(completePrep().fields), now);
  const before = db.sqlite
    .prepare('SELECT * FROM application_preparations')
    .get();
  db.sqlite.exec(
    readFileSync('drizzle/0011_application_preparation_revision.sql', 'utf8'),
  );
  const { revision, ...saved } = db.sqlite
    .prepare('SELECT * FROM application_preparations')
    .get();
  assert.equal(revision, '');
  assert.deepEqual({ ...saved }, { ...before });
  const view = await inspectApplication(db, 'alice', 'alice-0', now);
  assert.equal(view.preparation_revision, '');
  await assert.rejects(
    replaceCurrentPreparation(
      db,
      'alice',
      { ...completePrep(), preparation_revision: null },
      now,
    ),
    /Preparation changed/,
  );
  assert.deepEqual(await inspectApplication(db, 'alice', 'alice-0', now), view);
  const revised = await replaceCurrentPreparation(
    db,
    'alice',
    { ...completePrep(), preparation_revision: '' },
    now,
  );
  assert.equal(typeof revised.preparation_revision, 'string');
  assert.notEqual(revised.preparation_revision, '');
  db.sqlite.close();
});

void test('marking an accepted answer unknown revokes its permit even with identical text', async () => {
  const db = database();
  const { view, op } = await authorizedPreparation(db);
  const changed = await replaceCurrentPreparation(
    db,
    'alice',
    {
      ...completePrep(),
      preparation_revision: view.preparation_revision,
      fields: view.fields.map(({ label, value }) => ({
        label,
        value,
        unknown: true,
      })),
    },
    now,
  );
  assert.equal(changed.operation_id, null);
  assert.equal((await loadOperation(db, 'alice', op.id)).state, 'cancelled');
  const before = counts(db);
  await assert.rejects(
    actOnApplication(db, 'alice', action(op, 'begin'), now),
    /No permission/,
  );
  assert.deepEqual(counts(db), before);
  db.sqlite.close();
});
