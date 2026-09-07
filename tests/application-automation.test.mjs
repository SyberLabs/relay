import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  actOnApplication,
  changeApplicationPolicy,
  proposeApplication,
  loadOperation,
  validateManifest,
  digest,
} from '../lib/application-automation.ts';

const now = '2026-09-07T12:00:00.000Z';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${f}`, 'utf8'));
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
    async batch(statements) {
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
  assert.equal(op.authority, 'policy');
  assert.deepEqual(JSON.parse(op.manifest), body.manifest);
  assert.equal(JSON.parse(op.policy_snapshot).version, 1);
  assert.deepEqual(await proposeApplication(db, 'alice', body, now), op);
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

void test('two agents cannot start the same job or execute concurrently; uncertainty never frees its job', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const a = await proposeApplication(db, 'alice', proposal(), now);
  const b = await proposeApplication(
    db,
    'alice',
    proposal(0, { id: 'other-agent', actor: 'Other agent' }),
    now,
  );
  const other = await proposeApplication(db, 'alice', proposal(1), now);
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
  db.sqlite
    .prepare('UPDATE jobs SET version=version+1 WHERE id=?')
    .run('alice-1');
  await assert.rejects(
    actOnApplication(db, 'alice', action(fresh, 'begin'), now),
  );
  db.sqlite.close();
});

void test('daily and policy capacity count uncertain starts and cannot be exceeded', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  for (let i = 0; i < 10; i++) {
    const op = await proposeApplication(db, 'alice', proposal(i), now);
    await actOnApplication(db, 'alice', action(op, 'begin'), now);
    await actOnApplication(
      db,
      'alice',
      action(op, 'uncertain', { receipt: 'Fictional uncertain outcome' }),
      now,
    );
  }
  const eleventh = await proposeApplication(db, 'alice', proposal(10), now);
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
  await assert.rejects(validateManifest(p.manifest), /180,000/);
});

void test('blockers and policy capacity prevent starts; explicit no-submission evidence permits a fresh proposal', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config({ maximum: 1 }), now);
  const op = await proposeApplication(db, 'alice', proposal(), now);
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
