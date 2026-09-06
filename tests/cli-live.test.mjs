import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
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
await api('/api/profile', { action: 'verify', id: verified.id });
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

r = relay('brief', 'no-such-job');
assert.equal(r.code, EXIT.refused, 'an unknown id is a refusal, not a crash');

/* -- log: the refusal must write nothing ---------------------------------- */
const before = (await api('/api/drafts')).data.drafts.length;
writeFileSync(
  'private-data/cli-bad.txt',
  'I led a team of 6 engineers. I also cut infrastructure spend by 40%.',
);
r = relay('log', job.id, 'private-data/cli-bad.txt', '--cite', verified.id);
assert.equal(r.code, EXIT.refused, r.err);
assert.match(r.err, /refused — nothing was written/);
assert.match(r.err, /cut infrastructure spend by 40%/, 'names the sentence');
assert.equal(
  (await api('/api/drafts')).data.drafts.length,
  before,
  'a refused draft is not stored — a gate that records anyway is worse than none',
);

/* -- log: citing an unverified fact is refused too ------------------------ */
writeFileSync('private-data/cli-ok.txt', 'Your storage work is why I write.');
r = relay('log', job.id, 'private-data/cli-ok.txt', '--cite', unverified.id);
assert.equal(r.code, EXIT.refused);
assert.match(r.err, /not verified or has expired/);

/* -- log: employer years still need a citation on current main ------------ */
writeFileSync(
  'private-data/cli-year.txt',
  'I read your 2024 post on storage engines.',
);
r = relay('log', job.id, 'private-data/cli-year.txt', '--cite', verified.id);
assert.equal(r.code, EXIT.refused, r.err);
assert.match(r.err, /2024/);
assert.equal(
  (await api('/api/drafts')).data.drafts.length,
  before,
  'an employer year without a cited fact is not stored',
);

/* -- log: a supported claim is stored exactly once ------------------------ */
writeFileSync('private-data/cli-good.txt', 'I led a team of 6 engineers.');
r = relay('log', job.id, 'private-data/cli-good.txt', '--cite', verified.id);
assert.equal(r.code, EXIT.ok, r.err);
assert.match(r.out, /logged · cluster backend/);
assert.equal(
  (await api('/api/drafts')).data.drafts.length,
  before + 1,
  'the accepted draft is stored exactly once',
);

/* -- status and plan ------------------------------------------------------ */
r = relay('status', '--json');
assert.equal(r.code, EXIT.ok, r.err);
const status = JSON.parse(r.out);
assert.ok(status.pending >= 1, 'the logged draft is pending review');
assert.ok(status.review, 'and review is reported as due');
assert.equal(status.trust.backend.state, 'Probation');

r = relay('plan', '--json');
assert.equal(r.code, EXIT.ok, r.err);
const plan = JSON.parse(r.out);
assert.ok(plan.spent <= plan.minutes, 'the budget is never overspent');

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

/* -- a refusal is now counted, while the draft still is not --------------- */
function readinessNow() {
  const res = relay('hunt', '--readiness', '--json');
  assert.equal(res.code, EXIT.ok, res.err);
  return JSON.parse(res.out);
}
const counted = readinessNow();
assert.ok(counted.refusals.refused >= 1, 'the earlier refusals were recorded');
assert.ok(
  counted.refusals.attempts > counted.refusals.refused,
  'accepted drafts count as attempts too',
);
const beforeRefusal = readinessNow().refusals.refused;
const draftsBefore = (await api('/api/drafts')).data.drafts.length;
writeFileSync(
  'private-data/cli-bad2.txt',
  'I led a team of 6 engineers. I also raised revenue by 80%.',
);
r = relay('log', job.id, 'private-data/cli-bad2.txt', '--cite', verified.id);
assert.equal(r.code, EXIT.refused, r.err);
assert.equal(
  readinessNow().refusals.refused,
  beforeRefusal + 1,
  'the refusal is counted so the gate can be measured',
);
assert.equal(
  (await api('/api/drafts')).data.drafts.length,
  draftsBefore,
  'and the refused draft is still not stored',
);
rmSync('private-data/cli-bad2.txt', { force: true });

/* -- readiness reports gates without running anything --------------------- */
const gates = readinessNow();
assert.equal(gates.gates.length, 4);
assert.deepEqual(
  gates.gates.map((g) => g.id),
  ['supervised_run', 'graduated_cluster', 'receipted_outcomes', 'refusal_rate'],
);
assert.equal(gates.ready, false, 'a fresh workspace is not ready');
assert.ok(gates.allowance >= 1, 'but is still allowed a supervised draft');

r = relay('hunt');
assert.equal(r.code, EXIT.usage, 'the driver is not implemented yet');
assert.match(r.err, /not implemented yet/);

/* -- usage errors are distinguishable from refusals ------------------------ */
assert.equal(relay('log', job.id).code, EXIT.usage);
assert.equal(relay('brief').code, EXIT.usage);
assert.equal(relay('nonsense').code, EXIT.usage);

rmSync('private-data/cli-bad.txt', { force: true });
rmSync('private-data/cli-ok.txt', { force: true });
rmSync('private-data/cli-year.txt', { force: true });
rmSync('private-data/cli-good.txt', { force: true });
console.log('CLI live checks passed.');
