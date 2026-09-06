import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowanceFor,
  readiness,
  refusalRate,
  thresholds,
} from '../lib/readiness.ts';
import {
  RefusalError,
  refusalSignature,
  validateDraftLog,
  limits,
} from '../lib/profile.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const NOW = '2026-09-06T00:00:00.000Z';
function draft(id, extra = {}) {
  return {
    id,
    job_id: 'j1',
    cluster: 'backend',
    body: 'A draft body.',
    corrected: '',
    cited: '',
    confidence: 'high',
    verdict: 'Logged',
    profile_version: 1,
    ...extra,
  };
}
const reviewedDrafts = (n) =>
  Array.from({ length: n }, (_, i) => draft('r' + i, { verdict: 'Reviewed' }));
const submissions = (n) =>
  Array.from({ length: n }, () => ({ kind: 'submitted', receipt: 'ref' }));
function state(over = {}) {
  return {
    batches: [],
    drafts: [],
    outcomes: [],
    refusals: [],
    budgetDrafts: 6,
    ...over,
  };
}

/* ---------------- allowance ---------------- */

// The governing rule: never generate more unreviewed work than the person has
// shown they will review.
void test('allowance is capped by whichever limit binds first', () => {
  assert.deepEqual(allowanceFor(12, 6), {
    allowance: 6,
    cap: 'attention budget',
  });
  assert.deepEqual(allowanceFor(3, 20), {
    allowance: 3,
    cap: 'reviewed drafts',
  });
  assert.deepEqual(allowanceFor(9, 20, 2), { allowance: 2, cap: 'requested' });
});

void test('an unproven profile still gets one supervised draft', () => {
  // This is what makes running the driver a way to satisfy the first gate
  // rather than a way around it.
  assert.deepEqual(allowanceFor(0, 6), {
    allowance: 1,
    cap: 'supervised minimum',
  });
  assert.deepEqual(allowanceFor(0, 0), {
    allowance: 1,
    cap: 'supervised minimum',
  });
  assert.equal(
    allowanceFor(-5, -5).allowance,
    1,
    'negatives cannot go below one',
  );
});

void test('a request cannot raise the allowance above what evidence supports', () => {
  assert.equal(allowanceFor(2, 6, 50).allowance, 2);
});

/* ---------------- refusal rate ---------------- */

void test('refusal rate counts refusals against every attempt', () => {
  assert.deepEqual(refusalRate([], []), { attempts: 0, refused: 0, rate: 0 });
  const r = refusalRate([1, 2], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.attempts, 10);
  assert.equal(r.refused, 2);
  assert.ok(Math.abs(r.rate - 0.2) < 1e-9);
});

/* ---------------- gates ---------------- */

void test('a fresh profile passes nothing and is still allowed one draft', () => {
  const r = readiness(state());
  assert.equal(r.passed, 0);
  assert.equal(r.ready, false);
  assert.equal(r.allowance, 1);
  assert.deepEqual(
    r.gates.map((g) => g.id),
    [
      'supervised_run',
      'graduated_cluster',
      'receipted_outcomes',
      'refusal_rate',
    ],
  );
});

void test('each gate reads the evidence it claims to', () => {
  const closed = readiness(state({ batches: [{ closed: NOW }] }));
  assert.ok(closed.gates.find((g) => g.id === 'supervised_run').passed);
  assert.ok(!readiness(state({ batches: [{ closed: null }] })).gates[0].passed);

  const graduated = readiness(
    state({ drafts: reviewedDrafts(limits.graduationRuns) }),
  );
  assert.ok(graduated.gates.find((g) => g.id === 'graduated_cluster').passed);

  const receipted = readiness(
    state({ outcomes: submissions(thresholds.receiptedOutcomes) }),
  );
  assert.ok(receipted.gates.find((g) => g.id === 'receipted_outcomes').passed);
  const short = readiness(
    state({ outcomes: submissions(thresholds.receiptedOutcomes - 1) }),
  );
  assert.ok(!short.gates.find((g) => g.id === 'receipted_outcomes').passed);
});

void test('an unreceipted submission is not evidence', () => {
  const r = readiness(
    state({
      outcomes: Array.from({ length: 30 }, () => ({
        kind: 'submitted',
        receipt: null,
      })),
    }),
  );
  assert.ok(!r.gates.find((g) => g.id === 'receipted_outcomes').passed);
});

