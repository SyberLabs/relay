import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const workflow = name => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
const release = workflow('release-environment').jobs.release;
const sha = 'a'.repeat(40);
const sourceRun = 123;
const repo = { owner: 'SyberLabs', repo: 'relay' };

// Execute the actual pre-publication Actions script with a read-only GitHub fixture.
// Unexpected API calls fail, so refused candidates cannot perform downstream work.
async function verify({ target = 'production', rollback = false, main = sha, inputSha = sha,
  ci = {}, deployments = [{ id: 10, payload: { release_sha: sha, source_ci_run: sourceRun } }],
  statuses = [{ state: 'success' }], unavailable = false } = {}) {
  const calls = [];
  const github = { rest: {
    actions: { getWorkflowRun: async params => {
      assert.deepEqual(params, { ...repo, run_id: sourceRun });
      calls.push('ci');
      return { data: { head_sha: sha, head_branch: 'main', event: 'push', conclusion: 'success',
        path: '.github/workflows/ci.yml', head_repository: { full_name: 'SyberLabs/relay' }, ...ci } };
    } },
    repos: {
      getBranch: async params => {
        assert.deepEqual(params, { ...repo, branch: 'main' });
        calls.push('main');
        return { data: { commit: { sha: main } } };
      },
      listDeployments: Symbol('listDeployments'),
      listDeploymentStatuses: async params => {
        assert.equal(params.deployment_id, 10);
        calls.push('statuses');
        if (unavailable) throw new Error('GitHub unavailable');
        return { data: statuses };
      },
    },
  }, paginate: async (method, params) => {
    assert.equal(method, github.rest.repos.listDeployments);
    assert.deepEqual(params, { ...repo, sha, environment: rollback ? 'production' : 'staging',
      task: 'relay-release', per_page: 100 });
    calls.push(params.environment);
    return deployments;
  } };
  const script = release.steps[0].with.script;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('github', 'context', 'process', script)(github, { repo }, { env: {
    RELEASE_SHA: inputSha, SOURCE_RUN: String(sourceRun), TARGET_ENVIRONMENT: target, ROLLBACK: String(rollback),
  } });
  return calls;
}

void test('automatic staging finishes without scheduling a production approval', () => {
  const deploy = workflow('deploy');
  assert.deepEqual(Object.keys(deploy.jobs), ['staging']);
  assert.equal(deploy.concurrency, undefined);
  assert.equal(deploy.jobs.staging.with.environment, 'staging');
  assert.equal(deploy.jobs.staging.uses, './.github/workflows/release-environment.yml');
  assert.equal(deploy.jobs.staging.with.run_id, '${{ github.event.workflow_run.id }}');
  assert.equal(deploy.jobs.staging.with.release_sha, '${{ github.event.workflow_run.head_sha }}');
});

void test('promotion is explicit, main-only, and keeps production approval and the rollback lock', () => {
  const promote = workflow('promote');
  const rollback = workflow('rollback');
  assert.deepEqual(Object.keys(promote.on), ['workflow_dispatch']);
  for (const [flow, job] of [[promote, 'production'], [rollback, 'rollback']]) {
    assert.equal(flow.concurrency, undefined);
    assert.equal(flow.jobs[job].if, "github.ref == 'refs/heads/main'");
    assert.equal(flow.jobs[job].uses, './.github/workflows/release-environment.yml');
    assert.equal(flow.jobs[job].with.environment, 'production');
    assert.equal(flow.jobs[job].with.release_sha, '${{ inputs.release_sha }}');
    assert.equal(flow.jobs[job].with.run_id, '${{ inputs.run_id }}');
  }
  assert.equal(rollback.jobs.rollback.with.rollback, true);
  assert.equal(promote.jobs.production.with.rollback, undefined);
  assert.equal(release.environment.name, '${{ inputs.environment }}');
  assert.equal(release.concurrency.group, 'relay-release-${{ inputs.environment }}');
  assert.equal(release.concurrency['cancel-in-progress'], false);
  assert.notEqual(release.concurrency.group.replace('${{ inputs.environment }}', 'staging'),
    release.concurrency.group.replace('${{ inputs.environment }}', 'production'));
  assert.equal(release.steps[0].env.TARGET_ENVIRONMENT, '${{ inputs.environment }}');
  assert.equal(release.steps[0].env.ROLLBACK, '${{ inputs.rollback }}');
  const checkout = release.steps.findIndex(step => step.uses?.startsWith('actions/checkout@'));
  const migration = release.steps.findIndex(step => step.name === 'Apply forward migrations');
  const publish = release.steps.findIndex(step => step.name === 'Publish verified application');
  assert.ok(checkout > 0 && migration > checkout && publish > migration);
  assert.equal(release.steps[migration].if, '!inputs.rollback');
  assert.equal(release.steps.find(step => step.name === 'Refuse rollback across database schema changes').if, 'inputs.rollback');
});

void test('current-main staging needs CI provenance but no earlier deployment', async () => {
  assert.deepEqual(await verify({ target: 'staging', deployments: [] }), ['ci', 'main']);
});

void test('promotion requires matching successful staging evidence, including after automatic inactive', async () => {
  assert.deepEqual(await verify(), ['ci', 'main', 'staging', 'statuses']);
  assert.deepEqual(await verify({ statuses: [{ state: 'inactive' }, { state: 'success' }],
    deployments: [{ id: 10, payload: JSON.stringify({ release_sha: sha, source_ci_run: sourceRun }) }],
  }), ['ci', 'main', 'staging', 'statuses']);
});

void test('absent, wrong-artifact, failed, or unreadable staging evidence refuses promotion', async () => {
  for (const options of [
    { deployments: [] },
    { deployments: [{ id: 10, payload: { release_sha: 'b'.repeat(40), source_ci_run: sourceRun } }] },
    { deployments: [{ id: 10, payload: { release_sha: sha, source_ci_run: sourceRun + 1 } }] },
    { deployments: [{ id: 10, payload: {} }] },
    { statuses: [] }, { statuses: [{ state: 'failure' }] }, { statuses: [{ state: 'inactive' }] },
  ]) await assert.rejects(verify(options), /no matching successful staging deployment/);
  await assert.rejects(verify({ unavailable: true }), /GitHub unavailable/);
  await assert.rejects(verify({ deployments: [{ id: 10, payload: 'invalid json' }] }), SyntaxError);
});

void test('stale or untrusted candidates fail even with staging success', async () => {
  await assert.rejects(verify({ main: 'b'.repeat(40) }), /refusing stale release/);
  for (const ci of [
    { head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { event: 'pull_request' },
    { event: 'workflow_dispatch' }, { conclusion: 'failure' }, { path: '.github/workflows/other.yml' },
    { head_repository: { full_name: 'other/relay' } },
  ]) await assert.rejects(verify({ ci }), /successful CI on this repository main/);
  await assert.rejects(verify({ inputSha: 'not-a-sha' }), /Invalid release inputs/);
  await assert.rejects(verify({ target: 'preview' }), /Invalid release inputs/);
});

void test('rollback still requires production success and permits an older main SHA', async () => {
  assert.deepEqual(await verify({ rollback: true, main: 'b'.repeat(40) }), ['ci', 'production', 'statuses']);
  await assert.rejects(verify({ rollback: true, deployments: [] }), /successful production deployment/);
});
