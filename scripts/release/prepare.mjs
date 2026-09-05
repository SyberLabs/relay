import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { releaseConfig } from './config.mjs';

const build = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
// Dry run performs no provider writes and deliberately uses fictional binding values.
const config = releaseConfig({
  ACCESS_ISSUER: 'https://relay-test.cloudflareaccess.com', ACCESS_AUD: 'a'.repeat(64),
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
  WORKER_NAME: 'relay-staging', DEPLOY_URL: 'https://staging.relay.example',
  RELEASE_SHA: process.env.GITHUB_SHA ?? 'c'.repeat(40),
}, build, { bundled: false });
writeFileSync('wrangler.release.json', JSON.stringify(config, null, 2));
const result = spawnSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'),
  'deploy', '--dry-run', '--outdir', 'dist/gateway', '--config', 'wrangler.release.json'], {
  stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
if (result.status !== 0) throw new Error('Gateway bundling failed');
