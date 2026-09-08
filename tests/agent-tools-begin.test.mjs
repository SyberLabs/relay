import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

void test('relay_begin_application swallows a failed display refresh after a successful begin', async () => {
  const source = await readFile(
    new URL('../app/agent-tools.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf("name: 'relay_begin_application'");
  const end = source.indexOf("name: 'relay_finish_application'");
  assert.ok(start >= 0 && end > start);
  const begin = source.slice(start, end);
  assert.match(begin, /try \{\s*await refresh\(\);\s*\} catch \{/);
  assert.match(
    begin,
    /catch \{[\s\S]*return \{\s*execute: result\.execute,\s*operation: result\.operation,\s*refresh_required: true/,
  );
  assert.doesNotMatch(begin, /await refresh\(\);\s*return \{ execute/);
});

void test('relay_wait_for_application returns without awaiting display refresh', async () => {
  const source = await readFile(
    new URL('../app/agent-tools.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf("name: 'relay_wait_for_application'");
  const end = source.indexOf("name: 'relay_begin_application'");
  assert.ok(start >= 0 && end > start);
  const wait = source.slice(start, end);
  assert.doesNotMatch(wait, /await refresh\(\)/);
  assert.match(wait, /return result;/);
});
