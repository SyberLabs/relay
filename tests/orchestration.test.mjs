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
    company: `Example ${slug}`,
    level: 'senior',
    remote: 'remote',
    comp_min: 150000,
    comp_max: 190000,
    location: 'Remote — US',
    posted: new Date().toISOString(),
    source: 'greenhouse',
    effort: 20,
    ...over,
  };
}

/* -- read plane: structured attributes survive the import ------------------ */
const rows = [
  posting('alpha'),
  posting('bravo', { remote: 'onsite', comp_min: 260000, comp_max: 300000 }),
  posting('charlie', {
    level: 'junior',
    comp_min: 95000,
    comp_max: null,
    effort: 45,
  }),
  posting('delta', {
    remote: 'hybrid',
    comp_min: null,
    comp_max: null,
    level: 'staff',
  }),
];
const imported = await call('/api/workspace', { action: 'import', rows });
assert.equal(imported.status, 200, JSON.stringify(imported.data));
const workspace = (await call('/api/workspace')).data;
const alpha = workspace.jobs.find((j) => j.job_key.endsWith('/jobs/alpha'));
assert.ok(alpha, 'the posting landed');
assert.equal(alpha.company, 'Example alpha', 'attributes are persisted');
assert.equal(alpha.comp_min, 150000);
assert.equal(alpha.remote, 'remote');
assert.equal(alpha.status, 'Held', 'discovery never implies a decision');

/* -- preferences: elicited by choice, fitted, never invented --------------- */
let prefs = (await call('/api/preferences')).data;
assert.equal(prefs.answered, 0);
assert.deepEqual(
  Object.values(prefs.weights),
  [0, 0, 0, 0, 0],
  'no opinion is fabricated before any answer',
);
assert.ok(prefs.pair, 'a comparison is offered over the real pool');

// Answer consistently: always prefer the remote job over the onsite one.
for (let i = 0; i < 6; i++) {
  const pair = (await call('/api/preferences')).data.pair;
  if (!pair) break;
  const aRemote = pair.a.remote === 'remote';
  const chosen = await call('/api/preferences', {
    action: 'choose',
    winner: aRemote ? pair.a.job_key : pair.b.job_key,
    loser: aRemote ? pair.b.job_key : pair.a.job_key,
  });
  assert.equal(chosen.status, 200, JSON.stringify(chosen.data));
}
prefs = (await call('/api/preferences')).data;
assert.ok(prefs.answered >= 3, 'choices were recorded');
assert.ok(
  Object.values(prefs.weights).some((w) => w !== 0),
  'the model has an opinion once it has been told something',
);

const rejectedSame = await call('/api/preferences', {
  action: 'choose',
  winner: alpha.job_key,
  loser: alpha.job_key,
});
assert.equal(rejectedSame.status, 400, 'a job cannot beat itself');

const bravoKey = (await workspaceJob('bravo')).job_key;
const emptyDelta = await call('/api/preferences', {
  action: 'choose',
  winner: alpha.job_key,
  loser: bravoKey,
  delta: [],
});
assert.equal(emptyDelta.status, 400, JSON.stringify(emptyDelta.data));
assert.match(emptyDelta.data.error, /comparison vector/);
const huge = [1e308, 1e308, 1e308, 1e308, 1e308];
for (let i = 0; i < 4; i++) {
  const oversized = await call('/api/preferences', {
    action: 'choose',
    winner: alpha.job_key,
    loser: bravoKey,
    delta: huge,
  });
  assert.equal(oversized.status, 400, JSON.stringify(oversized.data));
  assert.match(oversized.data.error, /comparison vector/);
}
const afterEmpty = (await call('/api/preferences')).data;
assert.equal(
  afterEmpty.answered,
  prefs.answered,
  'client comparison vectors are not stored',
);
assert.ok(
  Object.values(afterEmpty.weights).every((w) => Number.isFinite(w)),
  'stored weights stay finite',
);

