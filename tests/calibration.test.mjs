import assert from 'node:assert/strict';
const base = process.env.RELAY_TEST_URL || 'http://localhost:3000';

// Only run against a local development server, which uses mock authentication.
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw Error('API test is local-only.');
const signIn = await fetch(base + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const headers = { cookie: signIn.headers.get('set-cookie').split(';')[0] };
async function call(path, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...headers,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}

await call('/api/workspace', { action: 'bootstrap' });
const workspace = (await call('/api/workspace')).data;
const job = workspace.jobs.find(
  (j) => j.job_key === 'https://example.com/jobs/backend',
);
assert.ok(job, 'fictional backend job is present');

// Extraction proposes only. Nothing it returns is usable until verified.
const extracted = await call('/api/profile', {
  action: 'extract',
  text: [
    'EXPERIENCE',
    'Led a team of 6 engineers at Northstar Example from 2023 to 2025',
    'Reduced ingestion p99 latency from 400ms to 40ms',
  ].join('\n'),
});
assert.equal(extracted.status, 200, JSON.stringify(extracted.data));
assert.equal(extracted.data.candidates.length, 2);
const beforePropose = (await call('/api/profile')).data;
assert.equal(beforePropose.usable, 0, 'extraction writes nothing');

await call('/api/profile', {
  action: 'propose',
  facts: extracted.data.candidates,
});
const proposed = (await call('/api/profile')).data;
assert.equal(proposed.facts.length, 2);
assert.equal(proposed.usable, 0, 'proposed facts are not yet citable');

// A draft may not cite a fact that has only been proposed.
const teamFact = proposed.facts.find((f) => f.claim.startsWith('Led a team'));
const early = await call('/api/drafts', {
  action: 'log',
  job_id: job.id,
  body: 'I led a team of 6 engineers.',
  cited: [teamFact.id],
});
assert.equal(early.status, 400);
assert.match(early.data.error, /not verified or has expired/);

await call('/api/profile', { action: 'verify', id: teamFact.id });
const afterVerify = (await call('/api/profile')).data;
assert.equal(afterVerify.usable, 1);
assert.ok(
  afterVerify.version > beforePropose.version,
  'verification advances the profile version',
);

// An uncited claim is refused outright rather than queued for review.
const uncited = await call('/api/drafts', {
  action: 'log',
  job_id: job.id,
  body: 'I led a team of 6 engineers and grew revenue 300%.',
  cited: [teamFact.id],
});
assert.equal(uncited.status, 400);
assert.match(uncited.data.error, /Unsupported claim/);
assert.equal(
  (await call('/api/drafts')).data.drafts.length,
  0,
  'a refused draft is not written',
);

// A supported claim logs, and lands on probation rather than in the workspace.
const logged = await call('/api/drafts', {
  action: 'log',
  job_id: job.id,
  body: 'Your storage work is why I write. I led a team of 6 engineers.',
  cited: [teamFact.id],
});
assert.equal(logged.status, 200, JSON.stringify(logged.data));
assert.equal(logged.data.cluster, 'backend');
assert.equal(logged.data.staged, false, 'an unproven cluster does not stage');
assert.equal(logged.data.trust, 'Probation');
assert.equal(logged.data.review.reason, 'New cluster');
assert.equal(
  (await call('/api/workspace')).data.jobs.find((j) => j.id === job.id).draft,
  '',
  'the job record is untouched while the cluster is on probation',
);

// The session is the calibration step: a correction becomes a rule.
const opened = await call('/api/drafts', { action: 'open-batch' });
assert.equal(opened.status, 200, JSON.stringify(opened.data));
assert.equal(opened.data.reason, 'New cluster');
const drafts = (await call('/api/drafts')).data.drafts;
assert.equal(drafts[0].batch, opened.data.id);

const corrected = await call('/api/drafts', {
  action: 'correct',
  id: drafts[0].id,
  corrected: 'I led a team of 6 engineers on ingestion.',
});
assert.equal(corrected.status, 200, JSON.stringify(corrected.data));
assert.ok(corrected.data.proposals.length, 'a correction proposes rules');

const versionBeforeClose = (await call('/api/profile')).data.version;
const closed = await call('/api/drafts', {
  action: 'close-batch',
  id: opened.data.id,
  rules: [{ rule: 'Open with the employer, not yourself.', scope: 'backend' }],
});
assert.equal(closed.status, 200, JSON.stringify(closed.data));
const afterClose = (await call('/api/profile')).data;
assert.equal(afterClose.rules.length, 1);
assert.ok(
  afterClose.version > versionBeforeClose,
  'closing with rules advances the profile version',
);
const afterBatch = (await call('/api/drafts')).data;
assert.equal(afterBatch.drafts[0].verdict, 'Corrected');
assert.equal(afterBatch.trigger, null, 'the queue is clear after review');

// Repeated clean reviews graduate the cluster, which then stages unattended.
// Vary the wording without introducing numbers: any digit absent from the
// cited facts is refused, which is the behaviour asserted above.
for (const area of ['ingestion', 'storage', 'billing', 'search', 'indexing']) {
  const body = `Your storage work is why I write. I led a team of 6 engineers on the ${area} path.`;
  const run = await call('/api/drafts', {
    action: 'log',
    job_id: job.id,
    body,
    cited: [teamFact.id],
  });
  assert.equal(run.status, 200, JSON.stringify(run.data));
  const queue = (await call('/api/drafts')).data.drafts;
  const latest = queue.at(-1);
  await call('/api/drafts', { action: 'accept', id: latest.id });
}
const graduated = (await call('/api/drafts')).data;
assert.equal(
  graduated.trust.backend.state,
  'Graduated',
  'five clean reviews graduate the cluster',
);

const staged = await call('/api/drafts', {
  action: 'log',
  job_id: job.id,
  body: 'Your storage work is why I write. I led a team of 6 engineers here.',
  cited: [teamFact.id],
});
assert.equal(staged.data.staged, true, 'a graduated cluster stages its draft');
const stagedJob = (await call('/api/workspace')).data.jobs.find(
  (j) => j.id === job.id,
);
assert.match(stagedJob.draft, /I led a team of 6 engineers here/);
assert.equal(stagedJob.status, 'Held', 'staging never changes status');
assert.equal(
  stagedJob.accepted_draft,
  null,
  'staging never accepts on the human’s behalf',
);

const employerYear = await call('/api/drafts', {
  action: 'log',
  job_id: job.id,
  body: 'I read your 2024 post on storage engines. I led a team of 6 engineers.',
  cited: [teamFact.id],
});
assert.equal(employerYear.status, 200, JSON.stringify(employerYear.data));

// Retiring the cited fact must not silently leave graduated autonomy running.
await call('/api/profile', { action: 'retire', id: teamFact.id });
const blocked = await call('/api/drafts', {
  action: 'log',
  job_id: job.id,
  body: 'I led a team of 6 engineers.',
  cited: [teamFact.id],
});
assert.equal(blocked.status, 400);
assert.match(blocked.data.error, /not verified or has expired/);

console.log('Calibration API checks passed.');
