import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compFeature,
  corpusOf,
  fitWeights,
  difference,
  isChoiceDelta,
  nextPair,
  normalise,
  remoteFeature,
  utility,
  vector,
} from '../lib/utility.ts';
import {
  expectedMax,
  freshness,
  responseRate,
  selectPortfolio,
  tierOf,
} from '../lib/scoring.ts';
import {
  estimateEffort,
  fromGreenhouse,
  fromLever,
  inferLevel,
  inferRemote,
  parseComp,
  stripHtml,
  validateNormalised,
} from '../lib/postings.ts';
import {
  evidence,
  isTerminal,
  statusAfter,
  validateOutcome,
} from '../lib/outcomes.ts';
import { mergeJobStatus, states, validateEdit } from '../lib/domain.ts';

const NOW = '2026-09-05T00:00:00.000Z';
function posting(over = {}) {
  return {
    job_key: 'k',
    name: 'Northstar — Backend Engineer',
    company: 'Northstar',
    level: 'senior',
    remote: 'remote',
    comp_min: 150000,
    comp_max: 190000,
    size: 'growth',
    posted: NOW,
    ...over,
  };
}

/* ---------------- utility model ---------------- */

void test('an unknown attribute scores neutral, never zero', () => {
  // A posting that hides its band must not rank below every posting that
  // publishes one purely for hiding it.
  assert.equal(compFeature(null, null), 0.5);
  assert.equal(remoteFeature(''), 0.5);
  assert.ok(compFeature(90000, null) < compFeature(300000, null));
});

void test('compensation is scored on a log scale within its band', () => {
  assert.equal(compFeature(80000, null), 0);
  assert.equal(compFeature(400000, null), 1);
  assert.equal(compFeature(50000, null), 0, 'below the floor clamps');
  assert.equal(compFeature(900000, null), 1, 'above the ceiling clamps');
});

void test('fitted weights recover a preference the choices actually express', () => {
  const corpus = corpusOf(['backend engineer at Northstar']);
  const remoteLowPay = posting({
    remote: 'remote',
    comp_min: 120000,
    comp_max: null,
  });
  const onsiteHighPay = posting({
    remote: 'onsite',
    comp_min: 260000,
    comp_max: null,
  });
  // Someone who repeatedly picks remote over more money.
  const deltas = Array.from({ length: 8 }, () =>
    difference(vector(remoteLowPay, corpus), vector(onsiteHighPay, corpus)),
  );
  const w = fitWeights(deltas);
  assert.ok(w.remote > 0, 'remote is valued');
  assert.ok(w.comp < 0, 'pay is traded away in these choices');
  assert.ok(
    utility(remoteLowPay, w, corpus) > utility(onsiteHighPay, w, corpus),
    'the fitted model ranks the chosen job higher',
  );
});

void test('weights are scaled to unit mass so attributes read as shares', () => {
  const corpus = corpusOf(['engineer']);
  const deltas = [
    difference(
      vector(posting({ remote: 'remote' }), corpus),
      vector(posting({ remote: 'onsite' }), corpus),
    ),
  ];
  const w = fitWeights(deltas);
  const mass = Object.values(w).reduce((s, x) => s + Math.abs(x), 0);
  assert.ok(Math.abs(mass - 1) < 1e-6);
});

void test('no choices yields no opinion rather than a fabricated one', () => {
  assert.deepEqual(Object.values(fitWeights([])), [0, 0, 0, 0, 0]);
});

void test('an empty comparison vector cannot be fitted as five NaN weights', () => {
  const weights = Object.values(fitWeights([[]]));
  assert.equal(weights.length, 5);
  assert.ok(
    weights.every((w) => w === 0),
    `empty delta must not produce ${JSON.stringify(weights)}`,
  );
  assert.equal(isChoiceDelta([]), false);
  assert.equal(isChoiceDelta([0, 0, 0, 0, 0]), true);
  assert.equal(isChoiceDelta([0, 0, 0, 0]), false);
  assert.equal(isChoiceDelta([0, 0, 0, 0, Number.NaN]), false);
});

