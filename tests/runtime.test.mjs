import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationReviewCopy,
  applicationReviewKind,
  boundedPolicyMaximum,
  policyJobIds,
  ctxTally,
  formatLocation,
  formatPay,
  isBlockedJob,
  isSentJob,
  policyExpiryIso,
  queueRowHint,
  runtimeLanes,
  asSheetJobs,
  jobsMatchingQueue,
  sentPip,
  sourceLabel,
  splitJobName,
  whyPicked,
  workbenchQueue,
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

void test('an accepted prose draft is not ready for approval', () => {
  const readyJob = {
    status: 'Ready',
    draft: 'words',
    accepted_draft: 'words',
    blocker: '',
  };
  assert.equal(applicationReviewKind(readyJob, null), 'preparing');
  assert.equal(
    applicationReviewKind(readyJob, {
      ready: false,
      armed: false,
      accept_enabled: false,
      state: null,
    }),
    'draft_only',
  );
  assert.equal(
    applicationReviewKind(readyJob, {
      ready: true,
      armed: true,
      accept_enabled: true,
      state: 'proposed',
    }),
    'ready_for_approval',
  );
  assert.doesNotMatch(applicationReviewCopy('draft_only').title, /100|%/);
  assert.match(applicationReviewCopy('draft_only').detail, /not ready/i);
});

void test('review kinds stay truthful through send and receipt', () => {
  const held = {
    status: 'Held',
    draft: '',
    accepted_draft: null,
    blocker: '',
  };
  assert.equal(applicationReviewKind(held, null), 'preparing');
  assert.equal(applicationReviewCopy('preparing').title, 'Not prepared yet');
  assert.match(
    applicationReviewCopy('preparing').detail,
    /Ask your agent to prepare the destination, answers, and files/i,
  );
  assert.doesNotMatch(applicationReviewCopy('preparing').detail, /gathering/i);
  assert.equal(
    applicationReviewKind({ ...held, blocker: 'Need a start date' }, null),
    'needs_answer',
  );
  assert.equal(
    applicationReviewKind(held, {
      ready: false,
      armed: false,
      accept_enabled: false,
      state: null,
      fields: [{ unknown: true }],
    }),
    'needs_answer',
  );
  assert.equal(
    applicationReviewKind(held, {
      ready: true,
      armed: false,
      accept_enabled: false,
      state: 'proposed',
    }),
    'disconnected',
  );
  assert.match(
    applicationReviewCopy('disconnected').detail,
    /Reconnect your agent/i,
  );
  assert.equal(
    applicationReviewKind({ ...held, status: 'Closed' }, null),
    'ended',
  );
  assert.notEqual(
    applicationReviewKind({ ...held, status: 'Closed' }, null),
    'submitted',
  );
  assert.equal(
    applicationReviewKind(held, {
      ready: false,
      armed: false,
      accept_enabled: false,
      state: 'cancelled',
      recorded_result: 'not-submitted',
      recorded_receipt: 'Form closed before submit',
    }),
    'not_sent',
  );
  assert.equal(
    applicationReviewKind(held, {
      ready: false,
      armed: false,
      accept_enabled: false,
      state: 'cancelled',
    }),
    'not_sent',
  );
  assert.match(applicationReviewCopy('not_sent').title, /Not sent/);
  assert.equal(
    applicationReviewKind(held, {
      ready: true,
      armed: true,
      accept_enabled: false,
      state: 'authorized',
    }),
    'authorized',
  );
  assert.equal(
    applicationReviewKind(held, {
      ready: true,
      armed: true,
      accept_enabled: false,
      state: 'executing',
    }),
    'sending',
  );
  assert.equal(
    applicationReviewKind(
      { ...held, status: 'Submitted' },
      {
        ready: true,
        armed: false,
        accept_enabled: false,
        state: 'submitted',
        recorded_result: 'submitted',
        recorded_receipt: 'NW-88421',
      },
    ),
    'submitted',
  );
  assert.equal(
    applicationReviewKind(held, {
      ready: true,
      armed: false,
      accept_enabled: false,
      state: 'uncertain',
      recorded_result: 'uncertain',
    }),
    'uncertain',
  );
  assert.match(
    applicationReviewCopy('submitted').detail,
    /recorded by your agent/i,
  );
  assert.doesNotMatch(
    applicationReviewCopy('submitted').detail,
    /independently verified/i,
  );
  assert.doesNotMatch(
    applicationReviewCopy('ready_for_approval').detail,
    /POST|frozen|operative|Permit/i,
  );
  assert.doesNotMatch(
    applicationReviewCopy('sending').detail,
    /retry automatically/i,
  );
});

