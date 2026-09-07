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

void test('every advertised integration has a checked-in setup guide', async () => {
  for (const item of copy.integrations)
    await access(new URL('../' + item.guide, import.meta.url));
  assert.equal(copy.leadEngineer, 'Seth Carlson');
  assert.equal(copy.leadProfile, 'https://github.com/sdcarlson');
  assert.equal(copy.peerEngineer, 'Mateo Robles');
  assert.equal(copy.peerProfile, 'https://github.com/sykosyber');
});

void test('project and organization copy credits both maintainers', () => {
  const credit =
    /\*\*Relay lead engineer: \[Seth Carlson\]\(https:\/\/github.com\/sdcarlson\)\.\*\* \*\*Product: \[Mateo Robles\]\(https:\/\/github.com\/sykosyber\)\.\*\*/;
  for (const target of ['project', 'organization']) {
    const content = render(copy, target);
    assert.match(content, credit);
    assert.doesNotMatch(content, /Application development/);
  }
  const profile = render(copy, 'profile');
  assert.match(profile, /Lead engineer/);
  assert.doesNotMatch(profile, /Application development/);
  assert.doesNotMatch(profile, /\*\*Product:/);
});

void test('organization copy names the two-person lab before RELAY', () => {
  const content = render(copy, 'organization');
  const lab =
    'A two-person lab. **[Mateo Robles](https://github.com/sykosyber)** · SyberLabs / RISE. **[Seth Carlson](https://github.com/sdcarlson)** · Relay lead engineer; systems on RISE and OSAHR.';
  assert.ok(content.startsWith(lab + '\n\n## RELAY - our flagship project'));
  assert.doesNotMatch(render(copy, 'project'), /two-person lab/);
});

void test('sync preserves all content outside its block and is idempotent', () => {
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

void test('missing or ambiguous markers fail instead of overwriting a page', () => {
  for (const value of ['custom content', start + end + start, end + start])
    assert.throws(() => replaceBlock(value, 'new'));
});

void test('website product data is escaped before rendering', () => {
  for (const field of ['stage', 'summary']) {
    const content = render(
      { ...copy, [field]: '<script>alert(1)</script>' },
      'website',
    );
    assert.doesNotMatch(content, /<script\b/i);
    assert.match(content, /&lt;script&gt;/);
  }
});

void test('public links reject executable schemes, other hosts and embedded credentials', () => {
  for (const field of ['repository', 'leadProfile', 'peerProfile']) {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,test',
      'https://example.com/relay',
      'https://user:pass@github.com/SyberLabs/relay',
    ]) {
      assert.throws(() => render({ ...copy, [field]: value }, 'website'));
    }
  }
});
