import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowanceFor,
  readiness,
  refusalRate,
  thresholds,
} from '../lib/readiness.ts';
import { RefusalError, validateDraftLog, limits } from '../lib/profile.ts';

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
