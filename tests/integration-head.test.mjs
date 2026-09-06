import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/check-integration-head.mjs',
);

function git(cwd, args) {
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function repo() {
  const cwd = await mkdtemp(resolve(tmpdir(), 'relay-head-'));
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'ci@example.com']);
  git(cwd, ['config', 'user.name', 'Relay CI']);
  await writeFile(resolve(cwd, 'file.txt'), 'a\n');
  git(cwd, ['add', 'file.txt']);
  git(cwd, ['commit', '-m', 'base']);
  return cwd;
}

function check(cwd, extra = []) {
  return spawnSync(
    process.execPath,
    [script, '--cwd', cwd, '--base', 'main', '--json', ...extra],
    { encoding: 'utf8' },
  );
}

void test('reports current when HEAD already contains main', async () => {
  const cwd = await repo();
  try {
    git(cwd, ['checkout', '-b', 'feat']);
    const result = check(cwd);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.behind, 0);
    assert.equal(report.ahead, 0);
    assert.equal(report.current, true);
    assert.match(report.head_tree, /^[0-9a-f]{40}$/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

void test('reports behind without failing so freeze can wait instead of rebasing', async () => {
  const cwd = await repo();
  try {
    git(cwd, ['checkout', '-b', 'feat']);
    git(cwd, ['checkout', 'main']);
    await writeFile(resolve(cwd, 'file.txt'), 'b\n');
    git(cwd, ['commit', '-am', 'main moved']);
    git(cwd, ['checkout', 'feat']);
    const result = check(cwd);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.behind, 1);
    assert.equal(report.current, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

void test('reuses evidence only when HEAD tree matches the cited commit', async () => {
  const cwd = await repo();
  try {
    git(cwd, ['checkout', '-b', 'feat']);
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const match = check(cwd, ['--evidence', base]);
    assert.equal(match.status, 0, match.stderr);
    assert.equal(JSON.parse(match.stdout).evidence_matches, true);
    await writeFile(resolve(cwd, 'file.txt'), 'feature\n');
    git(cwd, ['commit', '-am', 'feature']);
    const mismatch = check(cwd, ['--evidence', base]);
    assert.equal(mismatch.status, 2, mismatch.stderr);
    assert.equal(JSON.parse(mismatch.stdout).evidence_matches, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

void test('rejects unknown flags', async () => {
  const cwd = await repo();
  try {
    const result = check(cwd, ['--dashboard']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown argument/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
