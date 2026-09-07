import { boundedBody, principalKey, refusal } from './security.mjs';

export async function verifyToken(token, env, fetcher = fetch) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_HOSTNAME)
    throw new Error('Verification unavailable');
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const response = await fetcher(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    },
  );
  if (!response.ok) throw new Error('Verification unavailable');
  const result = await response.json();
  return (
    result.success === true &&
    result.hostname === env.TURNSTILE_HOSTNAME &&
    result.action === 'relay_write'
  );
}

export async function captchaPage(request, env) {
  if (
    !/^[a-zA-Z0-9_-]{3,100}$/.test(env.TURNSTILE_SITE_KEY ?? '') ||
    !env.TURNSTILE_SECRET_KEY
  ) {
    return refusal(
      503,
      'verification_unavailable',
      'Human verification is unavailable. Contact Relay support.',
      60,
    );
  }
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== new URL(request.url).origin) {
      return refusal(403, 'invalid_origin', 'Invalid request origin.');
    }
    let token;
    try {
      token = new URLSearchParams(
        new TextDecoder().decode(await boundedBody(request, 8192)),
      ).get('cf-turnstile-response');
    } catch {
      return refusal(
        400,
        'invalid_verification',
        'Invalid verification response.',
      );
    }
    try {
      if (!(await verifyToken(token, env)))
        return refusal(
          403,
          'invalid_verification',
          'Verification expired or failed. Reload /security/check and try again.',
        );
      const user = await principalKey(request);
      await env.DB.prepare(`INSERT INTO security_clearances (owner, expires) VALUES (?, ?)
        ON CONFLICT(owner) DO UPDATE SET expires = excluded.expires`)
        .bind(user, Date.now() + 3_600_000)
        .run();
    } catch {
      return refusal(
        503,
        'verification_unavailable',
        'Verification is unavailable. Please try later.',
        60,
      );
    }
    return new Response(null, {
      status: 303,
      headers: { location: '/', 'cache-control': 'no-store' },
    });
  }
  if (request.method !== 'GET')
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify — Relay</title>
    <h1>Verify to continue</h1><p>Complete this check, then return to your original tab and retry your action. Verification lasts one hour. Your usage limits still apply.</p>
    <form method="post" action="/security/check"><div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITE_KEY}" data-action="relay_write"></div><button type="submit">Continue</button></form>
    <p><a href="/">Return to Relay</a></p><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
