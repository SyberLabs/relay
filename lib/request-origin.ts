// Best-effort drain of untrusted-origin POST bodies before refusing them.
// Wrangler's local proxy can synthesize a 503 on the next mutation when this
// stream is left unread (cloudflare/workers-sdk#15203). Bound bytes and time
// so a stalled or uncooperative stream cannot delay an already-decided 403.
const BODY_BYTE_LIMIT = 2_000_000;
const DRAIN_TIMEOUT_MS = 250;

function after(ms: number) {
  let id: ReturnType<typeof setTimeout>;
  const promise = new Promise<'timeout'>((resolve) => {
    id = setTimeout(() => resolve('timeout'), ms);
  });
  return {
    promise,
    stop() {
      clearTimeout(id);
    },
  };
}

async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | 'timeout'> {
  const timer = after(ms);
  try {
    return await Promise.race([work, timer.promise]);
  } finally {
    timer.stop();
  }
}

export async function drainBoundedBody(request: Request) {
  if (!request.body || request.bodyUsed) return;
  const reader = request.body.getReader();
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let bytes = 0;
  try {
    while (bytes < BODY_BYTE_LIMIT) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const outcome = await withDeadline(reader.read(), remaining);
      if (outcome === 'timeout') break;
      const { done, value } = outcome;
      if (done) return;
      bytes += value.byteLength;
    }
  } catch {
    /* A dropped stream still must not skip the origin refusal. */
  } finally {
    const remaining = Math.max(0, deadline - Date.now());
    await withDeadline(
      Promise.resolve(reader.cancel()).catch(() => undefined),
      remaining,
    );
  }
}

export async function refuseUntrustedOrigin(
  request: Request,
): Promise<Response | null> {
  const origin = request.headers.get('origin');
  if (!origin || origin === new URL(request.url).origin) return null;
  await drainBoundedBody(request);
  return Response.json(
    { error: 'Invalid request origin.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}
