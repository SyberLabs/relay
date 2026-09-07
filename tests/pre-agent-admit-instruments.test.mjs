import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDirectory } from '../scripts/experiments/pre-agent-admit/fetch.mjs';
import { loadCaps, loadSpec, boardKey } from '../scripts/experiments/pre-agent-admit/load.mjs';
import { fixtureFetch } from '../scripts/experiments/pre-agent-admit/fixtures.mjs';
import {
  internTitleMatch,
  lexicalCosine,
  scoreCorpus,
} from '../scripts/experiments/pre-agent-admit/instruments.mjs';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');

void test('intern regex keeps software internships and rejects internal/hardware/senior SWE', () => {
  assert.equal(
    internTitleMatch('Northstar — Software Engineer Intern Summer 2027').ok,
    true,
  );
  assert.equal(
    internTitleMatch('Harbor Labs — New Grad Software Engineer').ok,
    true,
  );
  assert.equal(internTitleMatch('Acme Labs — SWE I').ok, true);
  assert.equal(
    internTitleMatch('ExampleCo — Software Engineer - Internal Tools').ok,
    false,
  );
  assert.equal(
    internTitleMatch('Northstar — Hardware Engineer Internship').ok,
    false,
  );
  assert.equal(
    internTitleMatch('Harbor Labs — Senior Software Engineer').ok,
    false,
  );
});

void test('lexical cosine ranks intern SWE over unrelated senior data engineering', () => {
  const packet =
    'software engineer intern internship new grad early career junior swe university campus';
  const intern = lexicalCosine(
    'Software Engineer Intern Summer 2027 remote United States',
    packet,
  );
  const senior = lexicalCosine(
    'Senior Software Engineer Data Engineering Manhattan',
    packet,
  );
  assert.ok(intern > senior);
  assert.ok(intern > 0);
});

void test('corpus scoring reports regex then lexical counts without embedding', () => {
  const packet =
    'software engineer intern internship new grad early career junior swe';
  const report = scoreCorpus(
    [
      posting('Acme — Software Engineer Intern', 'Acme', 'https://jobs.ashbyhq.com/acme/intern'),
      posting(
        'Northstar — Hardware Engineer Internship',
        'Northstar',
        'https://boards.greenhouse.io/northstar/jobs/1',
      ),
      posting(
        'Harbor — Senior Software Engineer',
        'Harbor',
        'https://jobs.lever.co/harbor/senior',
      ),
    ],
    {
      known: { companies: ['Acme'], boards: [] },
      packet,
      min_cosine: 0.08,
    },
  );
  assert.equal(report.corpus, 3);
  assert.equal(report.regex.matched, 1);
  assert.equal(report.regex.unknown_company, 0);
  assert.equal(report.lexical.matched, 1);
  assert.equal(report.embedder, 'none');
  assert.equal(report.llm, 'asleep');
});

void test('a local full-directory cap can cover the LastRound snapshot', () => {
  const caps = loadCaps({ max_boards: 12_000, max_admitted: 200 });
  assert.equal(caps.max_boards, 12_000);
  assert.throws(
    () => loadCaps({ max_boards: 20_001 }),
    /max_boards must be an integer from 1 to 20000/,
  );
  assert.equal(loadSpec({ title_any: ['intern'], caps: { max_boards: 40 } }).caps.max_boards, 40);
});

void test('fetchDirectory resumes by skipping boards already in the corpus', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    return fixtureFetch()(url, options);
  };
  const directory = [
    {
      provider: 'greenhouse',
      board: 'northstar',
      company: 'Northstar',
    },
    {
      provider: 'lever',
      board: 'harbor',
      company: 'Harbor Labs',
    },
  ];
  const spec = loadSpec({
    title_any: ['backend', 'intern', 'software'],
    queries: ['intern'],
    levels: ['junior', 'mid', 'senior'],
    caps: { max_boards: 8, min_interval_ms: 1, concurrency: 1 },
  });
  const skip = new Set([boardKey(directory[0])]);
  const fetched = await fetchDirectory({
    directory,
    known: { companies: [], boards: [] },
    spec,
    arm: 'treatment',
    fetchImpl,
    now: NOW,
    skip,
  });
  assert.equal(fetched.boards_fetched, 1);
  assert.equal(fetched.skipped, 1);
  assert.ok(urls.every((url) => url.includes('harbor')));
  assert.equal(urls.some((url) => url.includes('northstar')), false);
});

function posting(Name, company, url) {
  return {
    row: {
      Name,
      company,
      url,
      Job: url,
      location: 'United States',
      remote: '',
      level: 'junior',
      posted: '2026-09-01T00:00:00.000Z',
      source: 'greenhouse',
    },
    company,
    board: 'board',
    provider: 'greenhouse',
  };
}
