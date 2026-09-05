import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import {
  render,
  replaceBlock,
  start,
  end,
} from '../scripts/sync-public-copy.mjs';
const copy = JSON.parse(
  await readFile(new URL('../docs/public-copy.json', import.meta.url), 'utf8'),
);

test('every advertised integration has a checked-in setup guide', async () => {
  for (const item of copy.integrations)
    await access(new URL('../' + item.guide, import.meta.url));
  assert.equal(copy.leadEngineer, 'Seth Carlson');
});

test('sync preserves all content outside its block and is idempotent', () => {
  const prefix = '\ufeffCustom introduction\r\n',
    suffix = '\r\nOther projects stay intact.\r\n';
  const original = prefix + start + '\r\nOld content\r\n' + end + suffix;
  for (const target of ['project', 'organization', 'profile', 'website']) {
    const content = render(copy, target),
      next = replaceBlock(original, content);
    assert.ok(next.startsWith(prefix + start));
    assert.ok(next.endsWith(end + suffix));
    assert.equal(replaceBlock(next, content), next);
    assert.match(content, /ChatGPT/);
    assert.match(content, /Codex/);
  }
});

test('missing or ambiguous markers fail instead of overwriting a page', () => {
  for (const value of ['custom content', start + end + start, end + start])
    assert.throws(() => replaceBlock(value, 'new'));
});

test('website product data is escaped before rendering', () => {
  const content = render(
    { ...copy, stage: '<script>alert(1)</script>' },
    'website',
  );
  assert.doesNotMatch(content, /<script\b/i);
  assert.match(content, /&lt;script&gt;/);
});
