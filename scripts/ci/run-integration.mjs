import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const nodeSuites = {
  api: 'tests/api.test.mjs',
  calibration: 'tests/calibration.test.mjs',
  orchestration: 'tests/orchestration.test.mjs',
  cli: 'tests/cli-live.test.mjs',
};
const suite = process.argv[2];
if (!(suite in nodeSuites) && suite !== 'browser')
  throw Error('Choose api, calibration, orchestration, cli, or browser.');
const root = process.cwd();
await mkdir(resolve(root, '.wrangler'), { recursive: true });
const state = await mkdtemp(resolve(root, '.wrangler', `ci-${suite}-`));
await mkdir(resolve(root, 'outputs', 'ci'), { recursive: true });
const log = createWriteStream(
  resolve(root, 'outputs', 'ci', `${suite}-server.log`),
);
const portProbe = createServer();
await new Promise((accept, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', accept);
});
const port = portProbe.address().port;
await new Promise((accept, reject) =>
  portProbe.close((error) => (error ? reject(error) : accept())),
);
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  RELAY_CI_STATE: state,
  RELAY_TEST_URL: base,
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_WRITE_LOGS: 'false',
};

async function bin(name, command = name) {
  const directory = resolve(root, 'node_modules', name);
  const pkg = JSON.parse(
    await readFile(resolve(directory, 'package.json'), 'utf8'),
  );
  return resolve(
    directory,
    typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[command],
  );
}

function run(args) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0
        ? accept()
        : reject(
            Error(`Command failed (${code ?? signal}): ${args.join(' ')}`),
          ),
    );
  });
}

let server;
try {
  const wrangler = await bin('wrangler');
  const migrations = (await readdir(resolve(root, 'drizzle')))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (!migrations.length) throw Error('No database migrations found.');
  for (const migration of migrations) {
    await run([
      wrangler,
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      'dist/server/wrangler.json',
      '--persist-to',
      state,
      '--file',
      `drizzle/${migration}`,
    ]);
  }
  server = spawn(
    process.execPath,
    [
      await bin('vinext'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    },
  );
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  let startupError;
  server.on('error', (error) => {
    startupError = error;
  });
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (server.exitCode !== null)
      throw Error(
        `Development server exited (${server.exitCode}). See outputs/ci/${suite}-server.log.`,
      );
    try {
      // A real unauthenticated API response proves both worker startup and routing.
      const response = await fetch(`${base}/api/workspace`, {
        signal: AbortSignal.timeout(2_000),
      });
      ready = response.status === 401;
      if (ready) break;
    } catch {
      /* The next bounded probe observes readiness. */
    }
    await delay(250);
  }
  if (!ready)
    throw Error(
      `Development server did not become ready. See outputs/ci/${suite}-server.log.`,
    );
  if (suite === 'browser')
    await run([await bin('@playwright/test', 'playwright'), 'test']);
  else await run([nodeSuites[suite]]);
} finally {
  if (server?.pid && server.exitCode === null) {
    if (process.platform === 'win32') {
      await new Promise((accept) => {
        const stop = spawn(
          'taskkill',
          ['/pid', String(server.pid), '/T', '/F'],
          { windowsHide: true, stdio: 'ignore' },
        );
        stop.on('exit', accept);
        stop.on('error', accept);
      });
    } else {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') {
          console.error('Unable to stop test server:', error);
          process.exitCode = 1;
        }
      }
    }
  }
  log.end();
}
