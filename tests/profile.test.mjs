import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileBrief,
  usableFact,
  validateFact,
  validateRule,
  factFieldKey,
  factClaimFromAnswer,
  PROFILE_FACT_CLAIM_MAX,
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
void test('expiry governs whether a verified fact is usable', () => {
  assert.ok(usableFact(fact('f1', 'x'), NOW));
  assert.ok(!usableFact(fact('f1', 'x', { status: 'Retired' }), NOW));
  assert.ok(
    !usableFact(fact('f1', 'x', { expires: '2026-01-01T00:00:00.000Z' }), NOW),
  );
  assert.ok(
    usableFact(fact('f1', 'x', { expires: '2027-01-01T00:00:00.000Z' }), NOW),
  );
});

void test('the brief exposes only usable facts and applicable rules', () => {
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

void test('form questions map to a bounded field_key without using the raw answer', () => {
  assert.equal(
    factFieldKey('do not submit until the start date is confirmed.'),
    'earliest_start',
  );
  assert.equal(
    factFieldKey(
      'Are you authorized to work in the United States without sponsorship?',
    ),
    'work_authorization.us',
  );
  assert.equal(
    factFieldKey('Desired pay or compensation range?'),
    'desired_pay',
  );
  assert.equal(factFieldKey('Are you willing to relocate?'), 'relocation');
  assert.equal(
    factFieldKey('Do you hold an active security clearance?'),
    'security_clearance',
  );
  const fallback = factFieldKey(
    'Required personal answer; keep submission on hold',
  );
  assert.match(fallback, /^question\.[a-z0-9_]{1,80}$/);
  assert.notEqual(
    fallback,
    'Required personal answer; keep submission on hold',
  );
  assert.ok(fallback.length <= 128);
});

void test('authorization, sponsorship, and jurisdictions keep distinct field keys', () => {
  const us = factFieldKey('Are you authorized to work in the United States?');
  const sponsorship = factFieldKey('Do you require visa sponsorship?');
  const canada = factFieldKey('Are you authorized to work in Canada?');
  const unspecified = factFieldKey('Are you authorized to work?');
  assert.equal(us, 'work_authorization.us');
  assert.equal(sponsorship, 'visa_sponsorship');
  assert.equal(canada, 'work_authorization.ca');
  assert.equal(
    factFieldKey(
      'Do you require visa sponsorship for work in the United States?',
    ),
    'visa_sponsorship.us',
  );
  assert.match(unspecified, /^question\./);
  assert.notEqual(unspecified, 'work_authorization');
  assert.notEqual(us, sponsorship);
  assert.notEqual(us, canada);
  assert.notEqual(sponsorship, canada);
});

void test('a short yes-no answer keeps the question in the reusable claim', () => {
  assert.equal(PROFILE_FACT_CLAIM_MAX, 500);
  assert.equal(
    factClaimFromAnswer(
      'Are you authorized to work in the United States?',
      'Yes',
    ),
    'Are you authorized to work in the United States?: Yes',
  );
  const question = 'Q'.repeat(120);
  const answer = 'A'.repeat(400);
  assert.ok(`${question}: ${answer}`.length > PROFILE_FACT_CLAIM_MAX);
  assert.equal(factClaimFromAnswer(question, answer), answer);
});

void test('the brief exposes field_key on usable facts only', () => {
  const brief = profileBrief(
    [
      fact('f1', 'Verified start', {
        field_key: 'earliest_start',
      }),
      fact('f2', 'Proposed start', {
        status: 'Proposed',
        field_key: 'earliest_start',
      }),
    ],
    [],
    'backend',
    NOW,
    7,
  );
  assert.deepEqual(brief.facts, [
    {
      id: 'f1',
      claim: 'Verified start',
      evidence: '',
      tag: 'detail',
      field_key: 'earliest_start',
    },
  ]);
});

void test('fact and rule input is bounded', () => {
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

void test('resume extraction proposes checkable lines and skips furniture', () => {
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

void test('resume extraction reports empty and oversized input', () => {
  assert.throws(() => parseResume(''), /Paste resume text/);
  assert.throws(() => parseResume('Hello there friend'), /No candidate facts/);
  assert.throws(() => parseResume('a'.repeat(100001)), /under 100000/);
});

void test('resume extraction keeps wrapped bullet claims whole with LF or CRLF', () => {
  for (const newline of ['\n', '\r\n']) {
    assert.deepEqual(
      parseResume(
        [
          'EXPERIENCE',
          '• Built an end-to-end reporting pipeline spanning ingestion,',
          '  validation, storage, and customer dashboards.',
        ].join(newline),
      ),
      [
        {
          claim:
            'Built an end-to-end reporting pipeline spanning ingestion, validation, storage, and customer dashboards.',
          evidence: 'Resume · EXPERIENCE',
          tag: 'detail',
        },
      ],
    );
  }
});

void test('resume extraction attaches a wrapped metric to its parent claim', () => {
  assert.deepEqual(
    parseResume(
      '• Built a reporting pipeline,\n  reducing manual review time by 40%.',
    ),
    [
      {
        claim:
          'Built a reporting pipeline, reducing manual review time by 40%.',
        evidence: 'Resume · Resume',
        tag: 'metric',
      },
    ],
  );
});

void test('resume extraction preserves bullet, heading, blank, contact and role boundaries', () => {
  const candidates = parseResume(
    [
      'EXPERIENCE',
      '• Built a reporting pipeline,',
      '  spanning ingestion and validation.',
      '  • Reduced manual review time by 40%.',
      '    EDUCATION',
      'B.S. Computer Science, 2021',
      '',
      '  Earned a systems certification.',
      '    candidate@example.com',
      '    Senior Engineer, 2023',
      '      Built release automation.',
      'Built deployment tools.',
      'Maintained service dashboards.',
    ].join('\n'),
  );
  assert.deepEqual(
    candidates.map(({ claim }) => claim),
    [
      'Built a reporting pipeline, spanning ingestion and validation.',
      'Reduced manual review time by 40%.',
      'B.S. Computer Science, 2021',
      'Earned a systems certification.',
      'Senior Engineer, 2023',
      'Built release automation.',
      'Built deployment tools.',
      'Maintained service dashboards.',
    ],
  );
  assert.equal(candidates[1].evidence, 'Resume · EXPERIENCE');
  assert.equal(candidates[2].evidence, 'Resume · EDUCATION');
});

void test('resume extraction drops an oversized wrapped item without emitting fragments', () => {
  const oversized = `• Built ${'reporting '.repeat(20)}\n  Reduced ${'manual work '.repeat(20)}\n  by 40%.`;
  assert.throws(() => parseResume(oversized), /No candidate facts/);
  assert.deepEqual(
    parseResume(`${oversized}\n• Built deployment tools.`).map(
      ({ claim }) => claim,
    ),
    ['Built deployment tools.'],
  );
});

void test('resume extraction separates an undated role title from surrounding claims', () => {
  assert.deepEqual(
    parseResume(
      [
        '• Built reporting tools,',
        '  for the engineer managing customer dashboards.',
        '  Senior Engineer',
        '    Built release automation.',
      ].join('\n'),
    ).map(({ claim }) => claim),
    [
      'Built reporting tools, for the engineer managing customer dashboards.',
      'Built release automation.',
    ],
  );
});

void test('resume extraction separates a qualified role title from both neighboring claims', () => {
  for (const title of ['Software Engineer', 'Senior Software Engineer']) {
    assert.deepEqual(
      parseResume(
        [
          'EXPERIENCE',
          '- Built ingestion pipelines.',
          `  ${title}`,
          '    Shipped release tooling for 4 teams.',
        ].join('\n'),
      ).map(({ claim }) => claim),
      ['Built ingestion pipelines.', 'Shipped release tooling for 4 teams.'],
    );
  }
  assert.deepEqual(
    parseResume(
      '- Built ingestion pipelines,\n  for the software engineer managing customer dashboards.',
    ).map(({ claim }) => claim),
    [
      'Built ingestion pipelines, for the software engineer managing customer dashboards.',
    ],
  );
});

for (const title of [
  'Head of Engineering',
  'Director of Engineering',
  'Director of Product',
  'Vice President of Engineering',
  'Software Engineer, Example Corp',
  'Software Engineer at Example Corp',
  'Software Engineer | Example Corp',
]) {
  void test(`resume extraction preserves the ${title} role boundary`, () => {
    assert.deepEqual(
      parseResume(
        `EXPERIENCE\n- Built ingestion pipelines.\n  ${title}\n    Shipped release tooling for 4 teams.`,
      ).map(({ claim }) => claim),
      ['Built ingestion pipelines.', 'Shipped release tooling for 4 teams.'],
    );
  });
}

void test('resume extraction keeps role and company mentions in ordinary continuations', () => {
  for (const continuation of [
    'for the head of engineering managing customer dashboards.',
    'for the software engineer at Example Corp.',
    'with the software engineer, Example Corp teams, and customers.',
    'Software Engineer teams built the customer dashboards.',
  ]) {
    assert.deepEqual(
      parseResume(`- Built reporting tools,\n  ${continuation}`).map(
        ({ claim }) => claim,
      ),
      [`Built reporting tools, ${continuation}`],
    );
  }
});

void test('resume extraction bounds and deduplicates complete items', () => {
  const lines = Array.from(
    { length: 65 },
    (_, i) =>
      `• Built reporting pipeline ${i},\n  spanning ingestion and validation.`,
  );
  const candidates = parseResume([lines[0], ...lines].join('\n'));
  assert.equal(candidates.length, 60);
  assert.equal(
    candidates[0].claim,
    'Built reporting pipeline 0, spanning ingestion and validation.',
  );
  assert.equal(
    candidates.at(-1).claim,
    'Built reporting pipeline 59, spanning ingestion and validation.',
  );
});
