import {
  beginMutation,
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
    return processAuthorizedGet<RuntimeModalProfile>(
      session,
      started,
      response,
    );
  } catch {
    return {
      type: 'error' as const,
      error: 'Unable to load profile.',
      status: 0,
    };
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
    return processAuthorizedGet<T>(session, started, response);
  } catch {
    return { type: 'error' as const, error: 'Unable to save.', status: 0 };
  }
}
