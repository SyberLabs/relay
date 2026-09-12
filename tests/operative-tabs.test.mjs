import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isFixtureUrl,
  isInstallGrantedOrigin,
  isRelayUrl,
  optionalOriginPatterns,
} from '../extensions/operative/tabs.js';

void test('Relay tabs include local development and workers.dev', () => {
  assert.equal(isRelayUrl('http://127.0.0.1:4173/'), true);
  assert.equal(isRelayUrl('http://localhost:3000/applications'), true);
  assert.equal(
    isRelayUrl('https://relay-production.example.workers.dev/'),
    true,
  );
  assert.equal(isRelayUrl('https://employer.example/jobs/1'), false);
});

void test('fixture tabs are non-Relay http(s) pages, not chrome URLs', () => {
  assert.equal(isFixtureUrl('https://employer.example/jobs/1'), true);
  assert.equal(isFixtureUrl('http://127.0.0.1:4173/'), false);
  assert.equal(isFixtureUrl('chrome://extensions'), false);
  assert.equal(
    isFixtureUrl(
      'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/popup.html',
    ),
    false,
  );
});

void test('install-time hosts stay local; HTTPS origins are requested', () => {
  assert.equal(isInstallGrantedOrigin('http://127.0.0.1:4173'), true);
  assert.equal(isInstallGrantedOrigin('http://localhost:3000'), true);
  assert.equal(
    isInstallGrantedOrigin('https://relay-production.example.workers.dev'),
    false,
  );
  assert.deepEqual(
    optionalOriginPatterns([
      'http://127.0.0.1:4173/',
      'https://employer.example/jobs/1',
      'https://relay-production.example.workers.dev/',
    ]),
    [
      'https://employer.example/*',
      'https://relay-production.example.workers.dev/*',
    ],
  );
});
