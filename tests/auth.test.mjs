import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { authenticatedRequest, authenticatedReadiness } from '../deploy/access.mjs';
import { handleRequest } from '../deploy/handler.mjs';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const env = { ACCESS_ISSUER: 'https://relay.cloudflareaccess.com', ACCESS_AUD: 'a'.repeat(64) };
async function token(overrides = {}, key = privateKey) {
  return new SignJWT({ sub: 'alice', email: 'alice@example.com', ...overrides })
    .setProtectedHeader({ alg: 'RS256' }).setIssuedAt(overrides.iat)
    .setIssuer(overrides.iss ?? env.ACCESS_ISSUER).setAudience(overrides.aud ?? env.ACCESS_AUD)
    .setExpirationTime(overrides.exp ?? '5m').sign(key);
}
function request(jwt, headers = {}) {
  return new Request('https://relay.example.com/api/workspace', {
    headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...headers },
  });
}
void test('valid Access identity replaces all spoofed application identity headers', async () => {
  const verified = await authenticatedRequest(request(await token(), {
    'oai-authenticated-user-id': 'victim', 'oai-authenticated-user-email': 'victim@example.com',
    'oai-authenticated-user-full-name': 'Forged Name', 'oai-other': 'forged',
    'CF-Access-Client-Secret': 'secret',
  }), env, publicKey);
  assert.equal(verified.headers.get('oai-authenticated-user-id'), 'cloudflare:alice');
  assert.equal(verified.headers.get('oai-authenticated-user-email'), 'alice@example.com');
  assert.equal(verified.headers.get('oai-authenticated-user-full-name'), null);
  assert.equal(verified.headers.get('oai-other'), null);
  assert.equal(verified.headers.get('Cf-Access-Jwt-Assertion'), null);
  assert.equal(verified.headers.get('CF-Access-Client-Secret'), null);
});
void test('rejects missing identity and missing provider configuration', async () => {
  await assert.rejects(authenticatedRequest(request(), env, publicKey));
  await assert.rejects(authenticatedRequest(request(await token()), {}, publicKey));
  await assert.rejects(authenticatedRequest(request(await token()), { ...env, ACCESS_ISSUER: 'https://attacker.example' }, publicKey));
});
void test('rejects wrong signature, issuer, audience, expired token, and missing human identity', async () => {
  const other = await generateKeyPair('RS256');
  for (const jwt of [await token({}, other.privateKey), await token({ iss: 'https://other.cloudflareaccess.com' }),
    await token({ aud: 'b'.repeat(64) }), await token({ exp: 1 }), await token({ sub: '' }),
    await token({ email: undefined }), await token({ iat: Math.floor(Date.now() / 1000) + 600 })]) {
    await assert.rejects(authenticatedRequest(request(jwt), env, publicKey));
  }
});
void test('gateway rejects anonymous asset access before invoking assets or application', async () => {
  const bindings = { ...env, ASSETS: { fetch() { throw new Error('Must not reach assets'); } } };
  const app = { fetch() { throw new Error('Must not reach application'); } };
  const response = await handleRequest(new Request('https://relay.example.com/_next/static/app.js'), bindings, {}, app, publicKey);
  assert.equal(response.status, 401);
});
void test('readiness reports unavailable database without leaking its error', async () => {
  const bindings = { ...env, DB: { prepare() { throw new Error('private database detail'); } } };
  const req = new Request('https://relay.example.com/readyz', { headers: { 'Cf-Access-Jwt-Assertion': await token() } });
  const response = await handleRequest(req, bindings, {}, {}, publicKey);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'Service unavailable');
});
void test('service tokens can prove readiness but cannot access human workspace data', async () => {
  const service = request(await token({ email: undefined, sub: '' }));
  await authenticatedReadiness(service, env, publicKey);
  await assert.rejects(authenticatedRequest(service, env, publicKey));
});
