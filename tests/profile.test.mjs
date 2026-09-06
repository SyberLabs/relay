import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clusterOf,
  clusterTrust,
  editRatio,
  factUsage,
  isClaim,
  limits,
  openingGroups,
  profileBrief,
  proposeRules,
  reviewTrigger,
  samenessPairs,
  unsupportedClaims,
  usableFact,
  validateDraftLog,
  validateFact,
  validateRule,
} from '../lib/profile.ts';
import { parseResume } from '../lib/resume.ts';
const NOW = '2026-09-05T00:00:00.000Z';
function fact(id, claim, extra = {}) {
  return {
    id,
    claim,
    evidence: '',
    tag: 'detail',
    status: 'Verified',
    verified: NOW,
    expires: null,
    ...extra,
  };
}
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

test('claims are recognised by numbers or first-person achievement', () => {
  assert.ok(isClaim('I reduced p99 latency by 40%.'));
  assert.ok(isClaim('I led the payments team.'));
  assert.ok(isClaim('Shipped 3 releases in 2025.'));
  assert.ok(!isClaim('I am drawn to your work on distributed systems.'));
  assert.ok(!isClaim('Why does your team favour Rust?'));
  assert.ok(!isClaim('Your infrastructure post was excellent.'));
});

test('a noun that doubles as a verb does not manufacture a claim', () => {
  // "work", "design" and "lead" are nouns here, so these need no citation.
  assert.ok(!isClaim('I admire the design of your ingestion layer.'));
  assert.ok(!isClaim('I read your work on consensus.'));
  // The same words as real verbs remain claims and still need one.
  assert.ok(isClaim('I own the billing service.'));
  assert.ok(isClaim('I design ingestion pipelines.'));
});

test('an intransitive verb frames the letter and is not a claim', () => {
  // Common cover-letter framing: the verb asserts nothing about the applicant.
  assert.ok(!isClaim('Your storage work is why I write.'));
  assert.ok(!isClaim('That is the reason I am writing.'));
  // The same verb with an object is an assertion and still needs a citation.
  assert.ok(isClaim('I write release tooling.'));
});

test('an uncited achievement is refused, a cited one passes', () => {
  const facts = [fact('f1', 'Led a team of 6 engineers at Northstar')];
  assert.deepEqual(
    unsupportedClaims('I led a team of 6 engineers.', facts),
    [],
  );
  assert.equal(unsupportedClaims('I led a team of 6 engineers.', []).length, 1);
});

test('a number absent from every cited fact is unsupported', () => {
  const facts = [fact('f1', 'Reduced p99 latency from 400ms to 40ms')];
  assert.deepEqual(
    unsupportedClaims('I reduced p99 latency to 40ms.', facts),
    [],
  );
  // The inflated figure must not pass merely because the sentence looks similar.
  assert.equal(
    unsupportedClaims('I reduced p99 latency to 4ms.', facts).length,
    1,
  );
});

test('non-claim sentences never require a citation', () => {
  assert.deepEqual(
    unsupportedClaims(
      'Your work on storage engines is why I am writing. I would welcome a conversation.',
      [],
    ),
    [],
  );
});

test('logging refuses unverified, expired and uncited facts', () => {
  const verified = [fact('f1', 'Shipped 12 releases in 2025')];
  assert.doesNotThrow(() =>
    validateDraftLog(
      { body: 'I shipped 12 releases in 2025.', cited: ['f1'] },
      verified,
      NOW,
    ),
  );
  assert.throws(
    () =>
      validateDraftLog(
        { body: 'I shipped 12 releases in 2025.', cited: [] },
        verified,
        NOW,
      ),
    /Unsupported claim/,
  );
  assert.throws(
    () =>
      validateDraftLog(
        { body: 'Hello.', cited: ['f1'] },
        [fact('f1', 'x', { status: 'Proposed' })],
        NOW,
      ),
    /not verified or has expired/,
  );
  assert.throws(
    () =>
      validateDraftLog(
        { body: 'Hello.', cited: ['f1'] },
        [fact('f1', 'x', { expires: '2026-01-01T00:00:00.000Z' })],
        NOW,
      ),
    /not verified or has expired/,
  );
  assert.throws(
    () => validateDraftLog({ body: 'Hello.', cited: ['nope'] }, verified, NOW),
    /does not exist/,
  );
});

