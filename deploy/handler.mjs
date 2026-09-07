import { accessConfig, authenticatedRequest, authenticatedReadiness } from './access.mjs';
import { edgeGuard, usageGuard, bodyGuard, refusal } from './security.mjs';
import { captchaPage } from './captcha.mjs';

// The production entry supplies no keyResolver: only the configured Access JWKS is trusted.
// The local integration fixture supplies a generated public key without adding a runtime bypass.
export async function handleRequest(request, env, context, app, keyResolver) {
  const url = new URL(request.url);
  try { accessConfig(env); } catch {
    return new Response('Service unavailable', { status: 503 });
  }
  const edgeDenied = await edgeGuard(request, env);
  if (edgeDenied) return edgeDenied;
  if (url.pathname === '/healthz' && request.method === 'GET') {
    return Response.json({ status: 'ok', release: env.RELEASE_SHA }, {
      headers: { 'cache-control': 'no-store' },
    });
  }
  if (url.pathname === '/readyz' && request.method === 'GET') {
    try {
      await authenticatedReadiness(request, env, keyResolver);
    } catch {
      return new Response('Unauthorized', { status: 401 });
    }
    try {
      if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) throw new Error('Verification unavailable');
      await env.DB.prepare('SELECT 1 FROM jobs LIMIT 1').all();
      await env.DB.prepare('SELECT 1 FROM security_counters LIMIT 1').all();
      await env.DB.prepare('SELECT 1 FROM security_clearances LIMIT 1').all();
      return Response.json({ status: 'ready', release: env.RELEASE_SHA }, {
        headers: { 'cache-control': 'no-store' },
      });
    } catch {
      return new Response('Service unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
    }
  }
  try {
    request = await authenticatedRequest(request, env, keyResolver);
  } catch {
    return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  if (url.pathname === '/signout-with-chatgpt') {
    return Response.redirect(`${url.origin}/cdn-cgi/access/logout`, 302);
  }
  if (url.pathname === '/signin-with-chatgpt' || url.pathname === '/callback') {
    return Response.redirect(`${url.origin}/`, 302);
  }
  // Only known static paths bypass durable usage accounting. An asset miss
  // still passes through the same guard as every page/API, including new routes.
  const staticPath = /^\/(?:_next\/static\/|assets\/)/.test(url.pathname) || url.pathname === '/favicon.ico';
  if ((request.method === 'GET' || request.method === 'HEAD') && staticPath) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
  }
  try {
    const denied = await usageGuard(request, env);
    if (denied) return denied;
    if (url.pathname === '/security/check') return captchaPage(request, env);
    const bounded = await bodyGuard(request, env);
    if (bounded instanceof Response) return bounded;
    request = bounded;
  } catch {
    return refusal(503, 'security_unavailable', 'Service unavailable', 60);
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && !staticPath) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
  }
  return app.fetch(request, env, context);
}
