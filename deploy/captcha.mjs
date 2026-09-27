import { boundedBody, principalKey, refusal } from './security.mjs';

// SyberLabs v2 (Atlas) tokens, inline because the CSP allows only inline styles.
// No font-src: Instrument Sans/JetBrains Mono apply only where installed; system fonts otherwise.
const CAPTCHA_STYLE = `
:root{--ink:#06051a;--ink-2:#0c0a2a;--vellum:#eef0ff;--mist:#b4bbe2;--dim:#8990bb;--rule:rgba(170,180,255,.16);--rule-2:rgba(170,180,255,.32);--ice:#90d8f0;--relay:#62e3d8;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(50% 60% at 50% 40%,#2a1a7a4d,#0000 70%),radial-gradient(34% 40% at 58% 36%,#0048f033,#0000 70%),var(--ink);color:var(--vellum);font:400 16px/1.6 "Instrument Sans",system-ui,sans-serif}
main{width:min(460px,100%);background:var(--ink-2);border:1px solid var(--rule-2);outline:1px solid var(--rule);outline-offset:-5px;border-radius:14px;padding:32px 28px}
.lockup{margin:0 0 24px;font:600 13px/1 "Instrument Sans",system-ui,sans-serif;letter-spacing:.22em;color:var(--vellum)}
.lockup i{font-style:normal;color:var(--dim);letter-spacing:0}
.lockup b{font-weight:500;letter-spacing:-.01em;font-size:16px;color:var(--relay)}
h1{margin:0 0 12px;font:400 40px/1.1 "Instrument Serif",Georgia,serif;letter-spacing:-.015em}
p{margin:0 0 20px;color:var(--mist)}
form{display:grid;gap:16px;justify-items:start;margin:0 0 20px}
button{min-height:46px;padding:0 22px;border:0;border-radius:999px;background:linear-gradient(100deg,#c9f0ff,#eef0ff 45%,#e3d4ff);color:#07061c;font:500 15px/1 "Instrument Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 0 0 1px #fff3 inset,0 10px 40px -12px #4890f0cc}
button:hover{box-shadow:0 0 0 1px #fff6 inset,0 14px 48px -10px #9a6bffdd}
a{color:var(--relay)}
a:hover{color:var(--vellum)}
:focus-visible{outline:2px solid var(--ice);outline-offset:3px}
`;

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
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>Verify — Relay</title>
    <style>${CAPTCHA_STYLE}</style>
    <main><p class="lockup" aria-hidden="true">SYBERLABS <i>/</i> <b>Relay</b></p>
    <h1>Verify to continue</h1><p>Complete this check, then return to your original tab and retry your action. Verification lasts one hour. Your usage limits still apply.</p>
    <form method="post" action="/security/check"><div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITE_KEY}" data-action="relay_write" data-theme="dark"></div><button type="submit">Continue</button></form>
    <p><a href="/">Return to Relay</a></p></main><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        // Ordinary form Continue is a non-CORS navigation; no-referrer sends Origin: null.
        'referrer-policy': 'same-origin',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