test('expiry governs whether a verified fact is usable', () => {
  assert.ok(usableFact(fact('f1', 'x'), NOW));
  assert.ok(!usableFact(fact('f1', 'x', { status: 'Retired' }), NOW));
  assert.ok(
    !usableFact(fact('f1', 'x', { expires: '2026-01-01T00:00:00.000Z' }), NOW),
  );
  assert.ok(
    usableFact(fact('f1', 'x', { expires: '2027-01-01T00:00:00.000Z' }), NOW),
  );
});

test('role families cluster distinct jobs and fall back to general', () => {
  assert.equal(clusterOf('Northstar Example — Backend Engineer'), 'backend');
  assert.equal(clusterOf('Harbor Example — Platform Engineer'), 'platform');
  assert.equal(clusterOf('Cedar Example — Research Scientist'), 'research');
  assert.equal(clusterOf('Vale Example — Office Coordinator'), 'general');
});

test('edit ratio measures words changed, not characters', () => {
  assert.equal(editRatio('one two three', 'one two three'), 0);
  assert.equal(editRatio('', ''), 0);
  assert.equal(editRatio('one two three four', 'one two three five'), 0.25);
  // Case and punctuation are not style edits worth counting.
  assert.equal(editRatio('One two, three!', 'one TWO three'), 0);
  assert.ok(editRatio('completely different text here', 'nothing alike') > 0.8);
});

test('a cluster graduates only after enough near-unchanged reviews', () => {
  const clean = Array.from({ length: limits.graduationRuns }, (_, i) =>
    draft('d' + i, { verdict: 'Reviewed' }),
  );
  assert.equal(clusterTrust('backend', clean).state, 'Graduated');
  // One draft short of the threshold is still probation.
  assert.equal(clusterTrust('backend', clean.slice(1)).state, 'Probation');
  // Heavy corrections keep it on probation however many there are.
  const edited = Array.from({ length: limits.graduationRuns }, (_, i) =>
    draft('e' + i, {
      verdict: 'Corrected',
      body: 'one two three four five six',
      corrected: 'entirely other words appear here now',
    }),
  );
  assert.equal(clusterTrust('backend', edited).state, 'Probation');
});

test('an expired fact demotes a graduated cluster', () => {
  const clean = Array.from({ length: limits.graduationRuns }, (_, i) =>
    draft('d' + i, { verdict: 'Reviewed' }),
  );
  assert.equal(clusterTrust('backend', clean, true).state, 'Probation');
});

test('an unseen cluster triggers review at the first draft', () => {
  const reviewed = Array.from({ length: 3 }, (_, i) =>
    draft('r' + i, { verdict: 'Reviewed' }),
  );
  assert.equal(
    reviewTrigger([...reviewed, draft('new', { cluster: 'research' })]).reason,
    'New cluster',
  );
});

test('low confidence and batch size trigger in that order', () => {
  const seen = Array.from({ length: 3 }, (_, i) =>
    draft('r' + i, { verdict: 'Reviewed' }),
  );
  const lowConf = Array.from({ length: limits.lowConfidence }, (_, i) =>
    draft('l' + i, { confidence: 'low' }),
  );
  assert.equal(reviewTrigger([...seen, ...lowConf]).reason, 'Low confidence');
  const full = Array.from({ length: limits.batchSize }, (_, i) =>
    draft('p' + i),
  );
  assert.equal(reviewTrigger([...seen, ...full]).reason, 'Batch full');
  assert.equal(reviewTrigger([...seen, draft('one')]), null);
  assert.equal(reviewTrigger([]), null);
});

test('drift in a graduated cluster triggers before the batch fills', () => {
  const corpus = Array.from({ length: limits.graduationRuns }, (_, i) =>
    draft('c' + i, {
      verdict: 'Reviewed',
      body: 'I write clearly about storage engines and latency work',
    }),
  );
  const trigger = reviewTrigger([
    ...corpus,
    draft('odd', { body: 'Totally unrelated wording with nothing shared' }),
  ]);
  assert.equal(trigger.reason, 'Style drift');
});