await call('/api/preferences', { action: 'minutes', minutes: 60 });
assert.equal((await call('/api/preferences')).data.minutes, 60);

/* -- plan: a portfolio sized to the budget, with reasons ------------------- */
const plan = (await call('/api/plan')).data;
assert.equal(plan.minutes, 60);
assert.ok(plan.plan.length > 0, 'something is selected');
assert.ok(plan.spent <= 60, 'the attention budget is never overspent');
assert.ok(
  plan.plan.every((r) => r.reason && r.reason.length > 10),
  'every selection carries a reason it can be argued with',
);
assert.ok(
  plan.plan.every((r) => ['reach', 'match', 'floor'].includes(r.tier)),
  'each row is placed in a probability tier',
);
assert.ok(
  plan.plan.every((r) => r.evidence === 0),
  'with no outcomes yet, odds are declared as a prior with no evidence',
);
assert.ok(plan.expected > 0, 'the expected best offer is reported');

/* -- the citation chain: fact, cited draft, acceptance --------------------- */
await call('/api/profile', {
  action: 'propose',
  facts: [{ claim: 'Led a team of 6 engineers at Northstar', tag: 'role' }],
});
const fact = (await call('/api/profile')).data.facts[0];
await call('/api/profile', { action: 'verify', id: fact.id });

const logged = await call('/api/drafts', {
  action: 'log',
  job_id: alpha.id,
  body: 'Your storage work is why I write. I led a team of 6 engineers.',
  cited: [fact.id],
});
assert.equal(logged.status, 200, JSON.stringify(logged.data));

const current = (await call('/api/workspace')).data.jobs.find(
  (j) => j.id === alpha.id,
);
const accepted = await call('/api/workspace', {
  action: 'save',
  id: alpha.id,
  version: current.version,
  status: 'Ready',
  draft: 'Your storage work is why I write. I led a team of 6 engineers.',
  blocker: '',
});
assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
const readyListed = (await call('/api/outcomes')).data.prep.find(
  (p) => p.id === alpha.id,
);
assert.ok(
  readyListed,
  'a Ready job appears on Track so a submission can be recorded',
);
assert.equal(readyListed.status, 'Ready');

const charlie = await workspaceJob('charlie');
const hijack = await call('/api/workspace', {
  action: 'save',
  id: charlie.id,
  version: charlie.version,
  status: 'Accepted',
  draft: '',
  blocker: '',
});
assert.equal(hijack.status, 400, JSON.stringify(hijack.data));
assert.match(hijack.data.error, /Record the outcome with a receipt/);
assert.equal((await workspaceJob('charlie')).status, 'Held');

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

/* -- interview prep falls out of the citation graph ------------------------ */
const tracked = (await call('/api/outcomes')).data;
const prep = tracked.prep.find((p) => p.id === alpha.id);
assert.ok(prep, 'the submitted application appears in prep');
assert.ok(prep.receipt, 'and carries its receipt');
assert.deepEqual(
  prep.claims.map((c) => c.claim),
  ['Led a team of 6 engineers at Northstar'],
  'the prep sheet is exactly what the draft committed to defending',
);

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

/* -- evidence is counted only where it is proven -------------------------- */
const rates = (await call('/api/outcomes')).data.rates;
const backend = rates.backend;
assert.ok(backend, 'rates are reported per role cluster');
assert.equal(backend.sent, 1, 'one receipted submission');
assert.equal(backend.responses, 1, 'which drew a reply');
assert.ok(backend.high > backend.low, 'reported as an interval, not a point');

/* -- Offer-to-Accepted is an outcome, not an editor status ---------------- */
const bravo = await workspaceJob('bravo');
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

// A closed job leaves the candidate pool.
const replanned = (await call('/api/plan')).data;
assert.ok(
  !replanned.plan.some((r) => r.id === alpha.id) &&
    !replanned.rest.some((r) => r.id === alpha.id),
  'history is not offered as this week’s work',
);

console.log('Orchestration API checks passed.');
