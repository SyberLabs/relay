import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assessPosting,
  extractRequirements,
  jobRequirements,
  postingText,
} from '../lib/fit.ts';

const NOW = '2026-09-06T00:00:00.000Z';
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

void test('requirements section bullets are extracted until the next heading', () => {
  const lines = extractRequirements(
    [
      'Northstar — Backend Engineer',
      'About the role',
      'Build inventory services.',
      'Requirements',
      '• Kubernetes production experience',
      '• PostgreSQL and Redis',
      'Benefits:',
      'Unlimited snacks',
    ].join('\n'),
  );
  assert.deepEqual(lines, [
    'Kubernetes production experience',
    'PostgreSQL and Redis',
  ]);
});

void test('must and required cues are extracted outside a section', () => {
  const lines = extractRequirements(
    'Candidates must have Terraform. Nice people preferred.',
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Terraform/);
});

void test('preferred headings are not required sections', () => {
  const lines = extractRequirements(
    ['Nice to have', 'GraphQL federated gateway experience'].join('\n'),
  );
  assert.deepEqual(lines, []);
});

void test('Must have and Required skills colons open a required section', () => {
  assert.deepEqual(
    extractRequirements(
      ['Must have:', '• Kubernetes production experience'].join('\n'),
    ),
    ['Kubernetes production experience'],
  );
  assert.deepEqual(
    extractRequirements(
      ['Required skills:', '• Kubernetes production experience'].join('\n'),
    ),
    ['Kubernetes production experience'],
  );
});

void test('a same-line Requirements heading still extracts the skill', () => {
  assert.deepEqual(
    extractRequirements('Requirements: Kubernetes production experience'),
    ['Kubernetes production experience'],
  );
});

void test('Preferred qualifications closes a required section', () => {
  assert.deepEqual(
    extractRequirements(
      [
        'Requirements',
        '• Kubernetes production experience',
        'Preferred qualifications',
        '• GraphQL federated gateway experience',
      ].join('\n'),
    ),
    ['Kubernetes production experience'],
  );
});

void test('a preferred skill bullet is not treated as a heading', () => {
  assert.deepEqual(
    extractRequirements(
      ['Requirements', '• Preferred Kubernetes experience in production'].join(
        '\n',
      ),
    ),
    ['Preferred Kubernetes experience in production'],
  );
});

void test('a Kubernetes fact hits a must-have Kubernetes line', () => {
  const { gates, reason } = assessPosting(
    'Must have Kubernetes.',
    [fact('f1', 'Built a Kubernetes platform at Northstar')],
    NOW,
  );
  assert.equal(reason, 'compared');
  assert.equal(gates.length, 1);
  assert.equal(gates[0].status, 'hit');
  assert.equal(gates[0].factId, 'f1');
});

void test('a years requirement misses when the number is absent from facts', () => {
  const { gates } = assessPosting(
    'Minimum of 5 years of Kubernetes.',
    [fact('f1', 'Built a Kubernetes platform at Northstar')],
    NOW,
  );
  assert.equal(gates[0].status, 'miss');
  assert.equal(gates[0].factId, null);
});

void test('proposed, retired, and expired facts never cover a required line', () => {
  const { gates } = assessPosting(
    'Must have Kubernetes.',
    [
      fact('f1', 'Built a Kubernetes platform at Northstar', {
        status: 'Proposed',
      }),
      fact('f2', 'Built a Kubernetes platform at Harbor', {
        expires: '2026-01-01T00:00:00.000Z',
      }),
      fact('f3', 'Built a Kubernetes platform at Meridian', {
        status: 'Retired',
      }),
    ],
    NOW,
  );
  assert.equal(gates[0].status, 'unknown');
});

void test('empty notes produce no gates and ask for posting research', () => {
  const { gates, reason } = assessPosting('', [fact('f1', 'Led a team of 6')], NOW);
  assert.deepEqual(gates, []);
  assert.equal(reason, 'notes');
});

void test('no usable facts leave extracted lines unknown', () => {
  const { gates, reason } = assessPosting(
    'Must have Kubernetes.',
    [],
    NOW,
  );
  assert.equal(reason, 'facts');
  assert.equal(gates[0].status, 'unknown');
});

