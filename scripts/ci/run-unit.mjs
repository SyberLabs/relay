import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// The API contract suite needs a running, freshly migrated application.
// Every other top-level test is automatically part of the unit gate.
const files = (await readdir('tests'))
  .filter((name) => name.endsWith('.test.mjs') && name !== 'api.test.mjs')
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
