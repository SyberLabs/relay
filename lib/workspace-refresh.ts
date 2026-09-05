import {
  acknowledgeSave,
  reconcileEditor,
  type Editor,
  type JobFields,
  type SaveSnapshot,
} from './editor.ts';

export type RefreshSeq = { current: number };

export type PrivateWorkspace<
  J extends JobFields = JobFields,
  S = unknown,
  E = unknown,
  R = unknown,
> = {
  jobs: J[];
  sources: S[];
  events: E[];
  editor: Editor | null;
  importText: string;
  previewedImport: string;
  report: R | null;
  showImport: boolean;
  signedOut: boolean;
  loaded: boolean;
};

export type RefreshResponse<J, S, E> = {
  status: number;
  jobs?: J[];
  sources?: S[];
  events?: E[];
};

export type ExpiredPrivateWorkspace = {
  jobs: [];
  sources: [];
  events: [];
  editor: null;
  importText: '';
  previewedImport: '';
  report: null;
  showImport: false;
  signedOut: true;
  loaded: true;
};

export function editorAfterRefresh<J extends JobFields>(
  editor: Editor | null,
  jobs: J[],
  saved?: SaveSnapshot,
) {
  const next = editor && saved ? acknowledgeSave(editor, saved) : editor;
  return reconcileEditor(
    next,
    jobs.find((j) => j.id === next?.jobId),
  );
}

export function expiredPrivateWorkspace(): ExpiredPrivateWorkspace {
  return {
    jobs: [],
    sources: [],
    events: [],
    editor: null,
    importText: '',
    previewedImport: '',
    report: null,
    showImport: false,
    signedOut: true,
    loaded: true,
  };
}

export function receiveRefresh<J extends JobFields, S, E, R>(
  ticket: number,
  seq: RefreshSeq,
  workspace: PrivateWorkspace<J, S, E, R>,
  response: RefreshResponse<J, S, E>,
  saved?: SaveSnapshot,
): PrivateWorkspace<J, S, E, R> {
  if (ticket !== seq.current) return workspace;
  if (response.status === 401) {
    return { ...workspace, ...expiredPrivateWorkspace() };
  }
  if (response.status !== 200) return workspace;
  const jobs = response.jobs ?? [];
  return {
    ...workspace,
    jobs,
    sources: response.sources ?? [],
    events: response.events ?? [],
    editor: editorAfterRefresh(workspace.editor, jobs, saved),
    signedOut: false,
    loaded: true,
  };
}
