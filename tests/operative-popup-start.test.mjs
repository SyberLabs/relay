import test from 'node:test';
import assert from 'node:assert/strict';
import { admitStartClick } from '../extensions/operative/popup-start.js';

void test('Start admits HTTPS origins without a selected job', () => {
  const admitted = admitStartClick({
    relayTabId: 7,
    fixtureTabId: 9,
    value: 'Avery Example',
    relayUrl: 'https://relay-production.example.workers.dev/',
    fixtureUrl: 'https://employer.example/jobs/operative',
  });
  assert.equal(admitted.ok, true);
  assert.deepEqual(admitted.origins, [
    'https://relay-production.example.workers.dev/*',
    'https://employer.example/*',
  ]);
});

void test('Start still requires Relay, fixture, and a complete name', () => {
  const missingName = admitStartClick({
    relayTabId: 7,
    fixtureTabId: 9,
    value: '',
    relayUrl: 'https://relay-production.example.workers.dev/',
    fixtureUrl: 'https://employer.example/jobs/operative',
  });
  assert.equal(missingName.ok, false);
  assert.match(missingName.message, /complete Full name/);
});
