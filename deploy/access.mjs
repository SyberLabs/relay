import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();

export function accessConfig(env) {
  const issuer = env.ACCESS_ISSUER;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer ?? '') ||
      !/^[a-f0-9]{64}$/.test(env.ACCESS_AUD ?? '')) {
    throw new Error('Access is not configured');
  }
  return { issuer, audience: env.ACCESS_AUD };
}

export async function authenticatedRequest(request, env, keyResolver) {
  const config = accessConfig(env);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new Error('Missing identity');
  if (!keyResolver) {
    if (!keySets.has(config.issuer)) {
      keySets.set(config.issuer, createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`)));
    }
    keyResolver = keySets.get(config.issuer);
  }
  const { payload } = await jwtVerify(token, keyResolver, {
    ...config,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'iat', 'exp'],
    maxTokenAge: '24h',
  });
  // Service credentials may check readiness but never impersonate a workspace owner.
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 ||
      typeof payload.email !== 'string' || !payload.email.includes('@')) {
    throw new Error('A human identity is required');
  }
  const headers = new Headers(request.headers);
  // Snapshot before deleting: iterating a live Headers collection can skip entries.
  const headerNames = [...headers.keys()];
  for (const name of headerNames) {
    if (name.startsWith('oai-') || name === 'cf-access-jwt-assertion' ||
        name === 'cf-access-client-id' || name === 'cf-access-client-secret') headers.delete(name);
  }
  headers.set('oai-authenticated-user-id', `cloudflare:${payload.sub}`);
  headers.set('oai-authenticated-user-email', payload.email);
  return new Request(request, { headers });
}

export async function authenticatedReadiness(request, env, keyResolver) {
  const config = accessConfig(env);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new Error('Missing identity');
  keyResolver ??= createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`));
  await jwtVerify(token, keyResolver, {
    ...config, algorithms: ['RS256'], requiredClaims: ['iat', 'exp'], maxTokenAge: '24h',
  });
}
