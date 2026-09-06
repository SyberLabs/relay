import test from 'node:test';
import assert from 'node:assert/strict';
import * as profile from '../lib/profile.ts';
import * as utility from '../lib/utility.ts';
import * as scoring from '../lib/scoring.ts';
import * as outcomes from '../lib/outcomes.ts';
import * as integrationFiles from '../lib/integration-files.ts';

// An export is a promise to a caller. Nothing outside these modules called the
// names below, so keeping them exported invited a second implementation of a
// rule that already has one owner, and hid the fact that some had no caller at
// all. This guard fails if one is re-exported before a caller exists.
const withoutCallers = [
  {
    path: 'lib/profile.ts',
    module: profile,
    names: [
      'factStates',
      'verdicts',
      'factTags',
      'confidences',
      'numbersIn',
      'draftEdit',
    ],
  },
  {
    path: 'lib/utility.ts',
    module: utility,
    names: ['zeroWeights', 'ordinal', 'domainFeature', 'toWeights', 'toVector'],
  },
  {
    path: 'lib/scoring.ts',
    module: scoring,
    names: ['decayDays', 'marginalGain'],
  },
  {
    path: 'lib/outcomes.ts',
    module: outcomes,
    names: ['terminalStates', 'outcomeKinds', 'countsAsResponse'],
  },
  {
    path: 'lib/integration-files.ts',
    module: integrationFiles,
    names: ['packetMatchesStarted'],
  },
];

void test('lib modules export only what another module actually calls', () => {
  for (const entry of withoutCallers)
    for (const symbol of entry.names)
      assert.equal(
        symbol in entry.module,
        false,
        entry.path + ' re-exported ' + symbol,
      );
});

// The behaviour those internals implement is still reachable through the
// exports that do have callers, so this is a narrower surface, not less product.
void test('the surviving exports still carry the removed internals behaviour', () => {
  assert.equal(outcomes.isTerminal('Closed'), true);
  assert.equal(outcomes.isTerminal('Held'), false);
  assert.equal(outcomes.statusAfter('offer'), 'Offer');
  assert.deepEqual(Object.keys(utility.fitWeights([[1, 0, 0, 0, 0]])).sort(), [
    'comp',
    'domain',
    'level',
    'remote',
    'size',
  ]);
  const posting = {
    job_key: 'k',
    name: 'Backend Engineer',
    company: 'Northstar',
    level: 'senior',
    remote: 'remote',
    size: 'growth',
    comp_min: null,
    comp_max: null,
    posted: null,
  };
  assert.equal(utility.vector(posting, new Set()).length, 5);
  assert.ok(scoring.freshness(null, new Date().toISOString()) > 0);
  assert.equal(
    profile.validateFact({
      claim: 'Shipped 3 releases in 2025',
      evidence: 'Resume',
      tag: 'metric',
    }).tag,
    'metric',
  );
});
