import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const leaves = [
  'quality',
  'integration',
  'dependencies',
  'templates',
  'security',
];

function loadYaml(path) {
  return parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function assertParallelGates(workflow) {
  for (const name of leaves) {
    assert.ok(workflow.jobs[name], name);
    assert.equal(workflow.jobs[name].needs, undefined, `${name} must not wait on another CI job`);
  }
  const required = workflow.jobs.required;
  assert.equal(required.name, 'CI');
  assert.equal(required.if, 'always()');
  assert.deepEqual(required.needs, leaves);
  assert.equal(workflow.jobs.integration.strategy['fail-fast'], false);
  assert.deepEqual(workflow.jobs.integration.strategy.matrix.suite, [
    'api',
    'browser',
    'production',
  ]);
  const browserInstall = workflow.jobs.integration.steps.find((step) =>
    String(step.run || '').includes('playwright install'),
  );
  assert.equal(
    browserInstall.run,
    'pnpm exec playwright install --with-deps chromium',
  );
  assert.equal(browserInstall.if, "matrix.suite == 'browser'");
  const artifact = workflow.jobs.quality.steps.find((step) =>
    String(step.uses || '').includes('upload-artifact'),
  );
  assert.equal(artifact.with.name, 'relay-release-${{ github.sha }}');
  assert.equal(workflow.jobs.security.uses, './.github/workflows/security.yml');
  assert.match(
    String(workflow.concurrency['cancel-in-progress']),
    /refs\/heads\/main/,
  );
}

const ci = loadYaml('../.github/workflows/ci.yml');
const security = loadYaml('../.github/workflows/security.yml');
const ruleset = JSON.parse(
  readFileSync(new URL('../.github/main-ruleset.json', import.meta.url), 'utf8'),
);
const playwright = readFileSync(
  new URL('../playwright.config.ts', import.meta.url),
  'utf8',
);

void test('required CI jobs stay parallel so wall-clock is the longest gate not the sum', () => {
  assertParallelGates(ci);
});

void test('waiting on the release artifact would serialize the critical path', () => {
  const broken = structuredClone(ci);
  broken.jobs.integration.needs = 'quality';
  assert.throws(() => assertParallelGates(broken), /integration/);
});

void test('CodeQL keeps build-mode none and the blocking security-extended suite', () => {
  const init = security.jobs.codeql.steps.find((step) =>
    String(step.uses || '').includes('codeql-action/init'),
  );
  assert.equal(init.with.languages, 'javascript-typescript');
  assert.equal(init.with['build-mode'], 'none');
  assert.equal(init.with.queries, 'security-extended');
});

void test('browser journeys stay first-run deterministic and the merge gate stays named CI', () => {
  assert.match(playwright, /\bretries:\s*0\b/);
  const checks = ruleset.rules.find((rule) => rule.type === 'required_status_checks')
    .parameters.required_status_checks;
  assert.deepEqual(
    checks.map((check) => check.context),
    ['CI'],
  );
});
