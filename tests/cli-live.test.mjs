import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
const base = process.env.RELAY_TEST_URL || 'http://localhost:3000';

// Only run against a local development server, which uses mock authentication.
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw Error('API test is local-only.');
const signIn = await fetch(base + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
if ((signIn.status !== 302 && signIn.status !== 303) || !cookie) {
  throw Error(
    `Local sign-in unexpected status ${signIn.status}. Use http://localhost:3000 (pnpm dev). The CLI caches the Sites session cookie and cannot present production identity.`,
  );
}
const headers = { cookie };
async function api(path, body) {
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
// Drive the real entry point as a subprocess, so exit codes are the ones an
// agent would actually observe.
function relay(...args) {
  const result = spawnSync(
    process.execPath,
    ['integrations/relay.mjs', ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, RELAY_URL: base },
    },
  );
  return {
    code: result.status,
    out: result.stdout || '',
    err: result.stderr || '',
  };
}
const EXIT = { ok: 0, usage: 1, refused: 3 };

/* -- fixtures ------------------------------------------------------------- */
mkdirSync('private-data', { recursive: true });
await api('/api/workspace', {
  action: 'import',
  rows: [
    {
      url: 'https://example.com/research/cli',
      Name: 'Example CLI — Backend Engineer',
      Job: 'https://example.com/jobs/cli',
      Status: 'Held',
      Notes: 'Fictional posting used for CLI checks.',
    },
  ],
});
const job = (await api('/api/workspace')).data.jobs.find((j) =>
  j.job_key.endsWith('/jobs/cli'),
);
assert.ok(job, 'fixture job exists');
await api('/api/profile', {
  action: 'propose',
  facts: [
    { claim: 'Led a team of 6 engineers at Northstar', tag: 'role' },
    { claim: 'Holds a distributed systems certification', tag: 'credential' },
  ],
});
const proposed = (await api('/api/profile')).data.facts;
const verified = proposed.find((f) => f.claim.startsWith('Led a team'));
await api('/api/profile', {
  action: 'verify',
  id: verified.id,
  claim: verified.claim,
});
// Re-read after verifying, so this really is a fact that stayed unverified.
const unverified = (await api('/api/profile')).data.facts.find(
  (f) => f.status === 'Proposed',
);
assert.ok(unverified, 'one fact is left unverified on purpose');

/* -- login ---------------------------------------------------------------- */
let r = relay('login');
assert.equal(r.code, EXIT.ok, r.err);
assert.match(r.out, /Signed in\. Profile v\d+/);

/* -- brief ---------------------------------------------------------------- */
r = relay('brief', job.id, '--json');
assert.equal(r.code, EXIT.ok, r.err);
const brief = JSON.parse(r.out);
assert.equal(brief.cluster, 'backend');
assert.ok(
  brief.facts.some((f) => f.id === verified.id),
  'the brief offers the verified fact',
);
assert.ok(
  !brief.facts.some((f) => f.id === unverified.id),
  'and never offers an unverified one',
);
assert.ok(brief.rules_of_use.length >= 3, 'the rules of use travel with it');

r = relay('context', job.id, '--json');
assert.equal(r.code, EXIT.ok, r.err);
const context = JSON.parse(r.out);
assert.equal(context.job.id, job.id);
assert.equal(context.job.version, job.version);
assert.equal(context.job.accepted_draft, null);
assert.ok(
  context.research.some(
    (s) => s.notes === 'Fictional posting used for CLI checks.',
  ),
);
assert.ok(context.facts.some((f) => f.id === verified.id));
assert.ok(!context.facts.some((f) => f.id === unverified.id));
assert.deepEqual(context.history, { events: [], next: null });

r = relay('brief', 'no-such-job');
assert.equal(r.code, EXIT.refused, 'an unknown id is a refusal, not a crash');

/* -- versioned staging and exact acceptance ------------------------------- */
await api('/api/workspace', {
  action: 'import',
  rows: [
    {
      url: 'https://example.com/research/cli-stage',
      Name: 'Fictional Stage — Backend Engineer',
      Job: 'https://example.com/jobs/cli-stage',
      Status: 'Held',
      Notes: 'Preserved research.',
    },
  ],
});
const stagedJob = (await api('/api/workspace')).data.jobs.find((j) =>
  j.job_key.endsWith('/jobs/cli-stage'),
);
const stageFile = 'private-data/cli-stage.txt';
const exact = ' Original fictional words.\r\n';
writeFileSync(stageFile, exact);
const stage = (version, blocker = '') =>
  relay(
    'stage',
    stagedJob.id,
    stageFile,
    '--version',
    String(version),
    `--blocker=${blocker}`,
    '--json',
  );
const stageContext = () => {
  const result = relay('context', stagedJob.id, '--json');
  assert.equal(result.code, 0, result.err);
  return JSON.parse(result.out);
};
r = stage(stagedJob.version, 'Confirm fictional availability.');
assert.equal(r.code, 0, r.err);
let saved = stageContext();
assert.equal(saved.job.version, stagedJob.version + 1);
assert.equal(saved.job.draft, exact);
assert.equal(saved.job.blocker, 'Confirm fictional availability.');
assert.equal(saved.job.status, 'Held');
assert.equal(saved.job.accepted_draft, null);
assert.equal(saved.research[0].notes, 'Preserved research.');
assert.equal(JSON.parse(saved.history.events[0].detail).draft, exact);
assert.equal(saved.history.events[0].kind, 'Review saved');
assert.equal(
  stage(stagedJob.version).code,
  3,
  'generation-time version cannot be silently refreshed',
);
assert.deepEqual(
  stageContext(),
  saved,
  'stale stage changes neither job nor history',
);
assert.equal(readFileSync(stageFile, 'utf8'), exact);
// Synthetic acceptance belongs only to this regression fixture, never the demo.
assert.equal(
  (
    await api('/api/workspace', {
      action: 'save',
      id: stagedJob.id,
      version: saved.job.version,
      draft: exact,
      blocker: '',
      status: 'Ready',
    })
  ).status,
  200,
);
saved = stageContext();
assert.equal(saved.job.accepted_draft, exact);
const changed = ' Changed fictional wording.\n';
writeFileSync(stageFile, changed);
assert.equal(stage(saved.job.version).code, 0);
saved = stageContext();
assert.equal(saved.job.version, stagedJob.version + 3);
assert.equal(saved.job.draft, changed);
assert.equal(saved.job.blocker, '');
assert.equal(saved.job.status, 'Held');
assert.equal(
  saved.job.accepted_draft,
  null,
  'changed wording never inherits acceptance',
);
assert.equal(saved.history.events.length, 3);
assert.ok(
  saved.history.events.some(
    (e) => e.kind === 'Draft accepted' && JSON.parse(e.detail).draft === exact,
  ),
);
assert.ok(
  saved.history.events.some(
    (e) => e.kind === 'Review saved' && JSON.parse(e.detail).draft === changed,
  ),
);
assert.deepEqual(
  stageContext(),
  saved,
  'fresh retrieval preserves exact state and history',
);
rmSync(stageFile);

/* -- outcome: terminal kinds are never a silent side effect ---------------- */
r = relay('outcome', job.id, 'rejected');
assert.equal(
  r.code,
  EXIT.usage,
  'a terminal outcome needs explicit confirmation',
);
assert.match(r.err, /closes this job permanently/);

r = relay('outcome', job.id, 'submitted', '--receipt', 'ref-88');
assert.equal(
  r.code,
  EXIT.refused,
  'a draft must be accepted before submission',
);
assert.match(r.err, /Accept the exact draft/);

/* -- usage errors are distinguishable from refusals ------------------------ */
assert.equal(relay('stage', job.id).code, EXIT.usage);
assert.equal(relay('brief').code, EXIT.usage);
assert.equal(relay('nonsense').code, EXIT.usage);

console.log('CLI live checks passed.');
