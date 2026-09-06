import {
  acknowledgeSave,
  reconcileEditor,
  type Editor,
  type JobFields,
  type SaveSnapshot,
} from './editor.ts';

export type SessionGate = {
  epoch: number;
  refresh: number;
};

export type WorkspaceSession = {
  gate: SessionGate;
  lastAck?: SaveSnapshot;
};

export type WorkspaceReply = {
  jobs?: JobFields[];
  sources?: unknown[];
  events?: unknown[];
  error?: string;
  items?: unknown;
};

export type ResponseLike = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
};

export type RefreshStart = { epoch: number; refresh: number };
export type MutationStart = { epoch: number };

export type RefreshOutcome =
  | { type: 'expire' }
  | { type: 'ignore' }
  | { type: 'error'; error: string }
  | {
      type: 'records';
      jobs: JobFields[];
      sources: unknown[];
      events: unknown[];
    };

export type MutationOutcome =
  | { type: 'expire' }
  | { type: 'ignore' }
  | { type: 'error'; error: string; status: number }
  | { type: 'ok'; body: WorkspaceReply };

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

export function createWorkspaceSession(): WorkspaceSession {
  return { gate: { epoch: 0, refresh: 0 } };
}

export function beginRefresh(gate: SessionGate): RefreshStart {
  gate.refresh += 1;
  return { epoch: gate.epoch, refresh: gate.refresh };
}

export function beginMutation(gate: SessionGate): MutationStart {
  return { epoch: gate.epoch };
}

export function refreshIsLive(gate: SessionGate, started: RefreshStart) {
  return started.epoch === gate.epoch && started.refresh === gate.refresh;
}

export function mutationIsLive(gate: SessionGate, started: MutationStart) {
  return started.epoch === gate.epoch;
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

export function expireSession(
  session: WorkspaceSession,
): ExpiredPrivateWorkspace {
  session.gate.epoch += 1;
  session.gate.refresh = 0;
  session.lastAck = undefined;
  return expiredPrivateWorkspace();
}

export async function readWorkspaceResponse(
  r: ResponseLike,
): Promise<
  | { kind: 'expired' }
  | { kind: 'ok'; body: WorkspaceReply }
  | { kind: 'error'; error: string; status: number }
> {
  if (r.status === 401) return { kind: 'expired' };
  const body = (await r.json()) as WorkspaceReply;
  if (!r.ok)
    return {
      kind: 'error',
      error: typeof body?.error === 'string' ? body.error : 'Unable to save.',
      status: r.status,
    };
  return { kind: 'ok', body };
}

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

export function applyAcceptedSave(
  editor: Editor | null,
  saved: SaveSnapshot | undefined,
) {
  return editor && saved ? acknowledgeSave(editor, saved) : editor;
}

export function editorForJobs<J extends JobFields>(
  session: WorkspaceSession,
  editor: Editor | null,
  jobs: J[],
) {
  return editorAfterRefresh(editor, jobs, session.lastAck);
}

export async function processRefresh(
  session: WorkspaceSession,
  started: RefreshStart,
  response: ResponseLike,
): Promise<RefreshOutcome> {
  const reply = await readWorkspaceResponse(response);
  if (reply.kind === 'expired') {
    expireSession(session);
    return { type: 'expire' };
  }
  if (!refreshIsLive(session.gate, started)) return { type: 'ignore' };
  if (reply.kind === 'error') return { type: 'error', error: reply.error };
  return {
    type: 'records',
    jobs: reply.body.jobs ?? [],
    sources: reply.body.sources ?? [],
    events: reply.body.events ?? [],
  };
}

export async function processMutation(
  session: WorkspaceSession,
  started: MutationStart,
  response: ResponseLike,
  saved?: SaveSnapshot,
): Promise<MutationOutcome> {
  const reply = await readWorkspaceResponse(response);
  if (reply.kind === 'expired') {
    expireSession(session);
    return { type: 'expire' };
  }
  if (!mutationIsLive(session.gate, started)) return { type: 'ignore' };
  if (reply.kind === 'error')
    return { type: 'error', error: reply.error, status: reply.status };
  if (saved) session.lastAck = saved;
  return { type: 'ok', body: reply.body };
}
