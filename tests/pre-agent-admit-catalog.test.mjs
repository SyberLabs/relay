import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchDirectory, startGate } from '../scripts/experiments/pre-agent-admit/fetch.mjs';
import { fixtureFetch } from '../scripts/experiments/pre-agent-admit/fixtures.mjs';
import {
  LASTROUND_ATTRIBUTION,
  buildCatalog,
  parseSource,
  sampleBoards,
  unionBoards,
} from '../scripts/experiments/pre-agent-admit/catalog.mjs';
import {
  blockedJobHost,
  candidatesFromNameWebsite,
  extractAtsFromUrl,
  scoutCandidates,
} from '../scripts/experiments/pre-agent-admit/scout.mjs';
import { loadSpec } from '../scripts/experiments/pre-agent-admit/load.mjs';
import { clockForRun, parseArgs } from '../scripts/experiments/pre-agent-admit/run.mjs';

const CAT = new URL(
  '../scripts/experiments/pre-agent-admit/fixtures/catalog/',
  import.meta.url,
);
const NOW = Date.parse('2026-09-07T12:00:00.000Z');

function spec(overrides = {}) {
  return loadSpec({
    title_any: ['backend', 'infrastructure'],
    queries: ['senior backend'],
    query_k: 1,
    caps: {
      max_boards: 8,
      max_admitted: 200,
      concurrency: 3,
      request_timeout_ms: 5000,
      min_interval_ms: 250,
      ...overrides.caps,
    },
    ...overrides,
  });
}

async function read(name) {
  return readFile(fileURLToPath(new URL(name, CAT)), 'utf8');
}

void test('live clock is wall time; fixtures keep a frozen instant', () => {
  const frozen = Date.parse('2026-09-07T12:00:00.000Z');
  assert.equal(clockForRun({ live: false }), frozen);
  assert.equal(clockForRun({ now: 42, live: true }), 42);
  const live = clockForRun({ live: true });
  assert.ok(Math.abs(live - Date.now()) < 50);
  assert.notEqual(live, frozen);
});

void test('--live accepts a catalog instead of a pre-built directory', () => {
  const args = parseArgs([
    'node',
    'run.mjs',
    '--live',
    '--catalog',
    'private-data/experiments/pre-agent-admit/catalog.json',
  ]);
  assert.equal(args.live, true);
  assert.equal(
    args.catalog,
    'private-data/experiments/pre-agent-admit/catalog.json',
  );
  assert.equal(args.directory, undefined);
});

void test('LastRound CSV maps vendor and slug and skips other ATS', async () => {
  const boards = parseSource({
    format: 'lastround',
    text: await read('lastround.csv'),
  });
  assert.equal(boards.length, 22);
  assert.equal(
    boards.find((row) => row.board === 'fir').company,
    'Fir, Systems',
  );
  assert.equal(
    boards.every((row) =>
      ['greenhouse', 'lever', 'ashby'].includes(row.provider),
    ),
    true,
  );
  assert.equal(
    boards.every((row) => row.source === 'lastround'),
    true,
  );
});

void test('ats-jobs-mcp, intern-engine, and africa parsers keep only public GH/Lever/Ashby tokens', async () => {
  const mcp = parseSource({
    format: 'ats-jobs-mcp',
    text: await read('ats-jobs-mcp.json'),
  });
  assert.deepEqual(
    mcp.map((row) => `${row.provider}:${row.board}`).sort(),
    ['ashby:quartz', 'greenhouse:northstar', 'lever:harbor'],
  );
  const intern = parseSource({
    format: 'intern-engine',
    text: await read('intern-engine.json'),
  });
  assert.deepEqual(
    intern.map((row) => `${row.provider}:${row.board}`).sort(),
    ['greenhouse:northstar', 'lever:harbor'],
  );
  const africa = parseSource({
    format: 'africa',
    text: await read('africa.json'),
  });
  assert.equal(africa.length, 2);
  assert.equal(africa[0].board, 'northstar');
});

void test('Common Crawl CDX lines yield slugs and drop robots and junk tokens', async () => {
  const boards = parseSource({
    format: 'cdx',
    text: await read('cdx.jsonl'),
  });
  assert.deepEqual(
    boards
      .map((row) => `${row.provider}:${row.board}`)
      .sort((a, b) => a.localeCompare(b)),
    ['ashby:acme', 'greenhouse:exampleco', 'greenhouse:northstar'],
  );
});

