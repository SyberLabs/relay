import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { browserPlaywrightPlan } from './browser-playwright-plan.mjs';

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

async function migrate(persistTo) {
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
      persistTo,
      '--file',
      `drizzle/${migration}`,
    ]);
  }
}

async function startServer() {
  const server = spawn(
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
  try {
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
    return server;
  } catch (error) {
    await stopServer(server);
    throw error;
  }
}

async function waitUntilPortIdle() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const probe = createServer();
    const free = await new Promise((accept) => {
      probe.once('error', () => accept(false));
      probe.listen(port, '127.0.0.1', () => accept(true));
    });
    await new Promise((accept, reject) =>
      probe.close((error) => (error ? reject(error) : accept())),
    );
    if (free) return;
    await delay(50);
  }
  throw Error(`Port ${port} stayed bound after the test server stopped.`);
}

async function stopServer(server) {
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
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && server.exitCode === null) await delay(50);
    if (server.exitCode === null && process.platform !== 'win32') {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') {
          console.error('Unable to stop test server:', error);
          process.exitCode = 1;
        }
      }
      while (Date.now() < deadline && server.exitCode === null) await delay(50);
    }
  }
  await waitUntilPortIdle();
}

async function withFreshDatabase(persistTo, work) {
  env.RELAY_CI_STATE = persistTo;
  await migrate(persistTo);
  const server = await startServer();
  try {
    await work();
  } finally {
    await stopServer(server);
  }
}

const extraArgs = process.argv.slice(3).filter((arg) => arg !== '--');
try {
  if (suite === 'browser') {
    // Operative send consumes one of the ten application starts per owner per
    // UTC day and leaves jobs on D1. A second persist-to keeps the rest of
    // the browser suite's empty-workspace and remaining-capacity assumptions.
    const playwright = await bin('@playwright/test', 'playwright');
    const operativeState =
      extraArgs.length === 0
        ? await mkdtemp(resolve(root, '.wrangler', 'ci-browser-operative-'))
        : state;
    for (const step of browserPlaywrightPlan({
      extraArgs,
      operativeState,
      mainState: state,
    })) {
      if (step.skipOperative) env.RELAY_E2E_SKIP_OPERATIVE = '1';
      else delete env.RELAY_E2E_SKIP_OPERATIVE;
      await withFreshDatabase(step.persistTo, () =>
        run([playwright, 'test', ...step.args]),
      );
    }
  } else {
    await withFreshDatabase(state, () => run([nodeSuites[suite]]));
  }
} finally {
  log.end();
}
