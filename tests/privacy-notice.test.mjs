import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return (await readFile(path, 'utf8')).toLowerCase().replace(/\s+/g, ' ');
}

void test('the data notice states current shipped practices and is linked', async () => {
  const privacy = await source('app/privacy/page.tsx');
  for (const phrase of [
    'invited pilot',
    'cloudflare access',
    'authenticated',
    'd1',
    'does not sell',
    'does not post the employer form',
    'turnstile',
    'self-service',
    'public issues',
    'hiring outcomes',
  ]) {
    assert.ok(privacy.includes(phrase), `missing ${phrase}`);
  }
  assert.equal(privacy.includes('lawsuit'), false);
  assert.equal(privacy.includes('soc 2'), false);
  assert.equal(privacy.includes('gdpr compliant'), false);
  assert.equal(/protects? (us|you) from/.test(privacy), false);

  const about = await source('app/about/page.tsx');
  assert.match(about, /href="\/privacy"/);
  assert.match(await source('app/shell.tsx'), /href="\/privacy"/);
  assert.match(await source('app/runtime-shell.tsx'), /href="\/privacy"/);
  assert.match(await source('README.md'), /\/privacy/);
});

void test('the data notice is not a gateway static-asset bypass', async () => {
  const handler = await readFile('deploy/handler.mjs', 'utf8');
  const staticLine = handler
    .split('\n')
    .find((line) => line.includes('const staticPath'));
  assert.ok(staticLine);
  assert.equal(staticLine.includes('privacy'), false);
  assert.equal(staticLine.includes('_next'), true);
  assert.equal(staticLine.includes('favicon.ico'), true);
});