void test('Feashliaa lists are refused because they are CC BY-NC', () => {
  assert.throws(
    () => parseSource({ format: 'feashliaa', text: '[]' }),
    /CC BY-NC/,
  );
});

void test('YC hiring files must be local; ycombinator.com URLs are refused', () => {
  assert.throws(
    () =>
      parseSource({
        format: 'yc-hiring',
        path: 'https://www.ycombinator.com/companies',
        text: '[]',
      }),
    /ycombinator.com/,
  );
  assert.throws(
    () =>
      parseSource({
        format: 'yc-hiring',
        path: 'hiring.json',
        text: '[]',
      }),
    /scout corpus/,
  );
});

void test('union keeps the first (provider, board) and records every source', () => {
  const union = unionBoards([
    {
      provider: 'greenhouse',
      board: 'northstar',
      company: 'Northstar',
      source: 'lastround',
    },
    {
      provider: 'greenhouse',
      board: 'northstar',
      company: 'Northstar Duplicate',
      source: 'ats-jobs-mcp',
    },
    {
      provider: 'lever',
      board: 'harbor',
      company: 'Harbor Labs',
      source: 'intern-engine',
    },
  ]);
  assert.equal(union.length, 2);
  const north = union.find((row) => row.board === 'northstar');
  assert.equal(north.company, 'Northstar');
  assert.deepEqual(north.sources, ['lastround', 'ats-jobs-mcp']);
});

void test('samples larger snapshots by provider share instead of taking the CSV prefix', () => {
  const boards = [];
  for (let i = 0; i < 12; i++)
    boards.push({
      provider: 'greenhouse',
      board: `g${i}`,
      company: `G${i}`,
    });
  for (let i = 0; i < 6; i++)
    boards.push({
      provider: 'ashby',
      board: `a${i}`,
      company: `A${i}`,
    });
  for (let i = 0; i < 4; i++)
    boards.push({
      provider: 'lever',
      board: `l${i}`,
      company: `L${i}`,
    });
  const sampled = sampleBoards(boards, { limit: 10, seed: 105 });
  const counts = Object.fromEntries(
    ['greenhouse', 'ashby', 'lever'].map((provider) => [
      provider,
      sampled.filter((row) => row.provider === provider).length,
    ]),
  );
  assert.deepEqual(counts, { greenhouse: 5, ashby: 3, lever: 2 });
  assert.equal(
    sampled.every((row) => row.provider === 'greenhouse'),
    false,
  );
  const again = sampleBoards(boards, { limit: 10, seed: 105 });
  assert.deepEqual(
    again.map((row) => `${row.provider}:${row.board}`),
    sampled.map((row) => `${row.provider}:${row.board}`),
  );
});

void test('HN scout takes ATS URLs and skips LinkedIn and Indeed', async () => {
  const candidates = scoutCandidates({
    format: 'hn-algolia',
    text: await read('hn-algolia.json'),
  });
  assert.equal(
    candidates.some((row) => row.board === 'northstar'),
    true,
  );
  assert.equal(
    candidates.some((row) => row.board === 'harbor'),
    true,
  );
  assert.equal(
    candidates.some((row) => blockedJobHost(row.url || '')),
    false,
  );
  assert.equal(
    candidates.some((row) => /linkedin|indeed/i.test(JSON.stringify(row))),
    false,
  );
  const acme = candidates.find((row) => /acme/i.test(row.company));
  assert.ok(acme);
  assert.equal(acme.needs_probe, true);
});

void test('name and website yield slug guesses without fetching HTML', () => {
  const guessed = candidatesFromNameWebsite('Harbor Labs', 'https://www.harbor.example');
  assert.ok(guessed.includes('harbor'));
  assert.ok(guessed.includes('harborlabs'));
});

void test('ATS URL extraction reads Greenhouse, Lever, and Ashby hosts', () => {
  assert.deepEqual(
    extractAtsFromUrl('https://boards.greenhouse.io/northstar/jobs/1'),
    { provider: 'greenhouse', board: 'northstar' },
  );
  assert.deepEqual(
    extractAtsFromUrl('https://jobs.lever.co/harbor'),
    { provider: 'lever', board: 'harbor' },
  );
  assert.deepEqual(
    extractAtsFromUrl('https://jobs.ashbyhq.com/acme/infra-1'),
    { provider: 'ashby', board: 'acme' },
  );
  assert.deepEqual(
    extractAtsFromUrl(
      'https://job-boards.greenhouse.io/embed/job_board?for=exampleco',
    ),
    { provider: 'greenhouse', board: 'exampleco' },
  );
  assert.equal(
    extractAtsFromUrl('https://www.linkedin.com/jobs/view/1'),
    null,
  );
});

