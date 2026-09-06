import { accessConfig, authenticatedRequest, authenticatedReadiness } from './access.mjs';

// The production entry supplies no keyResolver: only the configured Access JWKS is trusted.
// The local integration fixture supplies a generated public key without adding a runtime bypass.
export async function handleRequest(request, env, context, app, keyResolver) {
  const url = new URL(request.url);
  try { accessConfig(env); } catch {
    return new Response('Service unavailable', { status: 503 });
  }
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
      await env.DB.prepare('SELECT 1 FROM jobs LIMIT 1').all();
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
  if (request.method === 'GET' || request.method === 'HEAD') {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
  }
  return app.fetch(request, env, context);
}
