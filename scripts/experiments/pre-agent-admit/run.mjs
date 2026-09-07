#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRows } from '../../../lib/domain.ts';
import { compareArms } from './compare.mjs';
import { fetchDirectory } from './fetch.mjs';
import { fixtureFetch, FIXTURE_ROOT } from './fixtures.mjs';
import {
  loadDirectory,
  loadKnown,
  loadLabels,
  loadSpec,
  readJson,
} from './load.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export async function runCompare(options) {
  const now = options.now ?? Date.parse('2026-09-07T12:00:00.000Z');
  const fetched = await fetchDirectory({
    directory: options.directory,
    known: options.known,
    spec: options.spec,
    arm: 'treatment',
    fetchImpl: options.fetchImpl,
    now,
  });
  const compared = compareArms({
    postings: fetched.postings,
    spec: options.spec,
    known: options.known,
    labels: options.labels,
    now,
  });
  compared.fetch = {
    boards_selected: fetched.boards_selected,
    boards_fetched: fetched.boards_fetched,
    boards_capped: fetched.boards_capped,
    failures: fetched.failures,
    fetched_postings: fetched.postings.length,
    boards: fetched.boards.map((board) => ({
      ok: board.ok,
      provider: board.provider,
      board: board.board,
      count: board.count,
      ms: board.ms,
      error: board.error,
    })),
  };
  return compared;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  if (args.live && args.fixtures)
    throw Error('Use either --fixtures or --live, not both.');
  if (args.live && !args.directory)
    throw Error(
      '--live requires --directory pointing at a private board list, not the committed fixtures.',
    );
  const useFixtures = !args.live;
  if (args.live && isFixturePath(args.directory))
    throw Error(
      '--live refuses the committed fixture directory. Copy a private list into private-data/.',
    );
  const spec = loadSpec(
    await readJson(args.spec || join(FIXTURE_ROOT, 'spec.json')),
  );
  const directory = loadDirectory(
    await readJson(
      args.directory || join(FIXTURE_ROOT, 'directory.json'),
    ),
  );
  const known = loadKnown(
    await readJson(args.known || join(FIXTURE_ROOT, 'known.json')),
  );
  const labels = args.labels
    ? loadLabels(await readJson(args.labels))
    : useFixtures
      ? loadLabels(await readJson(join(FIXTURE_ROOT, 'labels.json')))
      : null;
  const compared = await runCompare({
    spec,
    directory,
    known,
    labels,
    fetchImpl: useFixtures ? fixtureFetch() : fetch,
  });
  const publicReport = publicCompare(compared);
  if (args.out) {
    const outDir = resolve(args.out);
    await mkdir(outDir, { recursive: true });
    await writeFile(
      join(outDir, 'compare.json'),
      `${JSON.stringify(publicReport, null, 2)}\n`,
    );
    for (const [arm, rows] of Object.entries(compared.rows)) {
      await writeFile(
        join(outDir, `${arm}.json`),
        `${JSON.stringify(rows, null, 2)}\n`,
      );
      if (rows.length)
        await writeFile(
          join(outDir, `${arm}.relay-import.json`),
          `${JSON.stringify(validateRows(rows), null, 2)}\n`,
        );
    }
    console.error(`Wrote ${outDir}`);
  }
  console.log(JSON.stringify(publicReport, null, 2));
  return 0;
}

function publicCompare(compared) {
  const { rows: _rows, ...rest } = compared;
  return rest;
}

export function isFixturePath(path) {
  const resolved = resolve(path);
  return (
    resolved.startsWith(resolve(FIXTURE_ROOT)) ||
    resolved.startsWith(join(here, 'fixtures'))
  );
}

function printHelp() {
  console.log(`Pre-agent admission experiment (issue #105)

Compare exhausting public ATS boards before a writing agent wakes
against today's known-company pull and a query-shaped search cap.

  node scripts/experiments/pre-agent-admit/run.mjs --fixtures
  node scripts/experiments/pre-agent-admit/run.mjs --fixtures --out /tmp/pre-agent-admit
  node scripts/experiments/pre-agent-admit/run.mjs --live \\
    --spec private-data/experiments/pre-agent-admit/spec.json \\
    --directory private-data/experiments/pre-agent-admit/directory.json \\
    --known private-data/experiments/pre-agent-admit/known.json \\
    --labels private-data/experiments/pre-agent-admit/labels.json \\
    --out private-data/experiments/pre-agent-admit/runs/current

--fixtures is the default. It never makes network calls.
--live fetches Greenhouse, Lever, and Ashby public board JSON only.
The writing/review agent stays asleep. Relay still does not submit.
`);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main(process.argv).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