void test('elicitation avoids pairs already asked and one-attribute pairs', () => {
  const corpus = corpusOf(['backend engineer']);
  const pool = [
    posting({
      job_key: 'a',
      remote: 'remote',
      comp_min: 120000,
      level: 'junior',
    }),
    posting({
      job_key: 'b',
      remote: 'onsite',
      comp_min: 260000,
      level: 'principal',
    }),
    posting({ job_key: 'c', remote: 'hybrid', comp_min: 180000, level: 'mid' }),
  ];
  const first = nextPair(pool, fitWeights([]), corpus);
  assert.ok(first, 'a pair is offered');
  const asked = new Set([[first.a.job_key, first.b.job_key].sort().join('||')]);
  const second = nextPair(pool, fitWeights([]), corpus, asked);
  assert.ok(second, 'a different pair follows');
  assert.notDeepEqual(
    [second.a.job_key, second.b.job_key].sort(),
    [first.a.job_key, first.b.job_key].sort(),
  );
});

void test('identical postings offer no informative comparison', () => {
  const corpus = corpusOf(['engineer']);
  const same = [posting({ job_key: 'a' }), posting({ job_key: 'b' })];
  assert.equal(nextPair(same, fitWeights([]), corpus), null);
});

void test('a set with no spread normalises to a constant, not invented range', () => {
  assert.deepEqual(normalise([3, 3, 3]), [0.5, 0.5, 0.5]);
  assert.deepEqual(normalise([0, 5, 10]), [0, 0.5, 1]);
});

/* ---------------- expected maximum ---------------- */

void test('expected maximum matches the hand computation', () => {
  // One certain offer worth 1 is exactly 1.
  assert.equal(expectedMax([{ u: 1, p: 1 }]), 1);
  // 0.5 chance of 1 is 0.5.
  assert.equal(expectedMax([{ u: 1, p: 0.5 }]), 0.5);
  // Best first: 1·0.5 + 0.4·0.5·0.5 = 0.6
  assert.ok(
    Math.abs(
      expectedMax([
        { u: 1, p: 0.5 },
        { u: 0.4, p: 0.5 },
      ]) - 0.6,
    ) < 1e-9,
  );
  assert.equal(expectedMax([]), 0);
});

void test('order of the input does not change the expected maximum', () => {
  const a = [
    { u: 0.2, p: 0.9 },
    { u: 0.9, p: 0.1 },
    { u: 0.5, p: 0.4 },
  ];
  assert.ok(Math.abs(expectedMax(a) - expectedMax([...a].reverse())) < 1e-12);
});

void test('a duplicate of what you already hold adds almost nothing', () => {
  const held = [{ u: 0.9, p: 0.9 }];
  const dupGain =
    expectedMax([...held, { u: 0.9, p: 0.9 }]) - expectedMax(held);
  const longShotGain =
    expectedMax([...held, { u: 1, p: 0.05 }]) - expectedMax(held);
  assert.ok(dupGain < 0.1, 'stacking the same outcome is nearly worthless');
  assert.ok(longShotGain > 0, 'a better long shot still pays');
});

void test('selection respects the attention budget and prefers gain per minute', () => {
  const candidates = [
    { job_key: 'cheap', u: 0.8, p: 0.3, effort: 20 },
    { job_key: 'dear', u: 0.85, p: 0.3, effort: 80 },
    { job_key: 'reach', u: 1, p: 0.04, effort: 20 },
    { job_key: 'floor', u: 0.4, p: 0.5, effort: 20 },
  ];
  const plan = selectPortfolio(candidates, 60);
  assert.ok(plan.spent <= 60, 'never overspends the budget');
  assert.ok(plan.chosen.length >= 2);
  assert.ok(
    !plan.chosen.some((c) => c.job_key === 'dear'),
    'the expensive near-duplicate loses on gain per minute',
  );
  assert.ok(plan.expected > 0);
});

