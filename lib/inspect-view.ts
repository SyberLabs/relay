export type InspectSnapshot = {
  job_id: string;
  destination: string | null;
  fields: {
    label: string;
    filled: boolean;
    unknown: boolean;
    value?: string;
  }[];
  files: { name: string; sha256: string }[];
  ready: boolean;
  armed: boolean;
  operation_id: string | null;
  digest: string | null;
  state: string | null;
  accept_enabled: boolean;
  revision?: number;
  viewer?: string;
};

export type InspectPollGate = {
  jobId: string | undefined;
  generation: number;
};

export type InspectPollStart = {
  jobId: string;
  generation: number;
};

export type InspectApplyResult =
  | { type: 'ignore' }
  | { type: 'clear' }
  | { type: 'view'; view: InspectSnapshot; viewer: string };

const WAITING_STATES = new Set(['authorized', 'executing']);
const READY_NOT_ARMED_HIDDEN = new Set([
  'authorized',
  'executing',
  'submitted',
]);

export function createInspectPollGate(): InspectPollGate {
  return { jobId: undefined, generation: 0 };
}

export function selectInspectJob(
  gate: InspectPollGate,
  jobId: string | undefined,
) {
  gate.jobId = jobId;
  gate.generation += 1;
  return gate.generation;
}

export function beginInspectPoll(gate: InspectPollGate) {
  gate.generation += 1;
  return gate.generation;
}

function isInspectSnapshot(data: unknown): data is InspectSnapshot {
  if (!data || typeof data !== 'object') return false;
  const view = data as InspectSnapshot;
  return (
    typeof view.job_id === 'string' &&
    view.job_id.length > 0 &&
    Array.isArray(view.fields) &&
    Array.isArray(view.files) &&
    typeof view.ready === 'boolean' &&
    typeof view.armed === 'boolean' &&
    typeof view.accept_enabled === 'boolean'
  );
}

export function applyInspectPoll(
  gate: InspectPollGate,
  started: InspectPollStart,
  result: { ok: boolean; data?: unknown },
): InspectApplyResult {
  if (started.generation !== gate.generation || started.jobId !== gate.jobId)
    return { type: 'ignore' };
  if (!result.ok) return { type: 'clear' };
  if (!isInspectSnapshot(result.data)) return { type: 'clear' };
  if (result.data.job_id !== gate.jobId) return { type: 'ignore' };
  return {
    type: 'view',
    view: result.data,
    viewer: typeof result.data.viewer === 'string' ? result.data.viewer : '',
  };
}

export function inspectShowsReadyNotArmed(view: InspectSnapshot | null) {
  return Boolean(
    view?.ready && !view.armed && !READY_NOT_ARMED_HIDDEN.has(view.state ?? ''),
  );
}

export function inspectShowsAuthorizedWaiting(view: InspectSnapshot | null) {
  return WAITING_STATES.has(view?.state ?? '');
}

export function inspectOperativeStatus(
  view: InspectSnapshot | null,
): 'armed' | 'waiting' | null {
  if (inspectShowsAuthorizedWaiting(view)) return 'waiting';
  if (view?.armed) return 'armed';
  return null;
}
