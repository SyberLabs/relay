import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  fixtureRequest,
  parseSuggestion,
  runFixture,
} from '../scripts/experiments/jev-blocker-fixture.mjs';

const upstream = (choice = 'human_answer') => ({
  provider: 'TypeSafe',
  model: 'typesafe/jev-1.13-20260917',
  answers: {
    blocker_next_step: { type: 'choice', choice, confidence: 0.9 },
  },
});

void test('request is a fixed fictional typed choice, with no participant input', () => {
  const request = fixtureRequest();
  assert.equal(request.model, 'typesafe/jev-1.13');
  assert.equal(request.state, fixture);
  assert.deepEqual(Object.keys(request.questions), ['blocker_next_step']);
  assert.equal(request.questions.blocker_next_step.type, 'choice');
  assert.deepEqual(Object.keys(request.questions.blocker_next_step.criteria), [
    'delegate',
    'human_answer',
    'hold',
  ]);
});

void test('missing key refuses before any upstream call', async () => {
  let calls = 0;
  await assert.rejects(
    runFixture('', () => {
      calls++;
    }),
    /OPENROUTER_API_KEY is required/,
  );
  assert.equal(calls, 0);
});

void test('one request sends only the fixture and returns an advisory suggestion', async () => {
  let calls = 0;
  const result = await runFixture('test-key', async (url, options) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), fixtureRequest());
    return { ok: true, json: async () => upstream() };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    status: 'suggestion_only',
    suggested_next_step: 'human_answer',
    confidence: 0.9,
    model: 'typesafe/jev-1.13-20260917',
    requires_human_acceptance: true,
  });
});

void test('unknown or malformed decisions cannot become a suggestion', () => {
  assert.throws(
    () => parseSuggestion(upstream('submit')),
    /invalid typed decision/,
  );
  assert.throws(
    () => parseSuggestion({ ...upstream(), provider: 'Other' }),
    /invalid typed decision/,
  );
  assert.throws(
    () =>
      parseSuggestion({
        ...upstream(),
        answers: { blocker_next_step: { type: 'choice', choice: 'delegate' } },
      }),
    /invalid confidence/,
  );
  assert.throws(
    () =>
      parseSuggestion({
        ...upstream(),
        answers: {
          blocker_next_step: {
            type: 'choice',
            choice: 'delegate',
            confidence: Number.NaN,
          },
        },
      }),
    /invalid confidence/,
  );
});

void test('upstream refusal stays a refusal', async () => {
  await assert.rejects(
    runFixture('test-key', async () => ({ ok: false })),
    /Jev request failed/,
  );
});