void test('a portfolio mixes odds without a hardcoded tier ratio', () => {
  // Ten near-identical safe jobs plus one long shot: the optimiser should not
  // simply take the ten highest-probability rows.
  const safe = Array.from({ length: 10 }, (_, i) => ({
    job_key: 's' + i,
    u: 0.5,
    p: 0.4,
    effort: 20,
  }));
  const reach = { job_key: 'reach', u: 1, p: 0.05, effort: 20 };
  const plan = selectPortfolio([...safe, reach], 100);
  assert.ok(
    plan.chosen.some((c) => c.job_key === 'reach'),
    'the long shot earns a place because it can be the maximum',
  );
});

void test('an item costing more than the whole budget is never selected', () => {
  const plan = selectPortfolio([{ job_key: 'x', u: 1, p: 1, effort: 500 }], 60);
  assert.deepEqual(plan.chosen, []);
  assert.equal(plan.spent, 0);
});

void test('response rate is a prior until evidence arrives, and reports its width', () => {
  const cold = responseRate(0, 0);
  assert.ok(cold.mean > 0.04 && cold.mean < 0.09, 'weak cold prior');
  assert.equal(cold.sent, 0);
  // Evidence consistent with the prior leaves the mean alone and tightens the
  // interval. (Evidence that moves the mean toward 0.5 can widen it in absolute
  // terms, because Beta variance peaks there — so narrowing is asserted at a
  // comparable rate, not across a shifted one.)
  const confirming = responseRate(40, 3);
  assert.ok(Math.abs(confirming.mean - cold.mean) < 0.02, 'mean holds');
  assert.ok(
    confirming.high - confirming.low < cold.high - cold.low,
    'more evidence at the same rate narrows the interval',
  );
  assert.ok(responseRate(40, 20).mean > cold.mean, 'a better rate raises it');
  assert.equal(confirming.sent, 40, 'the evidence count travels with it');
});

void test('a stale posting is discounted and a dateless one assumed middling', () => {
  assert.ok(freshness(NOW, NOW) > 0.99);
  assert.ok(freshness('2026-06-01T00:00:00.000Z', NOW) < 0.3);
  assert.equal(freshness(null, NOW), 0.8);
  assert.equal(freshness('not a date', NOW), 0.8);
});

void test('tiers are cut on probability', () => {
  assert.equal(tierOf(0.02), 'reach');
  assert.equal(tierOf(0.1), 'match');
  assert.equal(tierOf(0.4), 'floor');
});

/* ---------------- read plane ---------------- */

void test('compensation is parsed from the prose boards actually publish', () => {
  assert.deepEqual(
    parseComp('The range is $150,000 - $190,000 per year'),
    [150000, 190000],
  );
  assert.deepEqual(parseComp('$150K to $190K'), [150000, 190000]);
  assert.deepEqual(parseComp('Base salary $175,000'), [175000, null]);
  assert.deepEqual(parseComp('No numbers here'), [null, null]);
  // Figures that cannot be a salary are ignored rather than guessed at.
  assert.deepEqual(parseComp('Founded in 2011, over $5,000,000,000 raised'), [
    null,
    null,
  ]);
});

void test('level and remote are inferred from the words employers use', () => {
  assert.equal(inferLevel('Senior Backend Engineer'), 'senior');
  assert.equal(inferLevel('Staff Software Engineer'), 'staff');
  assert.equal(inferLevel('New Grad Engineer'), 'junior');
  assert.equal(inferLevel('Software Engineer'), 'mid');
  assert.equal(inferRemote('Remote — US'), 'remote');
  assert.equal(inferRemote('Hybrid, 3 days in London'), 'hybrid');
  assert.equal(inferRemote('On-site in Berlin'), 'onsite');
  assert.equal(inferRemote('London'), '');
});

