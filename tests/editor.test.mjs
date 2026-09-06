import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLoadedDraft,
  acknowledgeSave,
  canSave,
  editorIsDirty,
  fileLoadApplies,
  jobQueueHint,
  keepEditorOnReselect,
  loadEditor,
  reconcileEditor,
  showsExactAcceptance,
} from '../lib/editor.ts';
const job = (id, extra = {}) => ({
  id,
  version: 1,
  draft: 'original',
  blocker: '',
  ...extra,
});
function target(editor) {
  return {
    jobId: editor.jobId,
    session: editor.session,
    version: editor.version,
    draft: editor.draft,
  };
}
void test('refresh during editing keeps unsaved text on the loaded version', () => {
  let editor = loadEditor(job('A'));
  editor = { ...editor, draft: 'local edits' };
  editor = reconcileEditor(editor, job('A'));
  assert.equal(editor.draft, 'local edits');
  assert.equal(editor.conflict, false);
  assert.equal(editor.version, 1);
});
void test('external update while editing requires reload before save', () => {
  let editor = loadEditor(job('A'));
  editor = { ...editor, draft: 'stale buffer' };
  const server = job('A', { version: 2, draft: 'agent draft' });
  editor = reconcileEditor(editor, server);
  assert.equal(editor.draft, 'stale buffer');
  assert.equal(editor.conflict, true);
  assert.equal(canSave(editor), false);
  assert.equal(editor.version, 1);
  editor = loadEditor(server);
  assert.equal(editor.draft, 'agent draft');
  assert.equal(editor.conflict, false);
  assert.equal(editor.version, 2);
});
void test('clean editor adopts a newer refresh', () => {
  let editor = loadEditor(job('A'));
  editor = reconcileEditor(
    editor,
    job('A', { version: 2, draft: 'from server' }),
  );
  assert.equal(editor.draft, 'from server');
  assert.equal(editor.version, 2);
  assert.equal(editor.conflict, false);
});
void test('stale save ack after A to B to A does not bless the reloaded editor', () => {
  const old = job('A');
  const original = loadEditor(old);
  const submitted = { ...original, draft: 'intentionally saved' };
  loadEditor(job('B'));
  const reselected = loadEditor(old);
  const ignored = acknowledgeSave(reselected, submitted);
  assert.equal(ignored.session, reselected.session);
  assert.notEqual(ignored.session, submitted.session);
  assert.equal(ignored.version, 1);
  assert.equal(ignored.draft, 'original');
  assert.equal(ignored.baseDraft, 'original');
  const result = reconcileEditor(
    ignored,
    job('A', { version: 2, draft: submitted.draft }),
  );
  assert.equal(result.draft, 'intentionally saved');
  assert.equal(result.version, 2);
  assert.equal(result.conflict, false);
  assert.notEqual(result.session, submitted.session);
});
void test('save acknowledgement ignores a job switched during the request', () => {
  const submitted = loadEditor(job('A'));
  let editor = loadEditor(job('B', { version: 2, draft: 'draft-B' }));
  editor = acknowledgeSave(editor, submitted);
  assert.equal(editor.jobId, 'B');
  assert.equal(editor.version, 2);
  assert.equal(editor.draft, 'draft-B');
});
void test('edits made while a save is in flight stay unsaved on that editor session', () => {
  let editor = loadEditor(job('A'));
  const submitted = { ...editor, draft: 'saved snapshot' };
  editor = { ...editor, draft: 'typed during save' };
  editor = acknowledgeSave(editor, submitted);
  assert.equal(editor.draft, 'typed during save');
  assert.equal(editor.version, 2);
  assert.equal(editor.baseDraft, 'saved snapshot');
  assert.notEqual(editor.draft, editor.baseDraft);
  assert.equal(editor.session, submitted.session);
});
void test('delayed save ack cannot bless an editor already on a newer base', () => {
  const original = loadEditor(job('A'));
  const submitted = { ...original, draft: 'intentionally saved' };
  let editor = reconcileEditor(
    original,
    job('A', { version: 2, draft: 'from server' }),
  );
  editor = acknowledgeSave(editor, submitted);
  assert.equal(editor.version, 2);
  assert.equal(editor.draft, 'from server');
  assert.equal(editor.baseDraft, 'from server');
  assert.notEqual(editor.session, submitted.session);
});
void test('rejected stale save refreshes into a conflict that reload can resolve', () => {
  let editor = loadEditor(job('A'));
  editor = { ...editor, draft: 'unsaved after 409' };
  const server = job('A', { version: 2, draft: 'newer record' });
  editor = reconcileEditor(editor, server);
  assert.equal(editor.draft, 'unsaved after 409');
  assert.equal(editor.conflict, true);
  assert.equal(canSave(editor), false);
  assert.equal(editor.version, 1);
  editor = loadEditor(server);
  assert.equal(editor.draft, 'newer record');
  assert.equal(editor.version, 2);
  assert.equal(editor.conflict, false);
  assert.equal(canSave(editor), true);
});
void test('file load rejects a changed session, version, or typed draft', () => {
  const started = loadEditor(job('A'));
  assert.equal(fileLoadApplies(target(started), target(started)), true);
  assert.equal(
    fileLoadApplies(target(started), target(loadEditor(job('B')))),
    false,
  );
  const awayAndBack = loadEditor(job('A'));
  assert.equal(fileLoadApplies(target(started), target(awayAndBack)), false);
  const v2 = loadEditor(job('A', { version: 2, draft: 'from server' }));
  assert.equal(fileLoadApplies(target(started), target(v2)), false);
  const typed = { ...started, draft: 'typed while reading' };
  assert.equal(fileLoadApplies(target(started), target(typed)), false);
});
void test('queued editor updater still applies a matching file load without a boolean', () => {
  const editor = loadEditor(job('A'));
  const started = target(editor);
  const queue = [];
  const setEditor = (fn) => {
    queue.push(fn);
  };
  setEditor((e) => applyLoadedDraft(e, 'from file', started));
  assert.equal(queue.length, 1);
  assert.equal(queue[0](editor).draft, 'from file');
});
void test('stale file-load snapshot cannot overwrite a later editor', () => {
  const started = loadEditor(job('A'));
  const laterB = loadEditor(job('B', { draft: 'keep B' }));
  const skippedB = applyLoadedDraft(
    laterB,
    'old packet for A',
    target(started),
  );
  assert.equal(skippedB, laterB);
  assert.equal(skippedB.draft, 'keep B');
  const laterA = loadEditor(job('A', { version: 2, draft: 'newer A' }));
  const skippedA = applyLoadedDraft(
    laterA,
    'old packet for A',
    target(started),
  );
  assert.equal(skippedA.draft, 'newer A');
  assert.notEqual(skippedA.session, started.session);
  const same = loadEditor(job('A'));
  const applied = applyLoadedDraft(same, 'from file', target(same));
  assert.equal(applied.draft, 'from file');
  assert.equal(applied.session, same.session);
  assert.notEqual(applied, same);
});
void test('dirty compares draft and blocker against the loaded base', () => {
  const editor = loadEditor(job('A', { blocker: 'need fact' }));
  assert.equal(editorIsDirty(null), false);
  assert.equal(editorIsDirty(editor), false);
  assert.equal(editorIsDirty({ ...editor, draft: 'typed' }), true);
  assert.equal(editorIsDirty({ ...editor, blocker: 'other fact' }), true);
  assert.equal(
    editorIsDirty({ ...editor, draft: 'original', blocker: 'need fact' }),
    false,
  );
});
void test('same-job reselect keeps the editor; another job does not', () => {
  const editor = loadEditor(job('A'));
  const typed = { ...editor, draft: 'unsaved' };
  assert.equal(keepEditorOnReselect(typed, 'A'), true);
  assert.equal(keepEditorOnReselect(typed, 'B'), false);
  assert.equal(keepEditorOnReselect(null, 'A'), false);
  assert.equal(typed.session, editor.session);
});
void test('exact local acceptance is Ready with an unchanged draft and blocker', () => {
  const ready = {
    id: 'A',
    version: 1,
    status: 'Ready',
    accepted_draft: 'Exact accepted',
  };
  const accepted = loadEditor(
    job('A', { draft: 'Exact accepted', blocker: '' }),
  );
  assert.equal(showsExactAcceptance(ready, accepted), true);
  assert.equal(
    showsExactAcceptance(ready, { ...accepted, draft: 'Exact accepted ' }),
    false,
  );
  assert.equal(
    showsExactAcceptance(ready, { ...accepted, blocker: 'need fact' }),
    false,
  );
  assert.equal(
    showsExactAcceptance({ ...ready, status: 'Held' }, accepted),
    false,
  );
  assert.equal(
    showsExactAcceptance({ ...ready, status: 'Skip' }, accepted),
    false,
  );
  assert.equal(
    showsExactAcceptance({ ...ready, status: 'Submitted' }, accepted),
    false,
  );
  assert.equal(
    showsExactAcceptance({ ...ready, status: 'Live loop' }, accepted),
    false,
  );
  assert.equal(showsExactAcceptance(ready, null), false);
  assert.equal(showsExactAcceptance({ ...ready, version: 2 }, accepted), false);
  assert.equal(
    showsExactAcceptance({ ...ready, accepted_draft: 'other text' }, accepted),
    false,
  );
  assert.equal(showsExactAcceptance({ ...ready, id: 'B' }, accepted), false);
  assert.equal(
    showsExactAcceptance(ready, { ...accepted, conflict: true }),
    false,
  );
});
void test('queue hint drops accepted copy when the selected Ready editor is dirty', () => {
  const ready = {
    ...job('A', { draft: 'Exact accepted', blocker: '' }),
    status: 'Ready',
    accepted_draft: 'Exact accepted',
  };
  const editor = loadEditor({ ...ready, id: 'A' });
  assert.equal(
    jobQueueHint({ ...ready, status: 'Ready' }, editor),
    'Exact draft accepted',
  );
  assert.equal(
    jobQueueHint({ ...ready, status: 'Ready' }, { ...editor, draft: 'edited' }),
    'Review fit & prepare draft',
  );
  assert.equal(
    jobQueueHint(
      { ...ready, status: 'Ready' },
      { ...editor, blocker: 'need fact' },
    ),
    'Needs attention',
  );
  assert.equal(
    jobQueueHint({ ...ready, id: 'B', status: 'Ready', blocker: '' }, editor),
    'Exact draft accepted',
  );
  assert.equal(
    jobQueueHint(
      { ...ready, id: 'C', status: 'Held', blocker: 'open' },
      editor,
    ),
    'Needs attention',
  );
  assert.equal(
    jobQueueHint({ ...ready, status: 'Submitted' }, editor),
    'Submitted',
  );
});
void test('reverting after a Ready conflict does not label stale text accepted', () => {
  let editor = loadEditor(job('A', { draft: 'Exact v1', blocker: '' }));
  editor = { ...editor, draft: 'local edit' };
  editor = reconcileEditor(
    editor,
    job('A', { version: 2, draft: 'Exact v2', blocker: '' }),
  );
  assert.equal(editor.conflict, true);
  assert.equal(editor.version, 1);
  editor = { ...editor, draft: editor.baseDraft, blocker: editor.baseBlocker };
  assert.equal(editorIsDirty(editor), false);
  const current = {
    id: 'A',
    version: 2,
    status: 'Ready',
    blocker: '',
    accepted_draft: 'Exact v2',
  };
  assert.equal(showsExactAcceptance(current, editor), false);
});
