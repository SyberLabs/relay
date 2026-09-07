import {
  beginMutation,
  mutationIsLive,
  processAuthorizedGet,
  type ResponseLike,
  type WorkspaceSession,
} from './workspace-refresh.ts';

export type RuntimeModalProfile = {
  facts?: { id: string; claim: string; tag: string; status: string }[];
  rules?: { id: string; rule: string; scope: string }[];
  usable?: number;
  error?: string;
  viewer?: string;
};

export type RuntimeModalReadOutcome =
  | { type: 'skip' }
  | { type: 'expire' }
  | { type: 'ignore' }
  | { type: 'error'; error: string; status: number }
  | { type: 'ok'; body: RuntimeModalProfile; switched: boolean };

export function emptyRuntimeModalPrivate() {
  return {
    profile: null as RuntimeModalProfile | null,
    resume: '',
    candidates: [] as { claim: string; evidence: string; tag: string }[],
    rule: '',
    note: '',
  };
}

export function settleRuntimeModalProfileRead(
  outcome: RuntimeModalReadOutcome,
  cancelled: boolean,
  onUnauthorized: () => void,
):
  | { type: 'stop' }
  | { type: 'error'; error: string; status: number }
  | { type: 'ok'; body: RuntimeModalProfile; switched: boolean } {
  if (outcome.type === 'expire') {
    onUnauthorized();
    return { type: 'stop' };
  }
  if (cancelled || outcome.type === 'skip' || outcome.type === 'ignore')
    return { type: 'stop' };
  return outcome;
}

function catchAuthorizedRead(
  session: WorkspaceSession,
  started: { epoch: number },
  error: string,
) {
  if (!mutationIsLive(session.gate, started))
    return { type: 'ignore' as const };
  return { type: 'error' as const, error, status: 0 };
}

export async function readRuntimeModalProfile(
  session: WorkspaceSession,
  fetchImpl: (
    input: string,
    init?: RequestInit,
  ) => Promise<ResponseLike> = fetch,
) {
  if (!session.viewer) return { type: 'skip' as const };
  const started = beginMutation(session.gate);
  try {
    const response = await fetchImpl('/api/profile');
    return await processAuthorizedGet<RuntimeModalProfile>(
      session,
      started,
      response,
    );
  } catch {
    return catchAuthorizedRead(session, started, 'Unable to load profile.');
  }
}

export async function postRuntimeModalProfile<T extends { error?: string }>(
  session: WorkspaceSession,
  body: Record<string, unknown>,
  fetchImpl: (
    input: string,
    init?: RequestInit,
  ) => Promise<ResponseLike> = fetch,
) {
  if (!session.viewer) return { type: 'skip' as const };
  const started = beginMutation(session.gate);
  try {
    const response = await fetchImpl('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await processAuthorizedGet<T>(session, started, response);
  } catch {
    return catchAuthorizedRead(session, started, 'Unable to save.');
  }
}
