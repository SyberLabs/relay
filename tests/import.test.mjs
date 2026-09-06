import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { obsidianRow, obsidianExample } from '../lib/obsidian.ts';
import {
  readTrackerCsv,
  suggestTrackerMapping,
  trackerRows,
} from '../lib/tracker-csv.ts';
import {
  classify,
  displayName,
  importedBlocker,
  importedJobStatus,
  jobKey,
  mergeJobStatus,
  validateEdit,
} from '../lib/domain.ts';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

void test('Obsidian reimports preserve active jobs and accepted drafts while keeping note revisions', () => {
  const db = open();
  try {
    for (const status of ['Held', 'Ready', 'Submitted', 'Skip', 'Live loop']) {
      const owner = 'obsidian-' + status;
      const row = obsidianRow(obsidianExample);
      importRow(db, owner, row);
      db.prepare(
        'UPDATE jobs SET status=?,draft=?,accepted_draft=?,version=5 WHERE owner=?',
      ).run(
        status,
        'Reviewed draft',
        status === 'Ready' ? 'Reviewed draft' : null,
        owner,
      );
      const before = jobOf(db, owner, row.Job);
      importRow(db, owner, row);
      assert.equal(observationsOf(db, owner).length, 1);
      importRow(
        db,
        owner,
        obsidianRow(obsidianExample + '\nInterview notes updated.'),
      );
      const after = jobOf(db, owner, row.Job);
      assert.equal(after.status, before.status);
      assert.equal(after.draft, before.draft);
      assert.equal(after.accepted_draft, before.accepted_draft);
      assert.equal(observationsOf(db, owner).length, 2);
    }
  } finally {
    db.close();
  }
});
const drizzle = join(root, 'drizzle');
const routeSrc = readFileSync(join(root, 'app/api/workspace/route.ts'), 'utf8');
function applyMigrations(
  db,
  names = readdirSync(drizzle)
    .filter((f) => f.endsWith('.sql'))
    .sort(),
) {
  for (const name of names)
    for (const part of readFileSync(join(drizzle, name), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      const sql = part.trim();
      if (sql) db.exec(sql);
    }
}
function sqlFromRoute(kind) {
  if (kind === 'job') {
    const start = routeSrc.indexOf('INSERT INTO jobs');
    return routeSrc.slice(start, routeSrc.indexOf('`', start));
  }
  const start = routeSrc.indexOf('INSERT OR IGNORE INTO observations');
  return routeSrc.slice(start, routeSrc.indexOf("'", start));
}
function open() {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db);
  return db;
}
function source(
  status,
  job,
  notes = '',
  url = 'https://example.com/research/' + job + status + notes,
) {
  return {
    url,
    Name: 'Example — Role',
    Job: job,
    Status: status,
    Notes: notes,
  };
}
function importRow(db, owner, r, now = '2026-01-01T00:00:00.000Z') {
  const key = jobKey(r.Job, r.url);
  db.prepare(sqlFromRoute('job')).run(
    crypto.randomUUID(),
    owner,
    key,
    displayName(r.Name),
    r.Job,
    importedJobStatus(r.Status),
    importedBlocker(r.Notes) || '',
    '',
    now,
    // Posting attributes from the read plane. Hand-written imports omit them,
    // so these are the defaults the route coerces to.
    r.company ?? '',
    r.level ?? '',
    r.remote ?? '',
    r.comp_min ?? null,
    r.comp_max ?? null,
    r.location ?? '',
    r.posted ?? null,
    r.source ?? '',
    r.effort ?? 20,
  );
  db.prepare(sqlFromRoute('obs')).run(
    crypto.randomUUID(),
    owner,
    key,
    r.url,
    r.Name,
    r.Status,
    r.Notes || '',
    r.createdTime || now,
  );
}
function jobOf(db, owner, job) {
  return db
    .prepare('SELECT * FROM jobs WHERE owner=? AND job_key=?')
    .get(owner, jobKey(job, job));
}
function observationsOf(db, owner) {
  return db
    .prepare(
      'SELECT * FROM observations WHERE owner=? ORDER BY created, source_url',
    )
    .all(owner);
}