void test('authorized without begin is waiting, not active submitting', () => {
  const held = {
    status: 'Held',
    draft: '',
    accepted_draft: null,
    blocker: '',
  };
  const authorizedDisconnected = {
    ready: true,
    armed: false,
    accept_enabled: false,
    state: 'authorized',
  };
  assert.equal(
    applicationReviewKind(held, authorizedDisconnected),
    'authorized',
  );
  assert.notEqual(
    applicationReviewKind(held, authorizedDisconnected),
    'sending',
  );
  assert.notEqual(
    applicationReviewKind(held, authorizedDisconnected),
    'disconnected',
  );
  assert.equal(
    applicationReviewCopy('authorized').title,
    'Approved, waiting for your agent to send',
  );
  assert.doesNotMatch(
    applicationReviewCopy('authorized').title,
    /Sending application|submitting/i,
  );
  assert.doesNotMatch(
    applicationReviewCopy('authorized').detail,
    /submitting/i,
  );
  assert.equal(
    applicationReviewKind(held, {
      ready: true,
      armed: true,
      accept_enabled: false,
      state: 'executing',
    }),
    'sending',
  );
  assert.equal(
    applicationReviewCopy('sending').title,
    'Sending application',
  );
  assert.equal(
    applicationReviewCopy('sending').detail,
    'Your agent is submitting the application you approved',
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
  assert.deepEqual(
    jobsMatchingQueue(jobs, 'All').map((j) => j.id),
    ['a', 'b', 'c', 'd', 'e', 'f'],
  );
  assert.deepEqual(
    jobsMatchingQueue(jobs, 'Ready').map((j) => j.id),
    ['c'],
  );
  assert.deepEqual(
    asSheetJobs([{ id: 'a', name: 'Role', status: 'Held' }, { id: 'bad' }]),
    [{ id: 'a', name: 'Role', status: 'Held' }],
  );
  assert.deepEqual(
    asSheetJobs([{ id: 'x'.repeat(201), name: 'n', status: 'Held' }]),
    [],
  );
  assert.equal(isBlockedJob(jobs[1]), true);
  assert.equal(isBlockedJob(jobs[4]), false);
  assert.equal(isSentJob(jobs[3]), true);
  assert.equal(sentPip('Skip'), 'no');
  assert.equal(sentPip('Submitted'), 'ok');
});

void test('workbench queue keeps Ready jobs as draft-only waiting rows', () => {
  const jobs = [
    { id: 'a', name: 'Northwind — Platform', status: 'Held', blocker: '' },
    {
      id: 'b',
      name: 'Harborline — Backend',
      status: 'Held',
      blocker: 'Need work authorization',
    },
    { id: 'c', name: 'Ready Co — Draft', status: 'Ready', blocker: '' },
    { id: 'd', name: 'Copperleaf — ML', status: 'Submitted', blocker: '' },
    { id: 'e', name: 'Skip Co — Old', status: 'Skip', blocker: 'old' },
  ];
  const lanes = workbenchQueue(jobs, '');
  assert.deepEqual(
    lanes.waiting.map((job) => job.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    lanes.ledger.map((job) => job.id),
    ['d', 'e'],
  );
  assert.equal(queueRowHint(jobs[2]), 'In review');
  assert.match(queueRowHint(jobs[1]), /needs an answer/i);
  const filtered = workbenchQueue(jobs, 'copper');
  assert.deepEqual(
    filtered.waiting.map((job) => job.id),
    [],
  );
  assert.deepEqual(
    filtered.ledger.map((job) => job.id),
    ['d'],
  );
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
