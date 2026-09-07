import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRows } from '../lib/domain.ts';
import {
  admitControlKnown,
  admitControlQuery,
  admitTreatment,
} from '../scripts/experiments/pre-agent-admit/arms.mjs';
import { suggestDecision } from '../scripts/experiments/pre-agent-admit/compare.mjs';
import { fetchDirectory } from '../scripts/experiments/pre-agent-admit/fetch.mjs';
import { fixtureFetch } from '../scripts/experiments/pre-agent-admit/fixtures.mjs';
import {
  loadDirectory,
  loadKnown,
  loadLabels,
  loadSpec,
  readJson,
} from '../scripts/experiments/pre-agent-admit/load.mjs';
import { isFixturePath, parseArgs, runCompare } from '../scripts/experiments/pre-agent-admit/run.mjs';
import { fromAshby } from '../scripts/experiments/pre-agent-admit/sources.mjs';

const FIX = new URL(
  '../scripts/experiments/pre-agent-admit/fixtures/',
  import.meta.url,
);
const NOW = Date.parse('2026-09-07T12:00:00.000Z');

async function fixtureInputs() {
  return {
    spec: loadSpec(await readJson(fileURLToPath(new URL('spec.json', FIX)))),
    directory: loadDirectory(
      await readJson(fileURLToPath(new URL('directory.json', FIX))),
    ),
    known: loadKnown(await readJson(fileURLToPath(new URL('known.json', FIX)))),
    labels: loadLabels(
      await readJson(fileURLToPath(new URL('labels.json', FIX))),
    ),
  };
}

void test('a spec without title or query terms is refused', () => {
  assert.throws(
    () => loadSpec({ levels: ['senior'] }),
    /title_any or queries/,
  );
});

void test('Ashby skips unlisted jobs and trusts workplaceType over isRemote', () => {
  const rows = fromAshby(
    {
      jobs: [
        {
          title: 'Senior Infrastructure Engineer',
          location: 'US',
          isListed: false,
          workplaceType: 'Remote',
          jobUrl: 'https://jobs.ashbyhq.com/acme/hidden',
        },
        {
          title: 'Senior Infrastructure Engineer',
          location: 'US',
          isListed: true,
          isRemote: true,
          workplaceType: 'OnSite',
          descriptionPlain: 'Office.',
          jobUrl: 'https://jobs.ashbyhq.com/acme/onsite',
        },
        {
          title: 'Senior Infrastructure Engineer',
          location: 'US',
          isListed: true,
          workplaceType: 'Remote',
          descriptionPlain: 'Remote runtime.',
          jobUrl: 'https://jobs.ashbyhq.com/acme/remote',
        },
      ],
    },
    'acme',
    'Acme Labs',
  );
  assert.equal(rows.length, 2);
  assert.equal(
    rows.find((row) => row.Job.endsWith('/onsite')).remote,
    'onsite',
  );
  assert.equal(
    rows.find((row) => row.Job.endsWith('/remote')).remote,
    'remote',
  );
});

void test('control_known fetches only seeker-known boards', async () => {
  const { spec, directory, known } = await fixtureInputs();
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    return fixtureFetch()(url, options);
  };
  const fetched = await fetchDirectory({
    directory,
    known,
    spec,
    arm: 'control_known',
    fetchImpl,
    now: NOW,
  });
  assert.equal(fetched.boards_fetched, 1);
  assert.ok(urls.every((url) => url.includes('/northstar/')));
  assert.equal(fetched.postings.length, 3);
});

void test('a failed board is recorded and does not abort the run', async () => {
  const { spec, known } = await fixtureInputs();
  const fetchImpl = async (url, options) => {
    if (url.includes('missingco'))
      return new Response('gone', { status: 404 });
    return fixtureFetch()(url, options);
  };
  const fetched = await fetchDirectory({
    directory: [
      {
        provider: 'greenhouse',
        board: 'northstar',
        company: 'Northstar',
      },
      {
        provider: 'greenhouse',
        board: 'missingco',
        company: 'MissingCo',
      },
    ],
    known,
    spec,
    arm: 'treatment',
    fetchImpl,
    now: NOW,
  });
  assert.equal(fetched.failures, 1);
  assert.equal(fetched.boards.find((board) => board.board === 'missingco').ok, false);
  assert.ok(fetched.postings.length > 0);
});

