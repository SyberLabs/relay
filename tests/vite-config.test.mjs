import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

void test('CI Vinext does not watch files that integration suites write', () => {
  const source = readFileSync('vite.config.ts', 'utf8');
  const ci = source.slice(
    source.indexOf('process.env.RELAY_CI_STATE'),
    source.indexOf('preview:'),
  );
  assert.match(ci, /watch:\s*null/);
  assert.match(source, /private-data/);
});
