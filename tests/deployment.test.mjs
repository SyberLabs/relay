import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseConfig } from '../scripts/release/config.mjs';
import { verifyManifest } from '../scripts/release/artifact.mjs';

const env = { ACCESS_ISSUER: 'https://relay.cloudflareaccess.com', ACCESS_AUD: 'a'.repeat(64),
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
  WORKER_NAME: 'relay-staging', RELEASE_SHA: 'c'.repeat(40), DEPLOY_URL: 'https://staging.relay.example' };
const workersLabel = 'acct';
function workersEnv(worker = 'relay-staging', subdomain = workersLabel) {
  return {
    ...env,
    WORKER_NAME: worker,
    WORKERS_DEV_SUBDOMAIN: subdomain,
    DEPLOY_URL: `https://${worker}.${subdomain}.workers.dev`,
  };
}
function assertGatewayBindings(config) {
  assert.equal(config.preview_urls, false);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.main, './dist/gateway/worker.js');
  assert.equal(config.no_bundle, true);
  assert.equal(config.d1_databases[0].binding, 'DB');
}

void test('production configuration cannot expose static assets before identity verification', () => {
  for (const extra of [{}, { WORKERS_DEV_SUBDOMAIN: workersLabel }]) {
    const config = releaseConfig({ ...env, ...extra }, {});
    assert.equal(config.workers_dev, false);
    assert.deepEqual(config.routes, [{ pattern: 'staging.relay.example', custom_domain: true }]);
    assertGatewayBindings(config);
  }
});
void test('configuration refuses absent credentials, placeholder database, invalid names, and non-origin URLs', () => {
  for (const name of Object.keys(env)) assert.throws(() => releaseConfig({ ...env, [name]: '' }, {}));
  assert.throws(() => releaseConfig({ ...env, D1_DATABASE_ID: '00000000-0000-4000-8000-000000000000' }, {}));
  for (const url of ['http://example.com', 'https://example.com/path', 'https://name:pass@example.com', 'https://example.com?x=1']) {
    assert.throws(() => releaseConfig({ ...env, DEPLOY_URL: url }, {}));
  }
});
void test('validated workers.dev staging and production origins omit routes and keep the gateway bindings', () => {
  for (const worker of ['relay-staging', 'relay-production']) {
    const config = releaseConfig(workersEnv(worker), {});
    assert.equal(config.workers_dev, true);
    assert.equal(Object.hasOwn(config, 'routes'), false);
    assert.equal(config.name, worker);
    assertGatewayBindings(config);
  }
});
void test('workers.dev targets fail closed without an exact opted-in origin', () => {
  const ok = workersEnv();
  const cases = [
    { ...env, DEPLOY_URL: `https://relay-staging.${workersLabel}.workers.dev` },
    { ...ok, WORKERS_DEV_SUBDOMAIN: '' },
    { ...ok, DEPLOY_URL: `https://relay-staging.otheracct.workers.dev` },
    { ...ok, WORKER_NAME: 'relay-production' },
    { ...ok, DEPLOY_URL: `https://relay-production.${workersLabel}.workers.dev` },
    { ...ok, DEPLOY_URL: `https://preview.relay-staging.${workersLabel}.workers.dev` },
    { ...ok, DEPLOY_URL: `https://relay-staging.${workersLabel}.extra.workers.dev` },
    { ...ok, DEPLOY_URL: 'https://workers.dev' },
    { ...ok, DEPLOY_URL: `https://${workersLabel}.workers.dev` },
    { ...ok, DEPLOY_URL: `https://relay-staging.${workersLabel}.workers.dev.` },
  ];
  for (const input of cases) assert.throws(() => releaseConfig(input, {}));
});
void test('workers.dev subdomain labels accept 1 and 63 character DNS labels and reject malformed labels', () => {
  for (const subdomain of ['n', 'n'.repeat(63)]) {
    const config = releaseConfig(workersEnv('relay-staging', subdomain), {});
    assert.equal(config.workers_dev, true);
    assert.equal(Object.hasOwn(config, 'routes'), false);
    assertGatewayBindings(config);
  }
  for (const subdomain of ['', 'n'.repeat(64), 'a_b', 'a.b', '-ab', 'ab-', '-']) {
    const input = workersEnv('relay-staging', subdomain);
    assert.equal(new URL(input.DEPLOY_URL).hostname, `relay-staging.${subdomain}.workers.dev`);
    assert.throws(() => releaseConfig(input, {}), /WORKERS_DEV_SUBDOMAIN/);
  }
  assert.throws(() => releaseConfig({ ...workersEnv(), WORKERS_DEV_SUBDOMAIN: 'a b' }, {}), /WORKERS_DEV_SUBDOMAIN/);
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
