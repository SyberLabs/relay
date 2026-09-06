// Drain untrusted-origin POST bodies before refusing them. Wrangler's local
// proxy can synthesize a 503 on the next mutation when this stream is left
// unread (cloudflare/workers-sdk#15203). Stop at the same 2MB bound the
// mutation handlers use so a hostile body is not fully buffered.
const BODY_BYTE_LIMIT = 2_000_000;

async function drainBoundedBody(request: Request) {
  if (!request.body || request.bodyUsed) return;
  const reader = request.body.getReader();
  let bytes = 0;
  try {
    while (bytes < BODY_BYTE_LIMIT) {
      const { done, value } = await reader.read();
      if (done) return;
      bytes += value.byteLength;
    }
    await reader.cancel();
  } catch {
    try {
      await reader.cancel();
    } catch {
      /* A dropped stream still must not skip the origin refusal. */
    }
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