void test('treatment admits unknown-company roles that known-board and query arms miss', async () => {
  const { spec, directory, known, labels } = await fixtureInputs();
  const compared = await runCompare({
    spec,
    directory,
    known,
    labels,
    fetchImpl: fixtureFetch(),
    now: NOW,
  });
  assert.equal(compared.arms.control_known.admitted, 1);
  assert.equal(compared.arms.control_query.admitted, 1);
  assert.equal(compared.arms.treatment.admitted, 5);
  assert.equal(compared.deltas.treatment_minus_control_known.admitted, 4);
  assert.equal(compared.arms.treatment.relevant, 5);
  assert.equal(compared.arms.treatment.precision, 1);
  assert.equal(compared.arms.treatment.unknown_company_among_relevant, 4);
  assert.equal(compared.decision.verdict, 'continue');
  const treatmentJobs = compared.rows.treatment
    .map((row) => row.Job)
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(treatmentJobs, [
    'https://boards.greenhouse.io/exampleco/jobs/5101',
    'https://boards.greenhouse.io/exampleco/jobs/5103',
    'https://boards.greenhouse.io/northstar/jobs/4001',
    'https://jobs.ashbyhq.com/acme/infra-1',
    'https://jobs.lever.co/harbor/senior-backend',
  ]);
  assert.equal(compared.rows.control_known[0].Job.includes('northstar'), true);
  assert.equal(
    compared.rows.control_query[0].Job,
    'https://jobs.lever.co/harbor/senior-backend',
  );
  validateRows(compared.rows.treatment);
});

void test('query-shaped control caps recall even when the posting matches the spec', async () => {
  const { spec, directory, known } = await fixtureInputs();
  const fetched = await fetchDirectory({
    directory,
    known,
    spec,
    arm: 'treatment',
    fetchImpl: fixtureFetch(),
    now: NOW,
  });
  const query = admitControlQuery(fetched.postings, spec, NOW);
  const treatment = admitTreatment(fetched.postings, spec, NOW);
  assert.equal(query.kept.length, 1);
  assert.ok(treatment.kept.length > query.kept.length);
});

void test('empty known list makes the current-product arm admit nothing', async () => {
  const { spec, directory } = await fixtureInputs();
  const fetched = await fetchDirectory({
    directory,
    known: { companies: [], boards: [] },
    spec,
    arm: 'treatment',
    fetchImpl: fixtureFetch(),
    now: NOW,
  });
  const known = admitControlKnown(
    fetched.postings,
    spec,
    { companies: [], boards: [] },
    NOW,
  );
  assert.equal(known.kept.length, 0);
});

void test('decision stays unset until human labels exist', () => {
  const decision = suggestDecision({ relevant: null, precision: null }, null);
  assert.equal(decision.verdict, null);
});

void test('--live refuses the committed fixture directory', () => {
  assert.equal(
    isFixturePath(fileURLToPath(new URL('../scripts/experiments/pre-agent-admit/fixtures/directory.json', import.meta.url))),
    true,
  );
  const args = parseArgs(['node', 'run.mjs', '--live']);
  assert.equal(args.live, true);
  assert.equal(args.directory, undefined);
});

void test('fixture CLI writes count-only compare and importable treatment rows', async () => {
  const out = await mkdtemp(join(tmpdir(), 'pre-agent-admit-'));
  const child = spawn(
    process.execPath,
    [
      'scripts/experiments/pre-agent-admit/run.mjs',
      '--fixtures',
      '--out',
      out,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)) },
  );
  const status = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(status, 0);
  const report = JSON.parse(await readFile(join(out, 'compare.json'), 'utf8'));
  assert.equal(report.schema, 'relay.pre-agent-admit.compare.v1');
  assert.equal(report.writing_agent, 'asleep');
  assert.equal(report.rows, undefined);
  assert.equal(JSON.stringify(report).includes('northstar'), false);
  assert.equal(Array.isArray(report.fetch?.boards), false);
  const imported = JSON.parse(
    await readFile(join(out, 'treatment.relay-import.json'), 'utf8'),
  );
  assert.equal(validateRows(imported).length, 5);
  assert.ok(imported.every((row) => row.Status === 'Held'));
});