void test('markup is stripped without swallowing the text', () => {
  assert.equal(
    stripHtml(
      '<p>Build <strong>things</strong>&nbsp;well</p><script>x()</script>',
    ),
    'Build things well',
  );
  assert.equal(stripHtml('<p>Keep</p><script>alert(1)</script >'), 'Keep');
  assert.equal(
    stripHtml('<p>Keep</p><script>alert(1)</script\t\n bar>'),
    'Keep',
  );
  assert.equal(
    stripHtml('<style type="text/css">x{}</style >Visible'),
    'Visible',
  );
  assert.equal(stripHtml('Uses &lt;T&gt; and A&amp;B'), 'Uses <T> and A&B');
  assert.equal(stripHtml('&#60;T&#62;'), '<T>');
  // Double-encoded entities decode once, so they cannot become a tag.
  assert.equal(stripHtml('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
});

void test('effort rises with length and supplemental questions', () => {
  const short = 'word '.repeat(200);
  const long = 'word '.repeat(2000);
  assert.ok(estimateEffort(long) > estimateEffort(short));
  assert.ok(
    estimateEffort(short + ' Please include a cover letter') >
      estimateEffort(short),
  );
  assert.ok(estimateEffort(long) <= 90, 'estimates stay bounded');
});

void test('a Greenhouse board normalises onto the workspace record shape', () => {
  const rows = fromGreenhouse(
    {
      jobs: [
        {
          absolute_url: 'https://boards.greenhouse.io/northstar/jobs/4001',
          title: 'Senior Backend Engineer',
          updated_at: NOW,
          location: { name: 'Remote — US' },
          content: '<p>Range $150,000 - $190,000</p>',
          company_name: 'Northstar',
        },
        { title: 'Missing url' },
      ],
    },
    'northstar',
  );
  assert.equal(rows.length, 1, 'unusable rows are dropped, not guessed at');
  const [r] = rows;
  assert.equal(r.Name, 'Northstar — Senior Backend Engineer');
  assert.equal(r.level, 'senior');
  assert.equal(r.remote, 'remote');
  assert.equal(r.comp_min, 150000);
  assert.equal(r.Status, 'Held', 'discovery never implies a decision');
  assert.equal(r.source, 'greenhouse');
  assert.deepEqual(validateNormalised(rows), rows);
});

void test('a Lever board normalises to the same shape', () => {
  const rows = fromLever(
    [
      {
        hostedUrl: 'https://jobs.lever.co/harbor/abc-123',
        text: 'Staff Platform Engineer',
        createdAt: Date.parse(NOW),
        categories: { location: 'Hybrid — Berlin' },
        descriptionPlain: 'Compensation $200K to $240K',
      },
    ],
    'Harbor',
  );
  assert.equal(rows[0].Name, 'Harbor — Staff Platform Engineer');
  assert.equal(rows[0].level, 'staff');
  assert.equal(rows[0].remote, 'hybrid');
  assert.equal(rows[0].comp_max, 240000);
  assert.equal(rows[0].posted, NOW);
});

void test('a malformed board payload is reported, not silently emptied', () => {
  assert.throws(() => fromGreenhouse({}, 'x'), /no jobs array/);
  assert.throws(() => fromLever({}, 'x'), /no postings array/);
  assert.throws(() => validateNormalised([]), /no usable postings/);
});

/* ---------------- outcomes ---------------- */

void test('terminal states are local only and never valid for import', () => {
  // The whole existing import status matrix depends on this staying true.
  for (const terminal of ['Offer', 'Accepted', 'Closed'])
    assert.ok(
      !states.includes(terminal),
      `${terminal} must not be an importable status`,
    );
});

void test('rediscovery cannot resurrect a job that already ended', () => {
  for (const terminal of ['Offer', 'Accepted', 'Closed'])
    for (const incoming of states)
      assert.equal(
        mergeJobStatus(terminal, incoming),
        terminal,
        `${incoming} must not reopen ${terminal}`,
      );
});

void test('the existing five-status merge behaviour is unchanged', () => {
  assert.equal(mergeJobStatus(undefined, 'Ready'), 'Held');
  assert.equal(mergeJobStatus('Submitted', 'Held'), 'Submitted');
  assert.equal(mergeJobStatus('Held', 'Submitted'), 'Submitted');
  assert.equal(mergeJobStatus('Live loop', 'Submitted'), 'Live loop');
  assert.equal(mergeJobStatus('Submitted', 'Live loop'), 'Live loop');
  assert.equal(mergeJobStatus('Skip', 'Held'), 'Skip');
});

void test('a submission cannot be recorded without a receipt', () => {
  assert.throws(
    () => validateOutcome({ status: 'Ready' }, { kind: 'submitted' }),
    /needs a receipt/,
  );
  const ok = validateOutcome(
    { status: 'Ready' },
    { kind: 'submitted', receipt: 'confirmation #A-8813', occurred: NOW },
  );
  assert.equal(ok.receipt, 'confirmation #A-8813');
  assert.equal(ok.occurred, NOW);
});

void test('outcomes must follow the process they describe', () => {
  assert.throws(
    () =>
      validateOutcome(
        { status: 'Held' },
        { kind: 'submitted', receipt: 'ref-1' },
      ),
    /Accept the exact draft/,
  );
  assert.throws(
    () => validateOutcome({ status: 'Held' }, { kind: 'rejected' }),
    /Record the submission first|Record the submission before/,
  );
  assert.throws(
    () => validateOutcome({ status: 'Closed' }, { kind: 'response' }),
    /already ended/,
  );
  assert.doesNotThrow(() =>
    validateOutcome({ status: 'Submitted' }, { kind: 'response' }),
  );
  const accepted = validateOutcome({ status: 'Offer' }, { kind: 'accepted' });
  assert.equal(accepted.kind, 'accepted');
  assert.doesNotThrow(() =>
    validateOutcome({ status: 'Offer' }, { kind: 'withdrawn' }),
  );
  assert.throws(
    () => validateOutcome({ status: 'Accepted' }, { kind: 'accepted' }),
    /already ended/,
  );
});

void test('each outcome maps to the status it actually implies', () => {
  assert.equal(statusAfter('submitted'), 'Submitted');
  assert.equal(statusAfter('screen'), 'Live loop');
  assert.equal(statusAfter('offer'), 'Offer');
  assert.equal(statusAfter('accepted'), 'Accepted');
  assert.equal(statusAfter('rejected'), 'Closed');
  assert.equal(statusAfter('ghosted'), 'Closed');
  assert.ok(isTerminal('Closed') && !isTerminal('Live loop'));
});

void test('only receipted submissions count as evidence', () => {
  const rows = [
    { job_id: 'a', kind: 'submitted', receipt: 'ref-a' },
    { job_id: 'a', kind: 'screen', receipt: null },
    { job_id: 'b', kind: 'submitted', receipt: 'ref-b' },
    // Imported with no receipt: real enough to display, not to learn from.
    { job_id: 'c', kind: 'submitted', receipt: null },
    { job_id: 'c', kind: 'offer', receipt: null },
  ];
  const e = evidence(rows, () => 'backend');
  assert.equal(e.backend.sent, 2, 'the unreceipted send is excluded');
  assert.equal(e.backend.responses, 1);
});

void test('a job that has ended stays editable for notes but not for status', () => {
  assert.doesNotThrow(() =>
    validateEdit(
      { version: 1, status: 'Closed' },
      { version: 1, status: 'Closed', draft: 'Thank-you note', blocker: '' },
    ),
  );
  assert.throws(
    () =>
      validateEdit(
        { version: 1, status: 'Closed' },
        { version: 1, status: 'Held', draft: '', blocker: '' },
      ),
    /without changing the application status/,
  );
});

void test('ordinary workspace saves cannot set a terminal outcome', () => {
  for (const status of ['Offer', 'Accepted', 'Closed'])
    assert.throws(
      () =>
        validateEdit(
          { version: 1, status: 'Held' },
          { version: 1, status, draft: '', blocker: '' },
        ),
      /Record the outcome with a receipt/,
    );
});
