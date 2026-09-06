const origin = new URL(process.env.DEPLOY_URL);
if (origin.protocol !== 'https:') throw new Error('HTTPS required');
const headers = {};
const clientId = process.env.ACCESS_CLIENT_ID;
const clientSecret = process.env.ACCESS_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Access service credentials required for release smoke');
headers['CF-Access-Client-Id'] = clientId;
headers['CF-Access-Client-Secret'] = clientSecret;
for (const path of ['/healthz', '/readyz']) {
  const response = await fetch(new URL(path, origin), { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const body = await response.json();
  if (body.release !== process.env.RELEASE_SHA || body.status !== (path === '/healthz' ? 'ok' : 'ready')) {
    throw new Error(`${path} did not return the expected release`);
  }
}
// Service credentials must never be promoted to a human workspace identity.
const denied = await fetch(new URL('/api/workspace', origin), { headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
if (denied.status !== 401) throw new Error('Service token accessed workspace unexpectedly');
console.log('Release health, database readiness, and service identity isolation passed');
