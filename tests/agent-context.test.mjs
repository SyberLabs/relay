import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  buildContext,
  common,
  stages,
  MAX_FILE_BYTES,
} from '../scripts/agent-context.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));

function git(root, args, input) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=Fictional Tester',
      '-c',
      'user.email=fictional@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      `core.hooksPath=${join(root, 'no-hooks')}`,
      '-C',
      root,
      ...args,
    ],
    { encoding: 'utf8', input, timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function commit(root, stage = true) {
  if (stage) git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'Fictional context fixture']);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'relay-context-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of new Set([...common, ...Object.values(stages).flat()])) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `# Fictional ${path}\n`);
  }
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', 'false']);
  commit(root);
  return root;
}

await test('build selects required contracts without leaking unrelated stages or private files', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'docs/hosting.md'), 'UNRELATED_RELEASE_SENTINEL');
  await mkdir(join(root, 'private-data'));
  await writeFile(join(root, 'private-data/fictional.md'), 'PRIVATE_SENTINEL');
  commit(root);
  const { packet, report } = await buildContext(root, 'build');
  assert.ok(packet.includes('docs/abuse-controls.md'));
  assert.ok(packet.includes('docs/delivery.md'));
  assert.ok(packet.includes('02-build/CONTEXT.md'));
  assert.ok(!packet.includes('UNRELATED_RELEASE_SENTINEL'));
  assert.ok(!packet.includes('PRIVATE_SENTINEL'));
  assert.equal(report.packetBytes, Buffer.byteLength(packet));
  const before = report.documents.find(
    (doc) => doc.path === 'AGENTS.md',
  ).sha256;
  await writeFile(join(root, 'AGENTS.md'), '# Changed contract\n');
  await assert.rejects(buildContext(root, 'build'), /uncommitted changes/);
  commit(root);
  const updated = await buildContext(root, 'build');
  assert.notEqual(updated.report.commit, report.commit);
  const after = updated.report.documents.find(
    (doc) => doc.path === 'AGENTS.md',
  ).sha256;
  assert.notEqual(
    before,
    after,
    'source changes must be visible to a resumed consumer',
  );
});

await test('missing, empty, invalid UTF-8 and oversized required documents refuse the packet', async (t) => {
  const root = await fixture(t);
  const path = join(root, 'docs/abuse-controls.md');
  await rm(path);
  commit(root);
  await assert.rejects(buildContext(root, 'build'), /regular committed file/);
  await mkdir(path);
  await writeFile(join(path, 'child.md'), 'Fictional child');
  commit(root);
  await assert.rejects(buildContext(root, 'build'), /regular committed file/);
  await rm(path, { recursive: true });
  await writeFile(path, '');
  commit(root);
  await assert.rejects(buildContext(root, 'build'), /Empty required/);
  await writeFile(path, Buffer.from([0xff]));
  commit(root);
  await assert.rejects(buildContext(root, 'build'), /encoded data/);
  await writeFile(path, 'x'.repeat(MAX_FILE_BYTES + 1));
  commit(root);
  await assert.rejects(buildContext(root, 'build'), /Context size exceeds/);
  await writeFile(path, 'Valid again');
  await writeFile(join(root, 'AGENTS.md'), '界'.repeat(1400));
  commit(root);
  await assert.rejects(
    buildContext(root, 'build'),
    /4096 bytes/,
    'budget must count bytes, not characters',
  );
});

await test('total packet limit refuses a selection even when individual documents fit', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'docs/abuse-controls.md'),
    'a'.repeat(MAX_FILE_BYTES),
  );
  await writeFile(join(root, 'docs/delivery.md'), 'b'.repeat(MAX_FILE_BYTES));
  commit(root);
  await assert.rejects(buildContext(root, 'build'), /Packet exceeds/);
});

await test('committed symlink files and directory links refuse without OS symlink privileges', async (t) => {
  const root = await fixture(t);
  const blob = git(root, ['hash-object', '-w', '--stdin'], 'AGENTS.md');
  git(root, [
    'update-index',
    '--cacheinfo',
    `120000,${blob},docs/abuse-controls.md`,
  ]);
  commit(root, false);
  await assert.rejects(buildContext(root, 'build'), /regular committed file/);
  const directory = await fixture(t);
  const outside = git(
    directory,
    ['hash-object', '-w', '--stdin'],
    '../fictional-outside',
  );
  git(directory, ['rm', '-r', '--cached', 'docs']);
  git(directory, [
    'update-index',
    '--add',
    '--cacheinfo',
    `120000,${outside},docs`,
  ]);
  commit(directory, false);
  await assert.rejects(
    buildContext(directory, 'build'),
    /regular committed file/,
  );
});

await test('unknown stages refuse without reading files', async () => {
  for (const stage of ['../private-data', '__proto__', 'constructor', '']) {
    await assert.rejects(
      buildContext('/does-not-exist', stage),
      /Stage must be/,
    );
  }
});

await test('CLI emits no partial context when a late required document is missing', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'scripts'));
  const script = join(root, 'scripts/agent-context.mjs');
  await copyFile(join(repository, 'scripts/agent-context.mjs'), script);
  const valid = spawnSync(process.execPath, [script, 'build'], {
    encoding: 'utf8',
  });
  assert.equal(valid.status, 0);
  assert.equal(JSON.parse(valid.stdout).stage, 'build');
  const invalid = spawnSync(process.execPath, [script, 'build', '--unknown'], {
    encoding: 'utf8',
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  await rm(join(root, 'docs/hosting.md'));
  commit(root);
  const result = spawnSync(process.execPath, [script, 'release', '--print'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Context refused/);
  const check = spawnSync(process.execPath, [script, '--check'], {
    encoding: 'utf8',
  });
  assert.equal(check.status, 1);
  assert.equal(check.stdout, '');
});

await test('repository routes fit their budgets and local markdown links resolve', async () => {
  const paths = new Set([
    'docs/development/README.md',
    'docs/development/checkpoint.md',
  ]);
  for (const stage of Object.keys(stages)) {
    const { report } = await buildContext(repository, stage);
    for (const doc of report.documents) paths.add(doc.path);
  }
  for (const path of paths) {
    const content = await readFile(join(repository, path), 'utf8');
    for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(target)) continue;
      await readFile(join(repository, dirname(path), target.split('#')[0]));
    }
  }
});
