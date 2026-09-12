import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPERATIVE_SPEC,
  browserPlaywrightPlan,
} from '../scripts/ci/browser-playwright-plan.mjs';

void test('playwright config does not run the operative spec first on the shared D1', () => {
  const source = readFileSync('playwright.config.ts', 'utf8');
  assert.equal(
    /name:\s*'operative'/.test(source),
    false,
    'project order cannot steal the last daily start from later Inspect specs',
  );
  assert.equal(
    /dependencies:\s*\[\s*'operative'/.test(source),
    false,
    'operative-first Playwright projects leave jobs on the shared D1',
  );
  assert.match(source, /RELAY_E2E_SKIP_OPERATIVE/);
});

void test('the full browser suite isolates the operative spec on its own persist dir', () => {
  assert.equal(OPERATIVE_SPEC, 'tests/e2e/operative-extension.spec.ts');
  assert.deepEqual(
    browserPlaywrightPlan({
      extraArgs: [],
      operativeState: 'ci-operative',
      mainState: 'ci-main',
    }),
    [
      {
        persistTo: 'ci-operative',
        args: [OPERATIVE_SPEC],
        skipOperative: false,
      },
      {
        persistTo: 'ci-main',
        args: [],
        skipOperative: true,
      },
    ],
  );
});

void test('targeted playwright args keep a single persist dir', () => {
  assert.deepEqual(
    browserPlaywrightPlan({
      extraArgs: [OPERATIVE_SPEC],
      operativeState: 'ci-operative',
      mainState: 'ci-main',
    }),
    [
      {
        persistTo: 'ci-main',
        args: [OPERATIVE_SPEC],
        skipOperative: false,
      },
    ],
  );
});

void test('the browser integration runner applies the isolated persist plan', () => {
  const source = readFileSync('scripts/ci/run-integration.mjs', 'utf8');
  assert.match(source, /browserPlaywrightPlan/);
  assert.match(source, /RELAY_E2E_SKIP_OPERATIVE/);
});
