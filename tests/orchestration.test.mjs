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
async function workspaceJob(slug) {
  return (await call('/api/workspace')).data.jobs.find((j) =>
    j.job_key.endsWith(`/jobs/${slug}`),
  );
}
function posting(slug, over = {}) {
  return {
    url: `https://example.com/research/${slug}`,
    Name: `Example ${slug} — Backend Engineer`,
    Job: `https://example.com/jobs/${slug}`,
    Status: 'Held',
    Notes: 'Fictional posting used for orchestration checks.',
    ...over,
  };
}

/* -- one job record and exact accepted wording ----------------------------- */
const rows = [posting('alpha'), posting('bravo')];
const imported = await call('/api/workspace', { action: 'import', rows });
assert.equal(imported.status, 200, JSON.stringify(imported.data));
const alpha = await workspaceJob('alpha');
assert.ok(alpha, 'the posting landed');
assert.equal(alpha.status, 'Held', 'an imported job starts as research');
const acceptedDraft = 'I am interested in this role.';
const accepted = await call('/api/workspace', {
  action: 'save',
  id: alpha.id,
  version: alpha.version,
  status: 'Ready',
  draft: acceptedDraft,
  blocker: '',
});
assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
const readyListed = (await call('/api/outcomes')).data.applications.find(
  (p) => p.id === alpha.id,
);
assert.ok(
  readyListed,
  'a Ready job appears on Track so a submission can be recorded',
);
assert.equal(readyListed.status, 'Ready');
assert.equal(readyListed.accepted_draft, acceptedDraft);
const staleEdit = await call('/api/workspace', {
  action: 'save',
  id: alpha.id,
  version: alpha.version,
  status: 'Ready',
  draft: 'A stale edit.',
  blocker: '',
});
assert.equal(staleEdit.status, 409, JSON.stringify(staleEdit.data));
assert.equal((await workspaceJob('alpha')).accepted_draft, acceptedDraft);

const bravo = await workspaceJob('bravo');
const hijack = await call('/api/workspace', {
  action: 'save',
  id: bravo.id,
  version: bravo.version,
  status: 'Accepted',
  draft: '',
  blocker: '',
});
assert.equal(hijack.status, 400, JSON.stringify(hijack.data));
assert.match(hijack.data.error, /Record the outcome with a receipt/);
assert.equal((await workspaceJob('bravo')).status, 'Held');

/* -- the receipt invariant ------------------------------------------------ */
const readyAlpha = await workspaceJob('alpha');
const staleSubmit = await call('/api/outcomes', {
  action: 'record',
  id: alpha.id,
  version: readyAlpha.version - 1,
  kind: 'submitted',
  receipt: 'confirmation https://example.com/receipt/stale',
});
assert.equal(staleSubmit.status, 409, JSON.stringify(staleSubmit.data));
assert.equal((await workspaceJob('alpha')).status, 'Ready');
assert.equal(
  (await call('/api/outcomes')).data.outcomes.length,
  0,
  'a version conflict writes no outcome',
);

const noReceipt = await call('/api/outcomes', {
  action: 'record',
  id: alpha.id,
  version: readyAlpha.version,
  kind: 'submitted',
});
assert.equal(noReceipt.status, 400);
assert.match(noReceipt.data.error, /needs a receipt/);
assert.equal(
  (await call('/api/workspace')).data.jobs.find((j) => j.id === alpha.id)
    .status,
  'Ready',
  'a refused submission changes nothing',
);

const submitted = await call('/api/outcomes', {
  action: 'record',
  id: alpha.id,
  version: (await workspaceJob('alpha')).version,
  kind: 'submitted',
  receipt: 'confirmation https://example.com/receipt/9931',
});
assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
assert.equal(submitted.data.status, 'Submitted');

/* -- outcomes close the loop and are final -------------------------------- */
await call('/api/outcomes', {
  action: 'record',
  id: alpha.id,
  version: (await workspaceJob('alpha')).version,
  kind: 'screen',
});
const rejected = await call('/api/outcomes', {
  action: 'record',
  id: alpha.id,
  version: (await workspaceJob('alpha')).version,
  kind: 'rejected',
});
assert.equal(rejected.data.status, 'Closed');

const afterClose = await call('/api/outcomes', {
  action: 'record',
  id: alpha.id,
  version: (await workspaceJob('alpha')).version,
  kind: 'response',
});
assert.equal(afterClose.status, 400);
assert.match(afterClose.data.error, /already ended/);

// Rediscovery must not reopen it.
await call('/api/workspace', {
  action: 'import',
  rows: [
    posting('alpha', {
      Status: 'Live loop',
      url: 'https://example.com/research/alpha-again',
    }),
  ],
});
assert.equal(
  (await call('/api/workspace')).data.jobs.find((j) => j.id === alpha.id)
    .status,
  'Closed',
  'an ended application stays ended through rediscovery',
);

/* -- Offer-to-Accepted is an outcome, not an editor status ---------------- */
const bravoReady = await call('/api/workspace', {
  action: 'save',
  id: bravo.id,
  version: bravo.version,
  status: 'Ready',
  draft: 'Your storage work is why I write. I led a team of 6 engineers.',
  blocker: '',
});
assert.equal(bravoReady.status, 200, JSON.stringify(bravoReady.data));
const bravoSubmit = await call('/api/outcomes', {
  action: 'record',
  id: bravo.id,
  version: (await workspaceJob('bravo')).version,
  kind: 'submitted',
  receipt: 'confirmation https://example.com/receipt/bravo',
});
assert.equal(bravoSubmit.status, 200, JSON.stringify(bravoSubmit.data));
const bravoOffer = await call('/api/outcomes', {
  action: 'record',
  id: bravo.id,
  version: (await workspaceJob('bravo')).version,
  kind: 'offer',
});
assert.equal(bravoOffer.data.status, 'Offer');
const bravoAccepted = await call('/api/outcomes', {
  action: 'record',
  id: bravo.id,
  version: (await workspaceJob('bravo')).version,
  kind: 'accepted',
});
assert.equal(bravoAccepted.status, 200, JSON.stringify(bravoAccepted.data));
assert.equal(bravoAccepted.data.status, 'Accepted');
assert.equal((await workspaceJob('bravo')).status, 'Accepted');

console.log('Orchestration API checks passed.');
