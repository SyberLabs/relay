import { constants, realpathSync } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
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

async function readDocument(root, path) {
  let location = root;
  for (const part of path.split('/')) {
    location = join(location, part);
    if ((await lstat(location)).isSymbolicLink()) {
      throw Error(`Symlink refused: ${path}`);
    }
  }
  if (!(await lstat(location)).isFile())
    throw Error(`Not a regular file: ${path}`);
  const file = await open(
    location,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    if (!(await file.stat()).isFile())
      throw Error(`Not a regular file: ${path}`);
    // Bound actual reads, even if a file grows after it is opened.
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        size,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    const limit =
      path === 'AGENTS.md' || path === 'docs/development/CONTEXT.md'
        ? 4096
        : path.startsWith('docs/development/')
          ? 2048
          : MAX_FILE_BYTES;
    if (size > limit)
      throw Error(`Context size exceeds ${limit} bytes: ${path}`);
    if (!size) throw Error(`Empty required document: ${path}`);
    const bytes = buffer.subarray(0, size);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return {
      path,
      bytes: size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      content,
    };
  } finally {
    await file.close();
  }
}

export async function buildContext(root, stage) {
  if (!Object.hasOwn(stages, stage))
    throw Error('Stage must be plan, build, review, or release.');
  const documents = [];
  for (const path of [...common, ...stages[stage]]) {
    documents.push(await readDocument(root, path));
  }
  const packet = [
    `# Relay development: ${stage}`,
    'Current repository documents only. Add the issue and relevant code separately. Verify source hashes on reuse. A packet is not approval.',
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
