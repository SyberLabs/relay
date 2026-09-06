import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseConfig } from '../scripts/release/config.mjs';
import { verifyManifest } from '../scripts/release/artifact.mjs';

const env = { ACCESS_ISSUER: 'https://relay.cloudflareaccess.com', ACCESS_AUD: 'a'.repeat(64),
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
  WORKER_NAME: 'relay-staging', RELEASE_SHA: 'c'.repeat(40), DEPLOY_URL: 'https://staging.relay.example' };
void test('production configuration cannot expose static assets before identity verification', () => {
  const config = releaseConfig(env, {});
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.main, './dist/gateway/worker.js');
  assert.equal(config.no_bundle, true);
  assert.equal(config.d1_databases[0].binding, 'DB');
});
void test('configuration refuses absent credentials, placeholder database, invalid names, and non-origin URLs', () => {
  for (const name of Object.keys(env)) assert.throws(() => releaseConfig({ ...env, [name]: '' }, {}));
  assert.throws(() => releaseConfig({ ...env, D1_DATABASE_ID: '00000000-0000-4000-8000-000000000000' }, {}));
  for (const url of ['http://example.com', 'https://example.com/path', 'https://name:pass@example.com', 'https://example.com?x=1']) {
    assert.throws(() => releaseConfig({ ...env, DEPLOY_URL: url }, {}));
  }
});
void test('artifact verification binds release SHA and every byte, rejecting missing and extra files', () => {
  const files = Object.fromEntries(['dist/server/index.js', 'dist/server/wrangler.json', 'dist/gateway/worker.js', 'deploy/worker.mjs', 'deploy/access.mjs', 'deploy/handler.mjs'].map(path => [path, 'd'.repeat(64)]));
  const manifest = { version: 1, sha: env.RELEASE_SHA, files };
  verifyManifest(manifest, env.RELEASE_SHA, files);
  assert.throws(() => verifyManifest(manifest, 'f'.repeat(40), files));
  assert.throws(() => verifyManifest(manifest, env.RELEASE_SHA, { ...files, 'dist/extra.js': 'e' }));
  assert.throws(() => verifyManifest(manifest, env.RELEASE_SHA, { ...files, 'dist/server/index.js': 'tampered' }));
  assert.throws(() => verifyManifest({ ...manifest, files: {} }, env.RELEASE_SHA, {}));
});
