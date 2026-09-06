import assert from 'node:assert/strict';
import {
  obsidianRow,
  obsidianExample,
  obsidianDraftNote,
  loadObsidian,
} from '../lib/obsidian.ts';
import { draftFromResult } from '../lib/integration-files.ts';
import {
  readTrackerCsv,
  suggestTrackerMapping,
  trackerRows,
} from '../lib/tracker-csv.ts';
const base = process.env.RELAY_TEST_URL || 'http://localhost:3000';

// Only run against a local development server, which uses mock authentication.
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw Error('API test is local-only.');
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
const beforeStale = (await call()).data;
const beforeJob = beforeStale.jobs.find((j) => j.id === job.id);
const beforeEvents = beforeStale.events.filter((e) => e.job_id === job.id);
result = await call({
  action: 'save',
  id: job.id,
  version: job.version,
  status: 'Held',
  draft: 'stale',
  blocker: '',
});
assert.equal(result.status, 409, JSON.stringify(result.data));
const afterStale = (await call()).data;
const afterJob = afterStale.jobs.find((j) => j.id === job.id);
assert.equal(afterJob.draft, beforeJob.draft);
assert.equal(afterJob.accepted_draft, beforeJob.accepted_draft);
assert.equal(afterJob.status, beforeJob.status);
assert.equal(afterJob.version, beforeJob.version);
assert.deepEqual(
  afterStale.events.filter((e) => e.job_id === job.id),
  beforeEvents,
);
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
const obsidian = obsidianRow(
  obsidianExample.replace(
    'https://example.com/jobs/platform-engineer',
    'https://example.com/jobs/software',
  ),
);
const beforeNote = (await call()).data;
const activeBefore = beforeNote.jobs.find((j) => j.job_key === obsidian.Job);
result = await call({ action: 'preview', rows: [obsidian] });
assert.equal(result.status, 200);
assert.deepEqual((await call()).data, beforeNote);
for (let repeat = 0; repeat < 2; repeat++) {
  result = await call({ action: 'import', rows: [obsidian] });
  assert.equal(result.status, 200, JSON.stringify(result.data));
}
const afterNote = (await call()).data;
const activeAfter = afterNote.jobs.find((j) => j.id === activeBefore.id);
assert.equal(activeAfter.status, activeBefore.status);
assert.equal(activeAfter.draft, activeBefore.draft);
assert.equal(activeAfter.accepted_draft, activeBefore.accepted_draft);
const importedNotes = afterNote.sources.filter(
  (s) =>
    s.job_key === obsidian.Job &&
    s.source_url === obsidian.url &&
    s.notes === obsidian.Notes,
);
assert.equal(importedNotes.length, 1);
const draftNote = obsidianDraftNote(
  { ...activeAfter, key: activeAfter.job_key },
  'Obsidian follow-up for review.',
);
const draftResult = loadObsidian(draftNote);
const target = {
  jobId: activeAfter.id,
  job_key: activeAfter.job_key,
  version: activeAfter.version,
  session: 'local-test',
  draft: activeAfter.draft,
};
const staged = draftFromResult(draftResult, target);
assert.deepEqual(
  (await call()).data,
  afterNote,
  'Loading an Obsidian draft alone writes nothing',
);
result = await call({
  action: 'save',
  id: activeAfter.id,
  version: activeAfter.version,
  status: activeAfter.status,
  draft: staged,
  blocker: activeAfter.blocker,
});
assert.equal(result.status, 200, JSON.stringify(result.data));
const savedObsidian = (await call()).data.jobs.find(
  (j) => j.id === activeAfter.id,
);
assert.equal(savedObsidian.draft, staged);
assert.equal(savedObsidian.status, activeAfter.status);
assert.equal(savedObsidian.accepted_draft, null);
assert.throws(
  () =>
    draftFromResult(draftResult, { ...target, version: savedObsidian.version }),
  /matching job/,
);
// The tracker handoff uses the real route and database, including Ready and active jobs.
const tracker = readTrackerCsv(
  'Company,Role,URL,Status,Notes\nExample,Backend,https://example.com/jobs/backend,Rejected,CSV research\nExample,Software,https://example.com/jobs/software,Offer,CSV interview research',
);
const trackerMapping = suggestTrackerMapping(tracker.headers);
const trackerResearch = trackerRows(
  tracker,
  trackerMapping,
  'Fictional tracker API check',
);
const reviewed = (await call()).data.jobs.find((j) => j.id === job.id);
result = await call({
  action: 'save',
  id: reviewed.id,
  version: reviewed.version,
  status: 'Ready',
  draft: 'Exact CSV review draft',
  blocker: '',
});
assert.equal(result.status, 200);
const beforeTracker = (await call()).data;
result = await call({ action: 'preview', rows: trackerResearch });
assert.equal(result.status, 200);
assert.equal(result.data.new, 0);
assert.deepEqual((await call()).data, beforeTracker);
for (let repeat = 0; repeat < 2; repeat++) {
  result = await call({ action: 'import', rows: trackerResearch });
  assert.equal(result.status, 200, JSON.stringify(result.data));
}
const afterTracker = (await call()).data;
for (const research of trackerResearch) {
  const before = beforeTracker.jobs.find((j) => j.url === research.Job);
  const after = afterTracker.jobs.find((j) => j.id === before.id);
  assert.equal(after.status, before.status);
  assert.equal(after.draft, before.draft);
  assert.equal(after.accepted_draft, before.accepted_draft);
  assert.equal(
    afterTracker.sources.filter(
      (s) => s.source_url === research.url && s.notes === research.Notes,
    ).length,
    1,
  );
}
console.log(
  'PASS: tracker CSV preview has no writes; repeated imports preserve acceptance, active status and source history.',
);
result = await call(undefined, {
  'oai-authenticated-user-id': 'spoof',
  'oai-authenticated-user-email': 'other@example.com',
});
assert.equal(result.status, 401);
console.log(
  'PASS: imports, Obsidian preview and repeated import, duplicate history, exact acceptance, stale edits, editable interview drafts, preserved status and authentication.',
);
