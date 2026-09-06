import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Live suites (api, calibration, orchestration, cli) need a running, freshly
// migrated application and a dedicated workspace. Required CI runs each of
// those via scripts/ci/run-integration.mjs on its own D1. Every other
// top-level test is automatically part of the unit gate.
const files = (await readdir('tests'))
  .filter(
    (name) =>
      name.endsWith('.test.mjs') &&
      name !== 'api.test.mjs' &&
      name !== 'calibration.test.mjs' &&
      name !== 'orchestration.test.mjs' &&
      name !== 'cli-live.test.mjs',
  )
  .sort()
  .map((name) => `tests/${name}`);
if (!files.length) throw Error('No unit tests discovered.');
const child = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '--test', ...files],
  {
    stdio: 'inherit',
    windowsHide: true,
  },
);
child.on('error', (error) => {
  throw error;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
