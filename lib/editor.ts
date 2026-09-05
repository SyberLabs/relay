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
};
export function loadEditor(job: JobFields): Editor {
  return {
    jobId: job.id,
    session: crypto.randomUUID(),
    version: job.version,
    draft: job.draft,
    blocker: job.blocker,
    baseDraft: job.draft,
    baseBlocker: job.blocker,
    conflict: false,
  };
}
export function canSave(editor: Editor) {
  return !editor.conflict;
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
  const dirty =
    editor.draft !== editor.baseDraft || editor.blocker !== editor.baseBlocker;
  if (!dirty) return loadEditor(job);
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
