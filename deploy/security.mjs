// Limits are shared by every production route. D1 reservations are atomic;
// edge limits only shed bursts and are not used for accounting.
export const COUNTER_SQL = `INSERT INTO security_counters (scope, period, used)
  SELECT ?1, ?2, ?3 WHERE ?3 <= ?4
  ON CONFLICT(scope) DO UPDATE SET period = excluded.period,
    used = CASE WHEN security_counters.period = excluded.period
      THEN security_counters.used + excluded.used ELSE excluded.used END
  WHERE excluded.period >= security_counters.period AND (CASE WHEN security_counters.period = excluded.period
    THEN security_counters.used ELSE 0 END) + excluded.used <= ?4
  RETURNING used`;

export function refusal(status, code, error, retryAfter) {
  return Response.json(
    {
      error,
      code,
      ...(code === 'verification_required'
        ? { verification_url: '/security/check' }
        : {}),
    },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}),
      },
    },
  );
}

export async function reserve(db, scope, period, amount, limit) {
  return db.prepare(COUNTER_SQL).bind(scope, period, amount, limit).first();
}

export async function edgeGuard(request, env) {
  // CF-Connecting-IP is trusted only on the Cloudflare gateway, never a
  // forwarded/client identity header. Missing addresses share a bucket.
  const key = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const result = await env.EDGE_RATE_LIMITER.limit({ key });
    if (!result.success)
      return refusal(
        429,
        'rate_limited',
        'Too many requests. Try again shortly.',
        60,
      );
  } catch {
    return refusal(503, 'security_unavailable', 'Service unavailable', 60);
  }
  return null;
}

export async function principalKey(request) {
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner) throw new Error('Missing verified identity');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(owner),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

function routePath(request) {
  // Match encoded/trailing-slash aliases before assigning a resource policy.
  return (
    decodeURIComponent(new URL(request.url).pathname)
      .replace(/\/{2,}/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

export async function usageGuard(request, env, now = Date.now()) {
  const user = await principalKey(request);
  const path = routePath(request);
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (env.RELAY_PAUSE === 'all' || (write && env.RELAY_PAUSE === 'writes')) {
    return refusal(
      503,
      'service_paused',
      'Relay is temporarily paused. Please try later.',
      300,
    );
  }
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const date = new Date(now);
  const month = date.toISOString().slice(0, 7);
  const monthRetry = Math.ceil(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - now) / 1000,
  );
  const work = write || path === '/api/plan' ? 10 : 1;
  // Reserve before work. Failed/denied requests are deliberately not refunded.
  // Separate scopes may be conservatively charged when a later scope refuses.
  const budgets = [
    [`${user}:minute`, minute, 1, 120, 60],
    ...(write ? [[`${user}:write-minute`, minute, 1, 20, 60]] : []),
    ...(path === '/api/plan'
      ? [[`${user}:plan-minute`, minute, 1, 6, 60]]
      : []),
    [
      `${user}:day`,
      day,
      work,
      3_000,
      86_400 - (Math.floor(now / 1000) % 86_400),
    ],
    [
      'global:day',
      day,
      work,
      100_000,
      86_400 - (Math.floor(now / 1000) % 86_400),
    ],
    ['global:month', month, work, 2_000_000, monthRetry],
  ];
  for (const [scope, period, amount, limit, retry] of budgets) {
    if (!(await reserve(env.DB, scope, String(period), amount, limit))) {
      return refusal(
        429,
        'usage_limit',
        'Relay usage limit reached. Please try after the reset.',
        retry,
      );
    }
  }
  // Human verification is a step-up for sustained writes, not a quota bypass.
  if (write && path !== '/security/check') {
    const count = await reserve(
      env.DB,
      `${user}:challenge-hour`,
      String(Math.floor(now / 3_600_000)),
      1,
      1_000_000,
    );
    if (!count || count.used > 20) {
      const clearance = await env.DB.prepare(
        'SELECT expires FROM security_clearances WHERE owner = ?',
      )
        .bind(user)
        .first();
      if (!clearance || clearance.expires <= now) {
        return refusal(
          403,
          'verification_required',
          'Complete verification at /security/check, then retry your action. Your unsaved work has not been submitted.',
        );
      }
    }
  }
  return null;
}

// Read the actual byte stream before parsing; Content-Length alone is not a limit.
export async function boundedBody(request, limit) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new RangeError('Body too large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Body timeout')), 10_000);
  });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new RangeError('Body too large');
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function bodyGuard(request, env) {
  if (['GET', 'HEAD'].includes(request.method)) return request;
  const limit = routePath(request) === '/api/workspace' ? 2_000_000 : 256_000;
  let body;
  try {
    body = await boundedBody(request, limit);
  } catch (error) {
    return refusal(
      error instanceof RangeError ? 413 : 408,
      'invalid_body',
      'Request is too large or took too long.',
    );
  }
  const user = await principalKey(request);
  // Lifetime input budget also bounds accumulated large text, even across resets.
  if (
    !(await reserve(
      env.DB,
      `${user}:bytes`,
      'lifetime',
      body.byteLength,
      100_000_000,
    ))
  ) {
    return refusal(
      429,
      'storage_limit',
      'Workspace input quota reached. Contact support before importing more data.',
    );
  }
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request, { method: request.method, headers, body });
}
