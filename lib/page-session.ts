// A mounted page holds private records. When its session expires the page must
// clear them and never let older work put them back, so every read and every
// mutation is stamped with the session generation it started in and is checked
// against that generation again after each await.
//
// The four mounted pages used to spell that sequence out one page at a time.
// One expiry rule with four copies is four chances to drop a check, and the
// checks are the whole point, so the sequence lives here once and the pages
// supply only what differs: the request, and what to do with the reply.
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

// What a page lends the runner: its session, the way it clears itself, and its
// two status setters. Everything else about a page stays in the page.
export type PageHost = {
  session: PageSession;
  onExpired: () => void;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
};

// A read applies records to the page. It deliberately does not catch: the
// caller's mount effect reports the failure, and swallowing it here would hide
// a load error behind an empty page.
export async function runPageRead<T extends { error?: string }>(
  host: PageHost,
  send: () => Promise<ResponseLike>,
  fallbackError: string,
  apply: (body: T) => void,
) {
  const { session } = host;
  if (session.expired) return;
  const started = beginPageWork(session);
  const response = await send();
  const reply = await readAuthorizedJson<T>(
    session,
    started,
    response,
    fallbackError,
  );
  if (reply.kind === 'expired') {
    host.onExpired();
    return;
  }
  if (reply.kind === 'ignore') return;
  if (reply.kind === 'error') throw Error(reply.error);
  if (!pageWorkIsLive(session, started)) return;
  apply(reply.body);
}

// Review loads drafts and profile facts together. Both are watched for 401 as
// soon as they land, so an unauthorized sibling expires the session while the
// other request is still in flight rather than after it has been read.
export async function runPageSiblingReads<
  A extends { error?: string },
  B extends { error?: string },
>(
  host: PageHost,
  sends: [() => Promise<ResponseLike>, () => Promise<ResponseLike>],
  fallbackErrors: [string, string],
  apply: (first: A, second: B) => void,
) {
  const { session } = host;
  if (session.expired) return;
  const started = beginPageWork(session);
  const watch = (request: Promise<ResponseLike>) =>
    request.then((response) => {
      if (expireIfUnauthorized(session, response)) host.onExpired();
      return response;
    });
  const [first, second] = await Promise.all([
    watch(sends[0]()),
    watch(sends[1]()),
  ]);
  if (!pageWorkIsLive(session, started)) return;
  const firstReply = await readAuthorizedJson<A>(
    session,
    started,
    first,
    fallbackErrors[0],
  );
  if (firstReply.kind === 'expired') {
    host.onExpired();
    return;
  }
  if (firstReply.kind === 'ignore') return;
  if (firstReply.kind === 'error') throw Error(firstReply.error);
  const secondReply = await readAuthorizedJson<B>(
    session,
    started,
    second,
    fallbackErrors[1],
  );
  if (secondReply.kind === 'expired') {
    host.onExpired();
    return;
  }
  if (secondReply.kind === 'ignore') return;
  if (secondReply.kind === 'error') throw Error(secondReply.error);
  if (!pageWorkIsLive(session, started)) return;
  apply(firstReply.body, secondReply.body);
}

export type MutationSteps<T> = {
  // Cleared before the request so a stale error does not sit under a new
  // action. Pages that report only on completion leave this off.
  clearMessage?: boolean;
  // Awaited after a successful reply and before the page shows success, so a
  // 401 on the follow-up read expires the session instead of reporting an
  // action that left no visible record.
  refresh?: () => Promise<void>;
  succeed: (body: T) => void;
};

// A mutation owns the busy flag and reports its own failure, because the
// control that started it stays disabled until it settles.
export async function runPageMutation<T extends { error?: string }>(
  host: PageHost,
  send: () => Promise<ResponseLike>,
  fallbackError: string,
  steps: MutationSteps<T>,
): Promise<T | undefined> {
  const { session } = host;
  if (session.expired) return;
  const started = beginPageWork(session);
  host.setBusy(true);
  if (steps.clearMessage) host.setMessage('');
  try {
    const response = await send();
    const reply = await readAuthorizedJson<T>(
      session,
      started,
      response,
      fallbackError,
    );
    if (reply.kind === 'expired') {
      host.onExpired();
      return;
    }
    if (reply.kind === 'ignore') return;
    if (reply.kind === 'error') throw Error(reply.error);
    if (!pageWorkIsLive(session, started)) return;
    if (steps.refresh) await steps.refresh();
    if (!pageWorkIsLive(session, started)) return;
    steps.succeed(reply.body);
    return reply.body;
  } catch (e) {
    if (!pageWorkIsLive(session, started)) return;
    host.setMessage(e instanceof Error ? e.message : fallbackError);
  } finally {
    if (pageWorkIsLive(session, started)) host.setBusy(false);
  }
}

// The JSON body every mutation sends. Pages describe the action; the transport
// is the same everywhere.
export function postJson(url: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
