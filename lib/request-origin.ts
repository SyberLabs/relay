// Drain untrusted-origin POST bodies before refusing them. Wrangler's local
// proxy can synthesize a 503 on the next mutation when this stream is left
// unread (cloudflare/workers-sdk#15203).
export async function refuseUntrustedOrigin(
  request: Request,
): Promise<Response | null> {
  const origin = request.headers.get('origin');
  if (!origin || origin === new URL(request.url).origin) return null;
  if (request.body && !request.bodyUsed) {
    try {
      await request.arrayBuffer();
    } catch {
      /* A dropped stream still must not skip the origin refusal. */
    }
  }
  return Response.json(
    { error: 'Invalid request origin.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}