void test('tracker research preserves all local states and acceptance, deduplicates repeats and retains revisions', () => {
  const db = open();
  try {
    const csv = readTrackerCsv(
      'Company,Role,URL,Status,Notes\nExample,Engineer,https://example.com/job,Offer,First research',
    );
    const mapping = suggestTrackerMapping(csv.headers);
    const [row] = trackerRows(csv, mapping, 'Simplify');
    for (const status of ['Held', 'Ready', 'Submitted', 'Skip', 'Live loop']) {
      const owner = 'tracker-' + status;
      importRow(db, owner, row);
      assert.equal(jobOf(db, owner, row.Job).status, 'Held');
      db.prepare(
        'UPDATE jobs SET status=?,draft=?,accepted_draft=?,version=4 WHERE owner=?',
      ).run(
        status,
        'Exact draft',
        status === 'Ready' ? 'Exact draft' : null,
        owner,
      );
      const before = jobOf(db, owner, row.Job);
      importRow(db, owner, row);
      assert.equal(observationsOf(db, owner).length, 1);
      const revised = readTrackerCsv(
        'Company,Role,URL,Status,Notes\nExample,Engineer,https://example.com/job,Rejected,Changed research',
      );
      importRow(db, owner, trackerRows(revised, mapping, 'Simplify')[0]);
      const after = jobOf(db, owner, row.Job);
      assert.equal(after.status, before.status);
      assert.equal(after.draft, before.draft);
      assert.equal(after.accepted_draft, before.accepted_draft);
      assert.equal(after.version, before.version + 2);
      assert.equal(observationsOf(db, owner).length, 2);
    }
  } finally {
    db.close();
  }
});
void test('import upsert SQL and observation insert are the workspace statements', () => {
  assert.match(routeSrc, /importedJobStatus\(r\.Status\)/);
  assert.equal(sqlFromRoute('job').startsWith('INSERT INTO jobs'), true);
  assert.equal(
    sqlFromRoute('obs').startsWith('INSERT OR IGNORE INTO observations'),
    true,
  );
});
void test('bootstrap writes empty drafts without a packets table', () => {
  assert.equal(existsSync(join(root, 'lib/packets.ts')), false);
  assert.doesNotMatch(routeSrc, /packets/);
  assert.match(routeSrc, /importedBlocker\(r\.Notes\),\s*''/);
});
void test('GrokCell is not vendored and CI does not gate on bundled templates', () => {
  assert.equal(existsSync(join(root, 'grokcell')), false);
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.doesNotMatch(ci, /\bgrokcell\b/);
  assert.doesNotMatch(ci, /Bundled agent contracts/);
  assert.doesNotMatch(ci, /^\s+templates:/m);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /https:\/\/github.com\/sdcarlson\/grokcell/);
  assert.doesNotMatch(readme, /\]\(grokcell\//);
});
void test('Live loop outranks Submitted in both import orders and keeps drafts', () => {
  const owner = 'owner-a';
  const job = 'https://example.com/jobs/loop';
  for (const order of [
    ['Live loop', 'Submitted'],
    ['Submitted', 'Live loop'],
  ]) {
    const db = open();
    db.prepare(sqlFromRoute('job')).run(
      crypto.randomUUID(),
      owner,
      jobKey(job, job),
      'Role',
      job,
      importedJobStatus(order[0]),
      '',
      'keep this draft',
      '2026-01-01T00:00:00.000Z',
      '',
      '',
      '',
      null,
      null,
      '',
      null,
      '',
      20,
    );
    importRow(db, owner, source(order[1], job, 'second look'));
    const row = jobOf(db, owner, job);
    assert.equal(row.status, 'Live loop');
    assert.equal(row.draft, 'keep this draft');
  }
});
void test('repeated imports keep Live loop and every source observation', () => {
  const db = open();
  const owner = 'owner-a';
  const job = 'https://example.com/jobs/loop';
  for (const [i, status] of [
    'Live loop',
    'Submitted',
    'Held',
    'Submitted',
    'Live loop',
  ].entries())
    importRow(db, owner, source(status, job, status + i));
  assert.equal(jobOf(db, owner, job).status, 'Live loop');
  assert.equal(observationsOf(db, owner).length, 5);
});
void test('new Ready import is Held with no accepted draft; observation stays Ready', () => {
  const db = open();
  const owner = 'owner-a';
  const job = 'https://example.com/jobs/ready';
  importRow(db, owner, source('Ready', job, 'research only'));
  const row = jobOf(db, owner, job);
  assert.equal(row.status, 'Held');
  assert.equal(row.draft, '');
  assert.equal(row.accepted_draft, null);
  const [obs] = observationsOf(db, owner);
  assert.equal(obs.status, 'Ready');
});
void test('duplicate Ready import does not replace a local accepted draft', () => {
  const db = open();
  const owner = 'owner-a';
  const job = 'https://example.com/jobs/ready';
  importRow(db, owner, source('Held', job, 'first'));
  db.prepare(
    "UPDATE jobs SET status='Ready', draft=?, accepted_draft=?, version=version+1 WHERE owner=?",
  ).run('Exact accepted text', 'Exact accepted text', owner);
  importRow(db, owner, source('Ready', job, 'repeat'));
  const row = jobOf(db, owner, job);
  assert.equal(row.status, 'Ready');
  assert.equal(row.accepted_draft, 'Exact accepted text');
  assert.equal(row.draft, 'Exact accepted text');
  assert.equal(observationsOf(db, owner).length, 2);
});
void test('observation uniqueness includes job identity and keeps prior rows', () => {
  const db = new DatabaseSync(':memory:');
  const files = readdirSync(drizzle)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  applyMigrations(
    db,
    files.filter((f) => f.startsWith('0000') || f.startsWith('0001')),
  );
  db.exec(
    `INSERT INTO observations (id,owner,job_key,source_url,name,status,notes,created) VALUES ('keep','owner-a','https://example.com/jobs/a','https://example.com/source','Same name','Held','Same notes','t')`,
  );
  applyMigrations(
    db,
    files.filter((f) => !f.startsWith('0000') && !f.startsWith('0001')),
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM observations').get().n, 1);
  const owner = 'owner-a';
  const shared = {
    url: 'https://example.com/source',
    Name: 'Same name',
    Status: 'Held',
    Notes: 'Same notes',
  };
  importRow(db, owner, { ...shared, Job: 'https://example.com/jobs/a' });
  importRow(db, owner, { ...shared, Job: 'https://example.com/jobs/b' });
  importRow(db, owner, { ...shared, Job: 'https://example.com/jobs/b' });
  importRow(db, owner, {
    ...shared,
    Job: 'https://example.com/jobs/b',
    Notes: 'Changed notes',
    url: 'https://example.com/source',
  });
  importRow(db, 'owner-b', { ...shared, Job: 'https://example.com/jobs/a' });
  const a = db
    .prepare(
      'SELECT job_key FROM observations WHERE owner=? ORDER BY job_key, notes',
    )
    .all(owner);
  assert.equal(a.length, 3);
  assert.deepEqual(
    a.map((r) => r.job_key),
    [
      'https://example.com/jobs/a',
      'https://example.com/jobs/b',
      'https://example.com/jobs/b',
    ],
  );
  assert.equal(
    db
      .prepare('SELECT count(*) AS n FROM observations WHERE owner=?')
      .get('owner-b').n,
    1,
  );
});
const statuses = ['Held', 'Ready', 'Submitted', 'Skip', 'Live loop'];
const mergedStatus = {
  Held: {
    Held: 'Held',
    Ready: 'Held',
    Submitted: 'Submitted',
    Skip: 'Held',
    'Live loop': 'Live loop',
  },
  Ready: {
    Held: 'Ready',
    Ready: 'Ready',
    Submitted: 'Submitted',
    Skip: 'Ready',
    'Live loop': 'Live loop',
  },
  Submitted: {
    Held: 'Submitted',
    Ready: 'Submitted',
    Submitted: 'Submitted',
    Skip: 'Submitted',
    'Live loop': 'Live loop',
  },
  Skip: {
    Held: 'Skip',
    Ready: 'Skip',
    Submitted: 'Submitted',
    Skip: 'Skip',
    'Live loop': 'Live loop',
  },
  'Live loop': {
    Held: 'Live loop',
    Ready: 'Live loop',
    Submitted: 'Live loop',
    Skip: 'Live loop',
    'Live loop': 'Live loop',
  },
};
void test('real SQL and preview merge match the 25 existing/incoming status pairs', () => {
  const owner = 'owner-matrix';
  for (const existing of statuses)
    for (const incoming of statuses) {
      const expected = mergedStatus[existing][incoming];
      const job = `https://example.com/jobs/${existing}-${incoming}`;
      const db = open();
      db.prepare(sqlFromRoute('job')).run(
        crypto.randomUUID(),
        owner,
        jobKey(job, job),
        'Role',
        job,
        existing,
        '',
        existing === 'Ready' ? 'Exact' : '',
        't',
        '',
        '',
        '',
        null,
        null,
        '',
        null,
        '',
        20,
      );
      if (existing === 'Ready')
        db.prepare(
          "UPDATE jobs SET accepted_draft='Exact', draft='Exact' WHERE owner=? AND job_key=?",
        ).run(owner, jobKey(job, job));
      importRow(db, owner, source(incoming, job, incoming));
      assert.equal(
        jobOf(db, owner, job).status,
        expected,
        `${existing} + ${incoming}`,
      );
      assert.equal(
        mergeJobStatus(existing, incoming),
        expected,
        `preview ${existing} + ${incoming}`,
      );
      const preview = classify(
        [source(incoming, job, incoming), source('Held', job, 'probe')],
        [{ job_key: jobKey(job, job), status: existing }],
      );
      assert.equal(
        preview.items[0].kind,
        existing === 'Submitted' ? 'submitted' : 'known',
      );
      assert.equal(
        preview.items[1].kind,
        expected === 'Submitted' ? 'submitted' : 'known',
      );
    }
});
void test('migration repairs invalid imported Ready and keeps valid acceptance and observations', () => {
  const db = new DatabaseSync(':memory:');
  const files = readdirSync(drizzle)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  applyMigrations(
    db,
    files.filter((f) => f.startsWith('0000') || f.startsWith('0001')),
  );
  db.exec(`
    INSERT INTO jobs (id,owner,job_key,name,url,status,blocker,draft,accepted_draft,version,updated) VALUES
      ('inv-empty','owner-a','https://example.com/jobs/invalid-empty','Empty','https://example.com/jobs/invalid-empty','Ready','','',NULL,1,'t'),
      ('inv-block','owner-a','https://example.com/jobs/invalid-block','Blocked','https://example.com/jobs/invalid-block','Ready','needs fact','text','text',3,'t'),
      ('inv-mismatch','owner-a','https://example.com/jobs/invalid-mismatch','Mismatch','https://example.com/jobs/invalid-mismatch','Ready','','draft','other',2,'t'),
      ('valid','owner-a','https://example.com/jobs/valid-ready','Valid','https://example.com/jobs/valid-ready','Ready','','Exact accepted','Exact accepted',4,'t'),
      ('sub','owner-a','https://example.com/jobs/submitted','Sub','https://example.com/jobs/submitted','Submitted','','sent',NULL,1,'t'),
      ('live','owner-a','https://example.com/jobs/live','Live','https://example.com/jobs/live','Live loop','','interview',NULL,2,'t');
    INSERT INTO observations (id,owner,job_key,source_url,name,status,notes,created) VALUES
      ('o1','owner-a','https://example.com/jobs/invalid-empty','https://example.com/source/1','Empty','Ready','imported ready','t1'),
      ('o2','owner-a','https://example.com/jobs/valid-ready','https://example.com/source/2','Valid','Held','research','t2'),
      ('o3','owner-a','https://example.com/jobs/submitted','https://example.com/source/3','Sub','Submitted','sent','t3');
  `);
  const before = db
    .prepare(
      'SELECT id,owner,job_key,source_url,name,status,notes,created FROM observations ORDER BY id',
    )
    .all();
  applyMigrations(
    db,
    files.filter((f) => !f.startsWith('0000') && !f.startsWith('0001')),
  );
  const after = db
    .prepare(
      'SELECT id,owner,job_key,source_url,name,status,notes,created FROM observations ORDER BY id',
    )
    .all();
  assert.deepEqual(after, before);
  const row = (id) => db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
  assert.equal(row('inv-empty').status, 'Held');
  assert.equal(row('inv-empty').accepted_draft, null);
  assert.equal(row('inv-empty').draft, '');
  assert.equal(row('inv-empty').version, 2);
  assert.equal(row('inv-block').status, 'Ready');
  assert.equal(row('inv-block').accepted_draft, 'text');
  assert.equal(row('inv-block').version, 3);
  assert.equal(row('inv-mismatch').status, 'Held');
  assert.equal(row('inv-mismatch').accepted_draft, null);
  assert.equal(row('inv-mismatch').draft, 'draft');
  assert.equal(row('inv-mismatch').version, 3);
  const valid = row('valid');
  assert.equal(valid.status, 'Ready');
  assert.equal(valid.accepted_draft, 'Exact accepted');
  assert.equal(valid.draft, 'Exact accepted');
  assert.equal(valid.version, 4);
  assert.equal(row('sub').status, 'Submitted');
  assert.equal(row('sub').version, 1);
  assert.equal(row('live').status, 'Live loop');
  assert.equal(row('live').version, 2);
});
void test('migration keeps API-valid Ready rows whose blockers are JS-trim whitespace', () => {
  const db = new DatabaseSync(':memory:');
  const files = readdirSync(drizzle)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  applyMigrations(
    db,
    files.filter((f) => f.startsWith('0000') || f.startsWith('0001')),
  );
  const draft = 'valid accepted text';
  const blockers = ['\n', '\t', '\n\t', '\u00a0', '\u2003'];
  for (const [i, blocker] of blockers.entries()) {
    const patch = {
      version: 1,
      status: 'Ready',
      draft,
      blocker,
    };
    assert.doesNotThrow(() =>
      validateEdit({ version: 1, status: 'Held' }, patch),
    );
    db.prepare(
      'INSERT INTO jobs (id,owner,job_key,name,url,status,blocker,draft,accepted_draft,version,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'ws-' + i,
      'owner-a',
      'https://example.com/jobs/ws-' + i,
      'Valid',
      'https://example.com/jobs/ws-' + i,
      patch.status,
      patch.blocker,
      patch.draft,
      patch.draft,
      patch.version,
      't',
    );
  }
  applyMigrations(
    db,
    files.filter((f) => !f.startsWith('0000') && !f.startsWith('0001')),
  );
  for (const i of blockers.keys()) {
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get('ws-' + i);
    assert.equal(row.status, 'Ready', 'blocker ' + JSON.stringify(blockers[i]));
    assert.equal(row.accepted_draft, draft);
    assert.equal(row.draft, draft);
    assert.equal(row.version, 1);
    assert.equal(row.blocker, blockers[i]);
  }
});

void test('the real SQL refuses to resurrect a job that already ended', () => {
  // The terminal guard exists in both mergeJobStatus and the upsert SQL. If the
  // two ever disagree, rediscovery could silently reopen a closed application.
  const owner = 'owner-terminal';
  for (const terminal of ['Offer', 'Accepted', 'Closed'])
    for (const incoming of [
      'Held',
      'Ready',
      'Submitted',
      'Skip',
      'Live loop',
    ]) {
      const db = open();
      const job = `https://example.com/jobs/${terminal}-${incoming}`;
      db.prepare(sqlFromRoute('job')).run(
        crypto.randomUUID(),
        owner,
        jobKey(job, job),
        'Role',
        job,
        terminal,
        '',
        'final text',
        't',
        '',
        '',
        '',
        null,
        null,
        '',
        null,
        '',
        20,
      );
      importRow(db, owner, source(incoming, job, 'rediscovered'));
      const row = jobOf(db, owner, job);
      assert.equal(
        row.status,
        terminal,
        `SQL let ${incoming} reopen ${terminal}`,
      );
      assert.equal(
        mergeJobStatus(terminal, incoming),
        row.status,
        'the TypeScript lattice and the SQL must agree',
      );
    }
});
