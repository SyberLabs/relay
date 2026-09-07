import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginOwnerImportWrite,
  beginTrackerSubmit,
  completeOwnerImportWrite,
  completeTrackerSubmit,
  createTrackerSubmitGate,
  ownerImportWritePending,
  resetOwnerTrackerSubmit,
  trackerSubmitIsCurrent,
} from '../lib/tracker-submit.ts';

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

void test('import refuses a second preview and a second import while pending', () => {
  const gate = createTrackerSubmitGate();
  assert.equal(beginTrackerSubmit(gate, 'import'), 1);
  assert.equal(beginTrackerSubmit(gate, 'preview'), null);
  assert.equal(beginTrackerSubmit(gate, 'import'), null);
  assert.equal(completeTrackerSubmit(gate, 1), true);
  assert.equal(beginTrackerSubmit(gate, 'preview'), 2);
});

void test('delayed preview cannot apply after import supersedes it', async () => {
  const gate = createTrackerSubmitGate();
  const view = { message: '', preview: false, saved: false };
  const previewFetch = deferred();
  const importFetch = deferred();
  async function submit(action, pending) {
    const started = beginTrackerSubmit(gate, action);
    if (started == null) return 'refused';
    const result = await pending.promise;
    if (!trackerSubmitIsCurrent(gate, started)) return 'stale';
    if (action === 'preview') {
      view.preview = true;
      view.message = 'Check every record below. Nothing has been saved.';
    } else {
      view.preview = false;
      view.saved = true;
      view.message =
        'Imported 1 research records. Existing application status and draft approval were preserved.';
    }
    completeTrackerSubmit(gate, started);
    return result;
  }
  const previewDone = submit('preview', previewFetch);
  const importDone = submit('import', importFetch);
  importFetch.resolve('imported');
  assert.equal(await importDone, 'imported');
  assert.equal(view.saved, true);
  assert.equal(view.preview, false);
  assert.match(view.message, /Imported 1/);
  previewFetch.resolve('preview');
  assert.equal(await previewDone, 'stale');
  assert.equal(view.saved, true);
  assert.equal(view.preview, false);
  assert.match(view.message, /Imported 1/);
  assert.equal(view.message.includes('Nothing has been saved'), false);
});

void test('handler refuses preview while an import write is pending', () => {
  resetOwnerTrackerSubmit();
  const token = beginOwnerImportWrite('owner-a');
  assert.equal(ownerImportWritePending('owner-a'), true);
  assert.equal(ownerImportWritePending('owner-b'), false);
  completeOwnerImportWrite('owner-a', token - 1);
  assert.equal(ownerImportWritePending('owner-a'), true);
  completeOwnerImportWrite('owner-a', token);
  assert.equal(ownerImportWritePending('owner-a'), false);
  resetOwnerTrackerSubmit();
});