void test('catalog union samples LastRound and attributes it', async () => {
  const catalog = JSON.parse(await read('catalog.json'));
  const built = await buildCatalog({
    catalog,
    catalogDir: fileURLToPath(CAT),
    spec: spec(),
    fetchImpl: fixtureFetch(),
    now: NOW,
  });
  assert.equal(built.boards.length, 8);
  assert.equal(built.boards.length <= spec().caps.max_boards, true);
  assert.ok(built.sources.some((row) => row.format === 'lastround' && row.rows === 22));
  assert.ok(built.attribution.includes(LASTROUND_ATTRIBUTION));
  assert.equal(
    built.boards.some((row) => row.provider === 'ashby'),
    true,
  );
  assert.equal(
    built.boards.some((row) => row.provider === 'lever'),
    true,
  );
  assert.equal(
    JSON.stringify(built.summary).includes('northstar'),
    false,
  );
});

void test('concurrent fetch starts are spaced by min_interval_ms', async () => {
  let now = 1_000;
  const clock = {
    now: () => now,
    async delay(ms) {
      now += ms;
    },
  };
  const gate = startGate(clock, 250);
  const starts = [];
  await fetchDirectory({
    directory: [
      { provider: 'greenhouse', board: 'northstar', company: 'Northstar' },
      { provider: 'greenhouse', board: 'exampleco', company: 'ExampleCo' },
      { provider: 'lever', board: 'harbor', company: 'Harbor Labs' },
    ],
    known: { companies: [], boards: [] },
    spec: spec({
      caps: {
        max_boards: 8,
        max_admitted: 200,
        concurrency: 3,
        request_timeout_ms: 5000,
        min_interval_ms: 250,
      },
    }),
    arm: 'treatment',
    clock,
    reserveStart: async () => {
      starts.push(await gate());
    },
    fetchImpl: fixtureFetch(),
    now: NOW,
  });
  assert.equal(starts.length, 3);
  const ordered = [...starts].sort((a, b) => a - b);
  assert.ok(
    ordered[1] - ordered[0] >= 250,
    `starts ${ordered.join(',')} should be spaced by 250ms`,
  );
  assert.ok(
    ordered[2] - ordered[1] >= 250,
    `starts ${ordered.join(',')} should be spaced by 250ms`,
  );
});

const REPO = fileURLToPath(new URL('..', import.meta.url));

function runHarness(args) {
  const child = spawn(
    process.execPath,
    ['scripts/experiments/pre-agent-admit/run.mjs', ...args],
    { cwd: REPO },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve) => {
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

void test('fixture --catalog writes counts, attribution, and a used directory', async () => {
  const out = await mkdtemp(join(tmpdir(), 'pre-agent-catalog-'));
  const result = await runHarness([
    '--fixtures',
    '--catalog',
    'scripts/experiments/pre-agent-admit/fixtures/catalog/catalog.json',
    '--out',
    out,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(join(out, 'compare.json'), 'utf8'));
  const used = JSON.parse(await readFile(join(out, 'directory.used.json'), 'utf8'));
  const text = JSON.stringify(report);
  assert.equal(report.catalog.selected, 8);
  assert.equal(report.catalog.attribution, LASTROUND_ATTRIBUTION);
  assert.equal(text.includes('northstar'), false);
  assert.equal(Array.isArray(report.fetch?.boards), false);
  assert.equal(used.boards.length, 8);
  assert.equal(
    used.boards.every((row) =>
      ['greenhouse', 'lever', 'ashby'].includes(row.provider),
    ),
    true,
  );
});

void test('--live without catalog or directory is refused', async () => {
  const result = await runHarness(['--live']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--directory or --catalog/);
});

void test('--live refuses the committed fixture catalog', async () => {
  const result = await runHarness([
    '--live',
    '--catalog',
    'scripts/experiments/pre-agent-admit/fixtures/catalog/catalog.json',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fixture catalog/);
});

void test('--live refuses catalog plus directory together', async () => {
  const result = await runHarness([
    '--live',
    '--catalog',
    'private-data/experiments/pre-agent-admit/catalog.json',
    '--directory',
    'private-data/experiments/pre-agent-admit/directory.json',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not both/);
});