void test('a refusal rate on too few attempts reports evidence, not a pass', () => {
  // A clean run of three proves nothing, and passing on it would be exactly the
  // lucky streak the threshold exists to prevent.
  const thin = readiness(
    state({ drafts: [draft('a'), draft('b'), draft('c')] }),
  );
  const gate = thin.gates.find((g) => g.id === 'refusal_rate');
  assert.equal(gate.passed, false);
  assert.match(gate.detail, /too few to judge/);

  const enough = readiness(state({ drafts: reviewedDrafts(20) }));
  assert.ok(enough.gates.find((g) => g.id === 'refusal_rate').passed);

  const noisy = readiness(
    state({ drafts: reviewedDrafts(10), refusals: Array.from({ length: 5 }) }),
  );
  const noisyGate = noisy.gates.find((g) => g.id === 'refusal_rate');
  assert.equal(noisyGate.passed, false);
  assert.match(noisyGate.detail, /33%/);
});

void test('an expired fact keeps the cluster gate shut', () => {
  const clean = state({ drafts: reviewedDrafts(limits.graduationRuns) });
  assert.ok(readiness(clean).gates[1].passed);
  assert.ok(!readiness({ ...clean, staleFacts: true }).gates[1].passed);
});

void test('full readiness removes the evidence cap and leaves the budget in charge', () => {
  const ready = readiness(
    state({
      batches: [{ closed: NOW }],
      drafts: reviewedDrafts(limits.graduationRuns + 15),
      outcomes: submissions(thresholds.receiptedOutcomes),
      budgetDrafts: 9,
    }),
  );
  assert.equal(ready.passed, 4);
  assert.equal(ready.ready, true);
  assert.equal(ready.allowance, 9);
  assert.equal(ready.cap, 'attention budget');
});

/* ---------------- refusal typing ---------------- */

// Only refusals the citation gate itself raised are counted. Malformed
// requests say nothing about whether the gate is calibrated, and counting them
// would flatter the rate.
void test('gate refusals are typed and carry what is needed to diagnose them', () => {
  const facts = [
    {
      id: 'f1',
      claim: 'Led a team of 6 engineers',
      evidence: '',
      tag: 'role',
      status: 'Verified',
      verified: NOW,
      expires: null,
    },
  ];
  try {
    validateDraftLog(
      { body: 'I cut infrastructure spend by 40%.', cited: ['f1'] },
      facts,
      NOW,
    );
    assert.fail('should have refused');
  } catch (e) {
    assert.ok(e instanceof RefusalError);
    assert.equal(e.reason, 'unsupported_claim');
    assert.equal(e.sentence, 'I cut infrastructure spend by 40%.');
  }
  try {
    validateDraftLog({ body: 'Hello.', cited: ['nope'] }, facts, NOW);
    assert.fail('should have refused');
  } catch (e) {
    assert.ok(e instanceof RefusalError);
    assert.equal(e.reason, 'unknown_fact');
  }
});

void test('a malformed request is an ordinary error, not a counted refusal', () => {
  for (const bad of [
    { body: '', cited: [] },
    { body: 'x', cited: [1] },
    { body: 'x', cited: [], confidence: 'maybe' },
  ])
    assert.throws(
      () => validateDraftLog(bad, [], NOW),
      (e) => e instanceof Error && !(e instanceof RefusalError),
    );
});

/* ---------------- rejected text is never persisted ---------------- */

// A single-sentence draft is the case that matters: its failing clause IS the
// whole body, so anything that stored "just the clause" would store the draft.
const SENSITIVE =
  'I personally raised 4200000 dollars for Acme Holdings after my divorce settled.';
const distinctive = [
  'personally',
  'raised',
  'Acme',
  'Holdings',
  'divorce',
  'settled',
  '4200000',
];

void test('employer_ref is 1 only when a possessive governs a figure', () => {
  assert.equal(
    refusalSignature('Your company has 2024 customers.').employer_ref,
    1,
  );
  assert.equal(
    refusalSignature('I shipped 12 releases in 2025.').employer_ref,
    0,
  );
});

void test('the refusal signature keeps no word of the refused clause', () => {
  const signature = refusalSignature(SENSITIVE);
  const serialised = JSON.stringify(signature).toLowerCase();
  for (const token of distinctive)
    assert.ok(
      !serialised.includes(token.toLowerCase()),
      `signature leaked "${token}"`,
    );
  // Still useful: it says which rule fired and how the clause was shaped.
  assert.equal(signature.trigger, 'digit');
  assert.equal(signature.numbers, 1);
  assert.ok(signature.words > 5);
});

