import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { accessConfig } from '../../deploy/access.mjs';

export function releaseConfig(env, build, { bundled = true } = {}) {
  accessConfig(env);
  for (const [name, expression] of Object.entries({
    CLOUDFLARE_ACCOUNT_ID: /^[a-f0-9]{32}$/,
    D1_DATABASE_ID: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    WORKER_NAME: /^relay-(staging|production)$/,
    RELEASE_SHA: /^[a-f0-9]{40}$/,
  })) {
    if (!expression.test(env[name] ?? '')) throw new Error(`Invalid or missing ${name}`);
  }
  if (env.D1_DATABASE_ID === '00000000-0000-4000-8000-000000000000') throw new Error('Placeholder database forbidden');
  const origin = new URL(env.DEPLOY_URL);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password || origin.port || origin.search || origin.hash || origin.hostname.endsWith('.')) {
    throw new Error('DEPLOY_URL must be an HTTPS origin');
  }
  const hostname = origin.hostname;
  const workersDev = hostname === 'workers.dev' || hostname.endsWith('.workers.dev');
  const subdomain = env.WORKERS_DEV_SUBDOMAIN ?? '';
  if (workersDev) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(subdomain)) {
      throw new Error('Invalid or missing WORKERS_DEV_SUBDOMAIN');
    }
    if (hostname !== `${env.WORKER_NAME}.${subdomain.toLowerCase()}.workers.dev`) {
      throw new Error('DEPLOY_URL must be the exact workers.dev origin');
    }
  }
  return {
    name: env.WORKER_NAME,
    account_id: env.CLOUDFLARE_ACCOUNT_ID,
    main: bundled ? './dist/gateway/worker.js' : './deploy/worker.mjs',
    no_bundle: bundled,
    compatibility_date: build.compatibility_date ?? '2026-09-05',
    compatibility_flags: build.compatibility_flags ?? ['nodejs_compat'],
    workers_dev: workersDev,
    preview_urls: false,
    ...(workersDev ? {} : { routes: [{ pattern: hostname, custom_domain: true }] }),
    assets: { directory: './dist/client', binding: 'ASSETS', run_worker_first: true },
    rules: build.rules,
    d1_databases: [{ binding: 'DB', database_name: env.WORKER_NAME,
      database_id: env.D1_DATABASE_ID, migrations_dir: './drizzle' }],
    vars: { ACCESS_ISSUER: env.ACCESS_ISSUER, ACCESS_AUD: env.ACCESS_AUD,
      RELEASE_SHA: env.RELEASE_SHA },
    observability: { enabled: true, head_sampling_rate: 0.1 },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const build = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
  writeFileSync('wrangler.release.json', JSON.stringify(releaseConfig(process.env, build), null, 2) + '\n');
}
