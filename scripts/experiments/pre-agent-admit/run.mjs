#!/usr/bin/env node
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRows } from '../../../lib/domain.ts';
import { buildCatalog, countProviders } from './catalog.mjs';
import { compareArms } from './compare.mjs';
import { fetchDirectory, realClock, startGate } from './fetch.mjs';
import { fixtureFetch, FIXTURE_ROOT } from './fixtures.mjs';
import { compactPosting, scoreCorpus } from './instruments.mjs';
import { boardKey } from './load.mjs';
import {
  loadDirectory,
  loadKnown,
  loadLabels,
  loadSpec,
  readJson,
} from './load.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_NOW = Date.parse('2026-09-07T12:00:00.000Z');

export function clockForRun({ live = false, now } = {}) {
  if (now != null) return now;
  if (!live) return FIXTURE_NOW;
  return Date.now();
}

export async function runCompare(options) {
  const now = options.now ?? Date.now();
  const fetched = await fetchDirectory({
    directory: options.directory,
    known: options.known,
    spec: options.spec,
    arm: 'treatment',
    fetchImpl: options.fetchImpl,
    now,
    clock: options.clock,
    reserveStart: options.reserveStart,
    skip: options.skip,
    onBoard: options.onBoard,
    compact: options.compact !== false,
  });
  const postings = uniquePostings([
    ...(options.priorPostings || []),
    ...fetched.postings,
  ]);
  const compared = compareArms({
    postings,
    spec: options.spec,
    known: options.known,
    labels: options.labels,
    now,
  });
  compared.fetch = {
    boards_selected: fetched.boards_selected,
    boards_fetched: fetched.boards_fetched,
    boards_capped: fetched.boards_capped,
    skipped: fetched.skipped,
    failures: fetched.failures,
    fetched_postings: fetched.postings.length,
    corpus_postings: postings.length,
    sample_seed: fetched.sample_seed,
    boards: fetched.boards.map((board) => ({
      ok: board.ok,
      provider: board.provider,
      board: board.board,
      count: board.count,
      ms: board.ms,
      error: board.error,
    })),
  };
  if (options.catalog) compared.catalog = options.catalog;
  if (options.instruments) {
    compared.instruments = scoreCorpus(postings, {
      known: options.known,
      packet: options.huntPacket,
      min_cosine: options.minCosine,
      now,
      freshness_days: options.spec?.freshness_days,
    });
  }
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
  if (args.catalog && args.directory)
    throw Error('Use --catalog or --directory, not both.');
  if (args.live && !args.directory && !args.catalog)
    throw Error(
      '--live requires --directory or --catalog pointing at a private snapshot, not the committed fixtures.',
    );
  const useFixtures = !args.live;
  if (args.live && args.directory && isFixturePath(args.directory))
    throw Error(
      '--live refuses the committed fixture directory. Copy a private list into private-data/.',
    );
  if (args.live && args.catalog && isFixturePath(args.catalog))
    throw Error(
      '--live refuses the committed fixture catalog. Copy sources into private-data/.',
    );
  const spec = loadSpec(
    await readJson(args.spec || join(FIXTURE_ROOT, 'spec.json')),
  );
  if (args['full-directory']) {
    spec.caps.max_boards = 20_000;
  }
  const fetchImpl = useFixtures ? fixtureFetch() : fetch;
  const now = clockForRun({ live: Boolean(args.live) });
  const clock = args.live ? realClock() : {
    now: () => now,
    delay: async () => {},
  };
  const admit = startGate(clock, spec.caps.min_interval_ms);
  let directory;
  let catalogSummary = null;
  if (args.catalog) {
    const catalogPath = resolve(args.catalog);
    const built = await buildCatalog({
      catalog: await readJson(catalogPath),
      catalogDir: dirname(catalogPath),
      spec,
      fetchImpl,
      now,
      clock,
      reserveStart: admit,
    });
    directory = loadDirectory({ boards: built.boards });
    catalogSummary = built.summary;
  } else {
    directory = loadDirectory(
      await readJson(
        args.directory || join(FIXTURE_ROOT, 'directory.json'),
      ),
    );
  }
  const known = loadKnown(
    await readJson(args.known || join(FIXTURE_ROOT, 'known.json')),
  );
  const labels = args.labels
    ? loadLabels(await readJson(args.labels))
    : useFixtures
      ? loadLabels(await readJson(join(FIXTURE_ROOT, 'labels.json')))
      : null;
  const outDir = args.out ? resolve(args.out) : null;
  if (args['save-corpus'] && !outDir)
    throw Error('--save-corpus needs --out so the crawl can resume.');
  if (outDir) await mkdir(outDir, { recursive: true });
  const corpus = args['save-corpus']
    ? await openCorpus(outDir)
    : { skip: new Set(), priorPostings: [], onBoard: undefined };
  const huntPacket = args['hunt-packet']
    ? String(await readFile(resolve(args['hunt-packet']), 'utf8'))
    : undefined;
  const compared = await runCompare({
    spec,
    directory,
    known,
    labels,
    fetchImpl,
    now,
    clock,
    reserveStart: admit,
    catalog: catalogSummary,
    skip: corpus.skip,
    onBoard: corpus.onBoard,
    priorPostings: corpus.priorPostings,
    instruments: Boolean(args.instruments),
    huntPacket,
    minCosine: args['min-cosine'] ? Number(args['min-cosine']) : undefined,
  });
  const publicReport = publicCompare(compared);
  if (outDir) {
    await writeFile(
      join(outDir, 'compare.json'),
      `${JSON.stringify(publicReport, null, 2)}\n`,
    );
    await writeFile(
      join(outDir, 'directory.used.json'),
      `${JSON.stringify({ boards: directory }, null, 2)}\n`,
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

function uniquePostings(postings) {
  const seen = new Set();
  const out = [];
  for (const posting of postings) {
    const key = posting.row?.url || posting.row?.Job;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(posting);
  }
  return out;
}

async function openCorpus(outDir) {
  const corpusPath = join(outDir, 'postings.ndjson');
  const progressPath = join(outDir, 'boards.progress.json');
  let progress = { schema: 'relay.pre-agent-admit.progress.v1', done: {} };
  try {
    progress = JSON.parse(await readFile(progressPath, 'utf8'));
    if (!progress.done || typeof progress.done !== 'object') progress.done = {};
  } catch {
    progress = { schema: 'relay.pre-agent-admit.progress.v1', done: {} };
  }
  const priorPostings = [];
  try {
    const text = await readFile(corpusPath, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      priorPostings.push(JSON.parse(line));
    }
  } catch {
    /* first run */
  }
  const skip = new Set(Object.keys(progress.done));
  return {
    skip,
    priorPostings,
    async onBoard(result, entry) {
      const key = boardKey(entry);
      if (result.ok) {
        const chunks = [];
        for (const row of result.rows) {
          chunks.push(
            `${JSON.stringify(
              compactPosting({
                row,
                board: result.board,
                provider: result.provider,
                company: result.company,
              }),
            )}\n`,
          );
        }
        if (chunks.length) await appendFile(corpusPath, chunks.join(''));
      }
      progress.done[key] = {
        ok: result.ok,
        count: result.count,
        error: result.error || undefined,
        ms: result.ms,
      };
      await writeFile(progressPath, `${JSON.stringify(progress)}\n`);
    },
  };
}

function publicCompare(compared) {
  const { rows: _rows, fetch, ...rest } = compared;
  if (!fetch) return rest;
  const { boards = [], ...fetchCounts } = fetch;
  return {
    ...rest,
    fetch: {
      ...fetchCounts,
      by_provider: countProviders(boards),
    },
  };
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
  node scripts/experiments/pre-agent-admit/run.mjs --fixtures \\
    --catalog scripts/experiments/pre-agent-admit/fixtures/catalog/catalog.json
  node scripts/experiments/pre-agent-admit/run.mjs --live \\
    --spec private-data/experiments/pre-agent-admit/spec.json \\
    --catalog private-data/experiments/pre-agent-admit/catalog.json \\
    --known private-data/experiments/pre-agent-admit/known.json \\
    --labels private-data/experiments/pre-agent-admit/labels.json \\
    --out private-data/experiments/pre-agent-admit/runs/current
  node scripts/experiments/pre-agent-admit/run.mjs --live --full-directory \\
    --save-corpus --instruments \\
    --spec private-data/experiments/pre-agent-admit/spec-full.json \\
    --catalog private-data/experiments/pre-agent-admit/catalog.json \\
    --known private-data/experiments/pre-agent-admit/known.json \\
    --out private-data/experiments/pre-agent-admit/runs/full

--fixtures is the default. It never makes network calls.
--live fetches Greenhouse, Lever, and Ashby public board JSON only.
--full-directory raises max_boards to 20000 so LastRound is not sampled.
--save-corpus writes compact postings.ndjson under --out and resumes.
--instruments scores the corpus with intern regex on the title after
Company —, then local vocabulary cosine, then a US-seat location check.
No embedder, no LLM, writing agent asleep.
--catalog unions LastRound / ats-jobs-mcp / intern-engine / africa / CDX
snapshots and optional HN/YC/startups/speedrun scouts, then samples to
max_boards. Keep real tokens and CSVs in private-data/. Attribute LastRound.
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