void test('extraction caps at 20 unique lines', () => {
  const body = Array.from(
    { length: 25 },
    (_, i) => `Must have skill-${i} in production`,
  ).join('\n');
  assert.equal(extractRequirements(body).length, 20);
});

void test('posting text is the job name plus that job’s source notes', () => {
  assert.equal(
    postingText({ name: 'Northstar — Backend Engineer' }, [
      { notes: 'Must have Kubernetes.' },
      { notes: '' },
    ]),
    'Northstar — Backend Engineer\nMust have Kubernetes.',
  );
});

void test('flattened board notes do not invent a requirements section', () => {
  assert.deepEqual(
    extractRequirements(
      'Northstar Backend Engineer About the role Build inventory services. Requirements Kubernetes production experience. PostgreSQL and Redis. Benefits Unlimited snacks',
    ),
    [],
  );
});

void test('in-sentence about does not split a required bullet', () => {
  assert.deepEqual(
    extractRequirements(
      ['Requirements', '• Passionate about Kubernetes'].join('\n'),
    ),
    ['Passionate about Kubernetes'],
  );
});

void test('in-sentence benefits and preferred do not split required lines', () => {
  assert.deepEqual(
    extractRequirements(
      [
        'Requirements',
        '• Experience with employee benefits administration',
        '• Kubernetes',
      ].join('\n'),
    ),
    ['Experience with employee benefits administration', 'Kubernetes'],
  );
  const lines = extractRequirements(
    'Candidates must have preferred Kubernetes experience in production.',
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Kubernetes/);
});

void test('must-cue lines keep about as a content word', () => {
  const lines = extractRequirements(
    'Candidates must care about Terraform in production.',
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Terraform/);
});

void test('a Requirements title does not mark later culture notes as required', () => {
  assert.deepEqual(
    jobRequirements({ name: 'Requirements Engineer' }, [
      { notes: 'A friendly culture-first company.' },
    ]),
    [],
  );
});

void test('a later observation does not inherit an open requirements section', () => {
  assert.deepEqual(
    jobRequirements({ name: 'Northstar — Backend Engineer' }, [
      {
        notes: ['Requirements', 'Kubernetes production experience'].join('\n'),
      },
      { notes: 'Met the hiring manager. Talked about onboarding.' },
    ]),
    ['Kubernetes production experience'],
  );
});

void test('short cue titles open a section instead of becoming gates', () => {
  for (const title of [
    'Required:',
    'Minimum requirements:',
    'Required',
    'Required experience:',
    'Experience required:',
    'At least:',
    'At least',
  ]) {
    assert.deepEqual(
      extractRequirements(
        [title, '• Kubernetes production experience'].join('\n'),
      ),
      ['Kubernetes production experience'],
      title,
    );
  }
});

void test('a years cue with leftover skill words stays a gate', () => {
  assert.deepEqual(
    extractRequirements('Minimum of 5 years of Kubernetes:'),
    ['Minimum of 5 years of Kubernetes:'],
  );
  assert.deepEqual(extractRequirements('At least 5 years of Kubernetes.'), [
    'At least 5 years of Kubernetes.',
  ]);
});

void test('markdown requirements headings still extract bullets', () => {
  assert.deepEqual(
    extractRequirements(
      ['## Requirements', '• Kubernetes production experience'].join('\n'),
    ),
    ['Kubernetes production experience'],
  );
  assert.deepEqual(
    extractRequirements(
      ['## Must have', '• Kubernetes production experience'].join('\n'),
    ),
    ['Kubernetes production experience'],
  );
});

void test('the selected job shows posting gates without calling them a score', () => {
  const src = readFileSync(new URL('../app/workspace.tsx', import.meta.url), 'utf8');
  assert.match(src, /Posting vs verified facts/);
  assert.match(src, /Not an\s+employer score/);
  assert.match(
    src,
    /disabled=\{blocked\}\s+onClick=\{\(\) => save\('Skip'\)\}/,
  );
  assert.doesNotMatch(src, /match percentage|ATS score/i);
});
