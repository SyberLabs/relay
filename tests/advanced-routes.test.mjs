import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRIMARY_PAGE_LINKS, PAGE_LINKS } from '../lib/nav.ts';

void test('legacy plan, preferences, and review routes redirect under Advanced', () => {
  for (const [file, dest] of [
    ['app/plan/page.tsx', '/advanced/plan'],
    ['app/preferences/page.tsx', '/advanced/preferences'],
    ['app/review/page.tsx', '/advanced/review'],
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /['"]use client['"]/);
    assert.match(source, /from 'next\/navigation'/);
    assert.match(source, new RegExp(`redirect\\('${dest.replaceAll('/', '\\/')}'\\)`));
    assert.doesNotMatch(source, /ProductShell/);
    assert.doesNotMatch(source, /action:\s*['"]save['"]/);
    assert.doesNotMatch(source, /action:\s*['"]begin['"]/);
  }
  const advanced = readFileSync('app/advanced/page.tsx', 'utf8');
  assert.match(advanced, /href="\/advanced\/review"/);
  assert.match(advanced, /href="\/advanced\/preferences"/);
  assert.match(advanced, /href="\/advanced\/plan"/);
  assert.doesNotMatch(advanced, /href="\/review"/);
  assert.doesNotMatch(advanced, /href="\/preferences"/);
  assert.doesNotMatch(advanced, /href="\/plan"/);
  const review = readFileSync('app/advanced/review/page.tsx', 'utf8');
  const preferences = readFileSync('app/advanced/preferences/page.tsx', 'utf8');
  const plan = readFileSync('app/advanced/plan/page.tsx', 'utf8');
  assert.match(review, /fetch\('\/api\/drafts'/);
  assert.match(preferences, /fetch\('\/api\/preferences'/);
  assert.match(plan, /fetch\('\/api\/plan'/);
  assert.match(
    review,
    /href="\/signin-with-chatgpt\?return_to=\/advanced\/review"/,
  );
  assert.match(
    preferences,
    /href="\/signin-with-chatgpt\?return_to=\/advanced\/preferences"/,
  );
  assert.match(
    plan,
    /href="\/signin-with-chatgpt\?return_to=\/advanced\/plan"/,
  );
  for (const source of [review, preferences, plan]) {
    assert.match(source, /ProductShell current=/);
    assert.doesNotMatch(source, /action:\s*['"]save['"]/);
    assert.doesNotMatch(source, /action:\s*['"]begin['"]/);
    assert.doesNotMatch(source, /Accept exact draft/);
  }
  assert.deepEqual(
    PRIMARY_PAGE_LINKS.map((item) => item.href),
    ['/', '/track'],
  );
  assert.deepEqual(
    PAGE_LINKS.map((item) => item.href),
    ['/applications', '/profile', '/advanced'],
  );
});

void test('folded Advanced APIs stay owner-scoped and do not begin or accept', () => {
  for (const file of [
    'app/api/plan/route.ts',
    'app/api/preferences/route.ts',
    'app/api/drafts/route.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /getChatGPTUser/);
    assert.match(source, /401/);
    assert.doesNotMatch(source, /action:\s*['"]begin['"]/);
    assert.doesNotMatch(source, /save\('Ready'\)/);
  }
  assert.match(
    readFileSync('app/api/drafts/route.ts', 'utf8'),
    /validateDraftLog/,
  );
});
