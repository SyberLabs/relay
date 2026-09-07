import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const SMOKE_RETRY_WINDOW_MS = 90_000;
export const SMOKE_RETRY_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 30_000;

function accessHeaders(env) {
  const clientId = env.ACCESS_CLIENT_ID;
  const clientSecret = env.ACCESS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Access service credentials required for release smoke');
  return {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  };
}

async function readProtectedRelease(path, expectedStatus, { origin, headers, env, fetchImpl, sleep, now, retryWindowMs, retryDelayMs }) {
  const started = now();
  for (;;) {
    const response = await fetchImpl(new URL(path, origin), {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = await response.json();
      if (body.release !== env.RELEASE_SHA || body.status !== expectedStatus) {
        throw new Error(`${path} did not return the expected release`);
      }
      return;
    }
    if (response.status !== 404 || now() - started >= retryWindowMs) {
      throw new Error(`${path} returned ${response.status}`);
    }
    await sleep(retryDelayMs);
  }
}

export async function smokeRelease({
  env = process.env,
  fetchImpl = fetch,
  sleep = delay,
  now = Date.now,
  retryWindowMs = SMOKE_RETRY_WINDOW_MS,
  retryDelayMs = SMOKE_RETRY_DELAY_MS,
} = {}) {
  const origin = new URL(env.DEPLOY_URL);
  if (origin.protocol !== 'https:') throw new Error('HTTPS required');
  const headers = accessHeaders(env);
  await readProtectedRelease('/healthz', 'ok', { origin, headers, env, fetchImpl, sleep, now, retryWindowMs, retryDelayMs });
  await readProtectedRelease('/readyz', 'ready', { origin, headers, env, fetchImpl, sleep, now, retryWindowMs, retryDelayMs });
  // Service credentials must never be promoted to a human workspace identity.
  const denied = await fetchImpl(new URL('/api/workspace', origin), {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (denied.status !== 401) throw new Error('Service token accessed workspace unexpectedly');
  console.log('Release health, database readiness, and service identity isolation passed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await smokeRelease();
}
