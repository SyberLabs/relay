export type PageSession = {
  epoch: number;
  expired: boolean;
};

export type ResponseLike = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
};

export type AuthorizedReply<T> =
  | { kind: 'expired' }
  | { kind: 'ignore' }
  | { kind: 'error'; error: string }
  | { kind: 'ok'; body: T };

export function createPageSession(): PageSession {
  return { epoch: 0, expired: false };
}

export function expirePageSession(session: PageSession) {
  session.epoch += 1;
  session.expired = true;
}

export function beginPageWork(session: PageSession) {
  return session.epoch;
}

export function pageWorkIsLive(session: PageSession, started: number) {
  return started === session.epoch;
}

export function expireIfUnauthorized(
  session: PageSession,
  response: { status: number },
) {
  if (response.status !== 401) return false;
  expirePageSession(session);
  return true;
}

export async function readAuthorizedJson<T extends { error?: string }>(
  session: PageSession,
  started: number,
  response: ResponseLike,
  fallbackError: string,
): Promise<AuthorizedReply<T>> {
  if (expireIfUnauthorized(session, response)) return { kind: 'expired' };
  if (!pageWorkIsLive(session, started)) return { kind: 'ignore' };
  const body = (await response.json()) as T;
  if (!pageWorkIsLive(session, started)) return { kind: 'ignore' };
  if (!response.ok)
    return {
      kind: 'error',
      error: typeof body?.error === 'string' ? body.error : fallbackError,
    };
  return { kind: 'ok', body };
}