test('a repeated opening groups into one decision', () => {
  const batch = [
    draft('a', { body: 'I was excited to see this role posted. More text.' }),
    draft('b', { body: 'I was excited to see this role posted. Other text.' }),
    draft('c', { body: 'Your storage work is why I write. Different.' }),
  ];
  const groups = openingGroups(batch);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids, ['a', 'b']);
});

test('near-identical drafts in one batch are flagged', () => {
  const batch = [
    draft('a', { body: 'one two three four five six seven eight' }),
    draft('b', { body: 'one two three four five six seven eight' }),
    draft('c', { body: 'completely unrelated sentence with other words here' }),
  ];
  assert.deepEqual(samenessPairs(batch), [['a', 'b']]);
});

test('fact usage rolls a repeated claim into one verification', () => {
  const facts = [fact('f1', 'Latency work'), fact('f2', 'Team size')];
  const batch = [
    draft('a', { cited: 'f1' }),
    draft('b', { cited: 'f1,f2' }),
    draft('c', { cited: 'f1' }),
  ];
  assert.deepEqual(
    factUsage(batch, facts).map((u) => [u.fact.id, u.count]),
    [
      ['f1', 3],
      ['f2', 1],
    ],
  );
});

test('a correction generalises into confirmable style rules', () => {
  const rules = proposeRules(
    'I was excited to see this role posted at your company.',
    'Your storage work is why I am writing.',
  );
  assert.ok(rules.some((r) => r.startsWith('Do not open with')));
  assert.ok(rules.length <= 3);
  assert.deepEqual(proposeRules('same text', 'same text'), []);
});

test('the brief exposes only usable facts and applicable rules', () => {
  const facts = [
    fact('f1', 'Verified claim'),
    fact('f2', 'Proposed claim', { status: 'Proposed' }),
    fact('f3', 'Expired claim', { expires: '2026-01-01T00:00:00.000Z' }),
  ];
  const rules = [
    { id: 'r1', rule: 'Global rule', scope: 'global' },
    { id: 'r2', rule: 'Backend rule', scope: 'backend' },
    { id: 'r3', rule: 'Research rule', scope: 'research' },
  ];
  const brief = profileBrief(facts, rules, 'backend', NOW, 7);
  assert.deepEqual(
    brief.facts.map((f) => f.id),
    ['f1'],
  );
  assert.deepEqual(brief.style, ['Global rule', 'Backend rule']);
  assert.equal(brief.profile_version, 7);
});

test('fact and rule input is bounded', () => {
  assert.deepEqual(validateFact({ claim: ' Led a team ', tag: 'role' }), {
    claim: 'Led a team',
    evidence: '',
    tag: 'role',
  });
  assert.throws(() => validateFact({ claim: '' }), /needs a claim/);
  assert.throws(
    () => validateFact({ claim: 'x', tag: 'invented' }),
    /known fact tag/,
  );
  assert.equal(validateRule({ rule: 'Be brief' }).scope, 'global');
  assert.throws(() => validateRule({ rule: '' }), /needs text/);
});

test('resume extraction proposes checkable lines and skips furniture', () => {
  const candidates = parseResume(
    [
      'Jane Doe',
      'jane@example.com | +1 555 000 1111',
      'EXPERIENCE',
      '• Led a team of 6 engineers at Northstar from 2023 to 2025',
      '• Reduced p99 latency by 40% across the ingestion path',
      '• Enjoyed the work',
      'EDUCATION',
      '• B.S. Computer Science, 2021',
    ].join('\n'),
  );
  const claims = candidates.map((c) => c.claim);
  assert.ok(claims.some((c) => c.startsWith('Led a team of 6')));
  assert.ok(claims.some((c) => c.includes('40%')));
  assert.ok(!claims.some((c) => c.includes('jane@example.com')));
  assert.ok(!claims.includes('Enjoyed the work'));
  assert.equal(candidates.find((c) => c.claim.includes('40%')).tag, 'metric');
  assert.equal(
    candidates.find((c) => c.claim.startsWith('B.S.')).evidence,
    'Resume · EDUCATION',
  );
});

test('resume extraction reports empty and oversized input', () => {
  assert.throws(() => parseResume(''), /Paste resume text/);
  assert.throws(() => parseResume('Hello there friend'), /No candidate facts/);
  assert.throws(() => parseResume('a'.repeat(100001)), /under 100000/);
});