void test('a refused single-sentence draft leaves no text in any table', () => {
  // Zero rows in `drafts` is not the same as zero rejected text persisted, so
  // this applies the real migrations, runs the route's real refusal INSERT and
  // then scans every column of every table.
  const drizzle = join(process.cwd(), 'drizzle');
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync(drizzle)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const part of readFileSync(join(drizzle, name), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      const sql = part.trim();
      if (sql) db.exec(sql);
    }
  const routeSrc = readFileSync(
    join(process.cwd(), 'app/api/drafts/route.ts'),
    'utf8',
  );
  const start = routeSrc.indexOf('INSERT INTO refusals');
  const insert = routeSrc.slice(start, routeSrc.indexOf("'", start));

  // No column in the statement may carry free text from the draft.
  const columns = insert
    .slice(insert.indexOf('(') + 1, insert.indexOf(')'))
    .split(',')
    .map((c) => c.trim());
  assert.deepEqual(columns, [
    'id',
    'owner',
    'job_id',
    'reason',
    'trigger_kind',
    'numbers',
    'words',
    'employer_ref',
    'created',
  ]);
  assert.doesNotMatch(routeSrc, /\bb\.cited\b/);

  let refusal;
  try {
    validateDraftLog({ body: SENSITIVE, cited: [] }, [], NOW);
    assert.fail('the gate should have refused');
  } catch (e) {
    assert.ok(e instanceof RefusalError);
    refusal = e;
  }
  // The message still names the clause for the person who wrote it; that is
  // returned to their client and is exactly what must not reach the database.
  assert.ok(refusal.message.includes('divorce'));

  db.prepare(insert).run(
    'refusal-1',
    'owner-a',
    'job-1',
    refusal.reason,
    refusal.signature.trigger,
    refusal.signature.numbers,
    refusal.signature.words,
    refusal.signature.employer_ref,
    NOW,
  );
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM refusals').get().n,
    1,
    'the refusal is counted, so this test is not vacuous',
  );

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => String(t.name));
  assert.ok(tables.includes('refusals') && tables.includes('drafts'));
  for (const table of tables)
    for (const row of db.prepare(`SELECT * FROM "${table}"`).all())
      for (const [column, value] of Object.entries(row))
        if (typeof value === 'string')
          for (const token of distinctive)
            assert.ok(
              !value.toLowerCase().includes(token.toLowerCase()),
              `${table}.${column} retained "${token}" from a refused draft`,
            );
});

void test('unknown_fact does not persist caller-supplied cited strings', () => {
  const drizzle = join(process.cwd(), 'drizzle');
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync(drizzle)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const part of readFileSync(join(drizzle, name), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      const sql = part.trim();
      if (sql) db.exec(sql);
    }
  const routeSrc = readFileSync(
    join(process.cwd(), 'app/api/drafts/route.ts'),
    'utf8',
  );
  assert.doesNotMatch(routeSrc, /b\.cited/);
  const start = routeSrc.indexOf('INSERT INTO refusals');
  const insert = routeSrc.slice(start, routeSrc.indexOf("'", start));
  const leaked = 'I led 999 engineers.';
  let refusal;
  try {
    validateDraftLog({ body: 'Hello.', cited: [leaked] }, [], NOW);
    assert.fail('the gate should have refused');
  } catch (e) {
    assert.ok(e instanceof RefusalError);
    assert.equal(e.reason, 'unknown_fact');
    refusal = e;
  }
  db.prepare(insert).run(
    'refusal-unknown',
    'owner-a',
    'job-1',
    refusal.reason,
    refusal.signature?.trigger ?? 'other',
    refusal.signature?.numbers ?? 0,
    refusal.signature?.words ?? 0,
    refusal.signature?.employer_ref ?? 0,
    NOW,
  );
  for (const row of db.prepare('SELECT * FROM refusals').all())
    for (const value of Object.values(row))
      if (typeof value === 'string')
        for (const token of ['led', '999', 'engineers'])
          assert.ok(
            !value.toLowerCase().includes(token),
            `refusals retained "${token}" from unknown_fact cited`,
          );
});
