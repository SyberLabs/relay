import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProductionResponse,
  formatHttpFailure,
} from '../scripts/ci/production-diagnostics.mjs';

void test('production failures distinguish runtime 503 from application JSON', () => {
  assert.equal(classifyProductionResponse(503, 'error code: 503'), 'runtime-503');
  assert.equal(
    classifyProductionResponse(503, '{"error":"Access configuration failed."}'),
    'application-503',
  );
  assert.equal(classifyProductionResponse(200, '{"ok":true}'), 'application');
});

void test('failure text includes status, body, and log tail without credentials', () => {
  const message = formatHttpFailure({
    label: 'owner-A save',
    expected: 200,
    status: 503,
    body: 'error code: 503',
    logTail: 'workerd restart\nCf-Access-Jwt-Assertion: super-secret-token\n',
  });
  assert.match(message, /owner-A save/);
  assert.match(message, /503/);
  assert.match(message, /runtime-503/);
  assert.match(message, /error code: 503/);
  assert.match(message, /workerd restart/);
  assert.doesNotMatch(message, /super-secret-token/);
});
