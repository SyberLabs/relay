import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundedPolicyMaximum,
  policyJobIds,
  ctxTally,
  draftProgress,
  formatLocation,
  formatPay,
  isBlockedJob,
  isSentJob,
  policyExpiryIso,
  runtimeLanes,
  sentPip,
  sourceLabel,
  splitJobName,
  whyPicked,
} from '../lib/runtime.ts';

void test('splitJobName reads company em-dash role titles', () => {
  assert.deepEqual(splitJobName('Hunt3 — Cedar Example — Engineer'), {
    org: 'Cedar Example',
    role: 'Engineer',
  });
  assert.deepEqual(splitJobName('Solo title'), {
    org: '',
    role: 'Solo title',
  });
});

void test('formatPay and formatLocation stay literal when empty', () => {
  assert.equal(formatPay(null, null), 'not listed');
  assert.equal(formatPay(190000, 250000), '$190k – $250k');
  assert.equal(formatPay(185000, 185000), '$185k');
  assert.equal(formatLocation('Seattle', 'hybrid'), 'Seattle, hybrid');
  assert.equal(formatLocation('', 'remote'), 'remote');
  assert.equal(formatLocation('', ''), 'not listed');
});

void test('sourceLabel prefers stored source then hostname', () => {
  assert.equal(
    sourceLabel('Greenhouse', 'https://example.com/jobs/1'),
    'Greenhouse',
  );
  assert.equal(
    sourceLabel('', 'https://boards.greenhouse.io/acme/jobs/1'),
    'boards.greenhouse.io',
  );
  assert.equal(sourceLabel('', null), 'saved job');
});

void test('draft progress does not call an unaccepted Held job sent', () => {
  assert.equal(
    draftProgress({
      status: 'Held',
      draft: '',
      accepted_draft: null,
      blocker: '',
    }).pct,
    15,
  );
  assert.equal(
    draftProgress({
      status: 'Held',
      draft: 'words',
      accepted_draft: null,
      blocker: 'Need a date',
    }).label,
    'blocked',
  );
  assert.equal(
    draftProgress({
      status: 'Ready',
      draft: 'words',
      accepted_draft: 'words',
      blocker: '',
    }).step,
    'Exact draft accepted. Nothing has been sent.',
  );
  assert.equal(
    draftProgress({
      status: 'Submitted',
      draft: 'words',
      accepted_draft: 'words',
      blocker: '',
    }).label,
    'recorded',
  );
});

void test('lanes put blockers south, outcomes west, and Held east', () => {
  const jobs = [
    { id: 'a', status: 'Held', blocker: '' },
    { id: 'b', status: 'Held', blocker: 'Missing start date' },
    { id: 'c', status: 'Ready', blocker: '' },
    { id: 'd', status: 'Submitted', blocker: '' },
    { id: 'e', status: 'Skip', blocker: 'old' },
    { id: 'f', status: 'Closed', blocker: '' },
  ];
  const idle = runtimeLanes(jobs, '', 'Held');
  assert.deepEqual(
    idle.queue.map((j) => j.id),
    ['a'],
  );
  assert.deepEqual(
    idle.blocked.map((j) => j.id),
    ['b'],
  );
  assert.deepEqual(
    idle.sent.map((j) => j.id),
    ['d', 'e', 'f'],
  );
  const loaded = runtimeLanes(jobs, 'a', 'Held');
  assert.equal(loaded.core?.id, 'a');
  assert.deepEqual(
    loaded.queue.map((j) => j.id),
    ['a'],
  );
  const loadedBlocked = runtimeLanes(jobs, 'b', 'Held');
  assert.equal(loadedBlocked.core?.id, 'b');
  assert.deepEqual(
    loadedBlocked.blocked.map((j) => j.id),
    ['b'],
  );
  assert.deepEqual(
    loadedBlocked.queue.map((j) => j.id),
    ['a'],
  );
  const all = runtimeLanes(jobs, '', 'All');
  assert.deepEqual(
    all.queue.map((j) => j.id),
    ['a', 'c'],
  );
  assert.equal(isBlockedJob(jobs[1]), true);
  assert.equal(isBlockedJob(jobs[4]), false);
  assert.equal(isSentJob(jobs[3]), true);
  assert.equal(sentPip('Skip'), 'no');
  assert.equal(sentPip('Submitted'), 'ok');
});

void test('whyPicked prefers evidence overlap then notes', () => {
  assert.match(
    whyPicked([], {
      gates: [{ text: 'Kubernetes', status: 'hit', factId: 'f1' }],
    }),
    /1 required line/,
  );
  assert.equal(
    whyPicked([{ notes: 'Fictional posting notes.' }], { gates: [] }),
    'Fictional posting notes.',
  );
  assert.match(whyPicked([], null), /Import posting text/);
  assert.equal(ctxTally(2, 1), '2 facts · 1 style rule');
  assert.equal(ctxTally(0, 0), 'no saved context yet');
});

void test('enabling autopilot refreshes an expired policy window', () => {
  const now = Date.parse('2026-09-07T12:00:00.000Z');
  assert.equal(
    policyExpiryIso('2026-08-01T00:00:00.000Z', true, now),
    '2026-09-14T12:00:00.000Z',
  );
  assert.equal(
    policyExpiryIso('2026-09-10T00:00:00.000Z', true, now),
    '2026-09-10T00:00:00.000Z',
  );
  assert.equal(
    policyExpiryIso('2026-08-01T00:00:00.000Z', false, now),
    '2026-08-01T00:00:00.000Z',
  );
  assert.equal(boundedPolicyMaximum(8.9), 8);
  assert.equal(boundedPolicyMaximum(0), 1);
  assert.equal(boundedPolicyMaximum(400), 100);
});

void test('policy job ids stay at the saved bounded scope', () => {
  assert.deepEqual(policyJobIds(null), []);
  assert.deepEqual(policyJobIds({ jobs: 'not-json' }), []);
  assert.deepEqual(policyJobIds({ jobs: '{"id":"x"}' }), []);
  assert.deepEqual(policyJobIds({ jobs: '["job-a","job-b"]' }), [
    'job-a',
    'job-b',
  ]);
  assert.equal(
    policyJobIds({
      jobs: JSON.stringify(Array.from({ length: 101 }, (_, i) => 'job-' + i)),
    }).length,
    100,
  );
});
