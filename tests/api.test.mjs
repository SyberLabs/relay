import assert from 'node:assert/strict';
const base = process.env.RELAY_TEST_URL || 'http://localhost:3000';
const signIn = await fetch(base + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const headers = { cookie: signIn.headers.get('set-cookie').split(';')[0] };
async function call(body, h = headers) {
  const r = await fetch(base + '/api/workspace', {
    method: body ? 'POST' : 'GET',
    headers: { ...h, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}

// Only run against a local development server, which uses mock authentication.
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw Error('API test is local-only.');
const boot = await call({ action: 'bootstrap' });
assert.equal(boot.status, 200, JSON.stringify(boot.data));
const a = (await call()).data;
await call({ action: 'bootstrap' });
const b = (await call()).data;
assert.equal(b.jobs.length, a.jobs.length);
assert.equal(b.sources.length, a.sources.length);
const replay = (await call({ action: 'replay' })).data;
assert.deepEqual([replay.new, replay.known, replay.submitted], [0, 3, 2]);
const job = b.jobs.find(
  (j) => j.job_key === 'https://example.com/jobs/backend',
);
let result = await call({
  action: 'save',
  id: job.id,
  version: job.version,
  status: 'Ready',
  draft: 'A reviewed answer.',
  blocker: '',
});
assert.equal(result.status, 200, JSON.stringify(result.data));
let fresh = (await call()).data.jobs.find((j) => j.id === job.id);
assert.equal(fresh.accepted_draft, 'A reviewed answer.');
result = await call({
  action: 'save',
  id: job.id,
  version: job.version,
  status: 'Held',
  draft: 'stale',
  blocker: '',
});
assert.notEqual(result.status, 200);
await call({
  action: 'save',
  id: fresh.id,
  version: fresh.version,
  status: 'Held',
  draft: 'Edited answer.',
  blocker: '',
});
fresh = (await call()).data.jobs.find((j) => j.id === job.id);
assert.equal(fresh.accepted_draft, null);
for (const key of [
  'https://example.com/jobs/platform',
  'https://example.com/jobs/software',
]) {
  const active = (await call()).data.jobs.find((j) => j.job_key === key);
  result = await call({
    action: 'save',
    id: active.id,
    version: active.version,
    status: active.status,
    draft: 'Follow-up note',
    blocker: 'Next step',
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const updated = (await call()).data.jobs.find((j) => j.id === active.id);
  assert.equal(updated.status, active.status);
  assert.equal(updated.draft, 'Follow-up note');
  result = await call({
    action: 'save',
    id: updated.id,
    version: updated.version,
    status: 'Held',
    draft: 'Reset',
    blocker: '',
  });
  assert.notEqual(result.status, 200);
}
result = await call(undefined, {
  'oai-authenticated-user-id': 'spoof',
  'oai-authenticated-user-email': 'other@example.com',
});
assert.equal(result.status, 401);
console.log(
  'PASS: imports, duplicate history, exact acceptance, stale edits, editable interview drafts, preserved status and authentication.',
);
