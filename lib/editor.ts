export type JobFields = {
  id: string;
  version: number;
  draft: string;
  blocker: string;
};
export type Editor = {
  jobId: string;
  session: string;
  version: number;
  draft: string;
  blocker: string;
  progressNote: string;
  baseDraft: string;
  baseBlocker: string;
  conflict: boolean;
};
export type EditorTarget = {
  jobId: string;
  session: string;
  version: number;
  draft: string;
};
export type SaveSnapshot = {
  jobId: string;
  session: string;
  version: number;
  draft: string;
  blocker: string;
  progressNote?: string;
};
export function loadEditor(job: JobFields): Editor {
  return {
    jobId: job.id,
    session: crypto.randomUUID(),
    version: job.version,
    draft: job.draft,
    blocker: job.blocker,
    progressNote: '',
    baseDraft: job.draft,
    baseBlocker: job.blocker,
    conflict: false,
  };
}
export function canSave(editor: Editor) {
  return !editor.conflict;
}
export function editorIsDirty(editor: Editor | null) {
  return (
    !!editor &&
    (editor.draft !== editor.baseDraft ||
      editor.blocker !== editor.baseBlocker ||
      !!editor.progressNote)
  );
}
export function keepEditorOnReselect(editor: Editor | null, jobId: string) {
  return !!editor && editor.jobId === jobId;
}
export function showsExactAcceptance(
  job:
    | {
        id: string;
        version: number;
        status: string;
        accepted_draft: string | null;
      }
    | null
    | undefined,
  editor: Editor | null,
) {
  return (
    !!job &&
    !!editor &&
    !editor.conflict &&
    job.status === 'Ready' &&
    job.id === editor.jobId &&
    job.version === editor.version &&
    editor.draft === job.accepted_draft &&
    editor.draft === editor.baseDraft &&
    editor.blocker === editor.baseBlocker
  );
}
export function jobQueueHint(
  job: {
    id: string;
    version: number;
    status: string;
    blocker: string;
    drafting_direction?: string;
    accepted_draft: string | null;
  },
  editor: Editor | null,
) {
  const local = editor?.jobId === job.id ? editor : null;
  if (local ? local.blocker : job.blocker)
    return job.drafting_direction &&
      (!local || local.blocker === local.baseBlocker)
      ? 'Ready for assistant'
      : 'Needs attention';
  if (local ? showsExactAcceptance(job, local) : job.status === 'Ready')
    return 'Exact draft accepted';
  if (job.status === 'Held' || job.status === 'Ready')
    return 'Review fit & prepare draft';
  return job.status;
}
export function fileLoadApplies(
  started: EditorTarget | undefined,
  current: EditorTarget | undefined,
) {
  return (
    !!started &&
    !!current &&
    started.jobId === current.jobId &&
    started.session === current.session &&
    started.version === current.version &&
    started.draft === current.draft
  );
}
export function reconcileEditor(
  editor: Editor | null,
  job: JobFields | undefined,
): Editor | null {
  if (!editor) return null;
  if (!job || job.id !== editor.jobId) return editor;
  if (job.version === editor.version) return { ...editor, conflict: false };
  if (!editorIsDirty(editor)) return loadEditor(job);
  return { ...editor, conflict: true };
}
export function acknowledgeSave(
  editor: Editor,
  submitted: SaveSnapshot,
): Editor {
  if (
    editor.jobId !== submitted.jobId ||
    editor.session !== submitted.session ||
    editor.version !== submitted.version
  )
    return editor;
  return {
    ...editor,
    version: submitted.version + 1,
    baseDraft: submitted.draft,
    baseBlocker: submitted.blocker,
    progressNote:
      submitted.progressNote !== undefined &&
      editor.progressNote === submitted.progressNote
        ? ''
        : editor.progressNote,
    conflict: false,
  };
}
export function applyLoadedDraft(
  editor: Editor | null,
  draft: string,
  started: EditorTarget | undefined,
): Editor | null {
  if (
    !editor ||
    !fileLoadApplies(started, {
      jobId: editor.jobId,
      session: editor.session,
      version: editor.version,
      draft: editor.draft,
    })
  )
    return editor;
  return { ...editor, draft };
}
