import { realpathSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This explicit manifest is the only content the tool reads. No recursive
// retrieval, user-supplied paths, network calls, model calls, or file writes.
export const common = [
  'AGENTS.md',
  'docs/development/CONTEXT.md',
  'docs/abuse-controls.md',
  'CONTRIBUTING.md',
  'docs/delivery.md',
];
export const stages = {
  plan: ['docs/development/01-plan/CONTEXT.md'],
  build: ['docs/development/02-build/CONTEXT.md'],
  review: ['docs/development/03-review/CONTEXT.md', 'docs/threat-model.md'],
  release: ['docs/development/04-release/CONTEXT.md', 'docs/hosting.md'],
};
export const MAX_FILE_BYTES = 24 * 1024;
export const MAX_PACKET_BYTES = 48 * 1024;

const exec = promisify(execFile);
async function git(root, args) {
  const { stdout } = await exec(
    'git',
    [
      '--no-replace-objects',
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-C',
      root,
      ...args,
    ],
    {
      encoding: 'buffer',
      maxBuffer: MAX_FILE_BYTES + 1,
      timeout: 5000,
      windowsHide: true,
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    },
  );
  return stdout;
}

async function readDocument(root, path, object) {
  const limit =
    path === 'AGENTS.md' || path === 'docs/development/CONTEXT.md'
      ? 4096
      : path.startsWith('docs/development/')
        ? 2048
        : MAX_FILE_BYTES;
  const size = Number((await git(root, ['cat-file', '-s', object])).toString());
  if (size > limit) throw Error(`Context size exceeds ${limit} bytes: ${path}`);
  if (!size) throw Error(`Empty required document: ${path}`);
  // Read the immutable blob, never reopen a checked working-tree path.
  const bytes = await git(root, ['cat-file', 'blob', object]);
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return {
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    content,
  };
}

export async function buildContext(root, stage) {
  if (!Object.hasOwn(stages, stage))
    throw Error('Stage must be plan, build, review, or release.');
  const paths = [...common, ...stages[stage]];
  const commit = (await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']))
    .toString()
    .trim();
  const tree = (
    await git(root, ['ls-tree', '-z', '--full-tree', commit, '--', ...paths])
  ).toString();
  const objects = new Map(
    tree
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const [metadata, path] = entry.split('\t');
        const [mode, type, object] = metadata.split(' ');
        return [path, { mode, type, object }];
      }),
  );
  for (const path of paths) {
    const entry = objects.get(path);
    if (
      !entry ||
      entry.type !== 'blob' ||
      !['100644', '100755'].includes(entry.mode)
    ) {
      throw Error(
        `Required regular committed file missing or invalid: ${path}`,
      );
    }
  }
  try {
    await git(root, [
      'diff',
      '--quiet',
      '--no-ext-diff',
      '--no-textconv',
      commit,
      '--',
      ...paths,
    ]);
  } catch (error) {
    if (error.code === 1)
      throw Error(
        'Selected documents have uncommitted changes; read them directly or commit the intended changes before generating a packet.',
      );
    throw error;
  }
  const documents = [];
  for (const path of paths)
    documents.push(await readDocument(root, path, objects.get(path).object));
  const packet = [
    `# Relay development: ${stage}`,
    `Committed documents at ${commit}. Add the issue and relevant code separately. Verify current source state on reuse. A packet is not approval.`,
    ...documents.map(
      ({ path, sha256, content }) =>
        `## Source: ${path}\nSHA-256: ${sha256}\n\n${content}`,
    ),
  ].join('\n\n');
  const packetBytes = Buffer.byteLength(packet);
  if (packetBytes > MAX_PACKET_BYTES)
    throw Error(
      `Packet exceeds ${MAX_PACKET_BYTES} bytes; narrow the context without removing required contracts.`,
    );
  return {
    packet,
    report: {
      stage,
      commit,
      sourceBytes: documents.reduce((sum, doc) => sum + doc.bytes, 0),
      packetBytes,
      roughTextTokens: Math.ceil(packetBytes / 4),
      estimateNote:
        'UTF-8 bytes / 4, not tokenizer usage, model context, or cost.',
      documents: documents.map(
        ({ content: _content, ...metadata }) => metadata,
      ),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (args.length === 1 && args[0] === '--check') {
    const reports = [];
    for (const stage of Object.keys(stages)) {
      reports.push((await buildContext(root, stage)).report);
    }
    const corpus = new Map(
      reports.flatMap((report) =>
        report.documents.map((doc) => [doc.path, doc.bytes]),
      ),
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          comparison:
            'Selected documents versus the union of all stage documents; not measured session savings.',
          allStageSourceBytes: [...corpus.values()].reduce(
            (sum, bytes) => sum + bytes,
            0,
          ),
          stages: reports.map(({ documents: _documents, ...report }) => report),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (
    args.length < 1 ||
    args.length > 2 ||
    (args.length === 2 && args[1] !== '--print')
  ) {
    throw Error(
      'Usage: node scripts/agent-context.mjs <plan|build|review|release> [--print], or --check',
    );
  }
  const result = await buildContext(root, args[0]);
  // Nothing is emitted until every required input and the full packet pass.
  process.stdout.write(
    `${args[1] === '--print' ? result.packet : JSON.stringify(result.report, null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(process.argv[1])
) {
  main().catch((error) => {
    process.stderr.write(`Context refused: ${error.message}\n`);
    process.exitCode = 1;
  });
}
