import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jobKey, classify, validateRows, validateEdit } from '../lib/domain.ts';
const rows = JSON.parse(
  readFileSync(new URL('../lib/seed.json', import.meta.url), 'utf8'),
);
test('fictional research finds repeats and earlier submissions', () => {
  const r = classify(rows, []);
  assert.deepEqual([r.new, r.known, r.submitted], [3, 1, 1]);
});
test('interview and submitted drafts can be edited without resetting status', () => {
  for (const status of ['Submitted', 'Live loop']) {
    assert.doesNotThrow(() =>
      validateEdit(
        { version: 1, status },
        { version: 1, status, draft: 'Follow-up', blocker: 'Next interview' },
      ),
    );
    assert.throws(() =>
      validateEdit(
        { version: 1, status },
        { version: 1, status: 'Held', draft: 'Follow-up', blocker: '' },
      ),
    );
  }
});
test('Greenhouse aliases match; employer identity remains distinct', () => {
  assert.equal(
    jobKey('https://boards.greenhouse.io/a/jobs/123?utm_source=x', ''),
    jobKey('https://job-boards.greenhouse.io/a/jobs/123/', ''),
  );
  assert.notEqual(
    jobKey('https://boards.greenhouse.io/a/jobs/123', ''),
    jobKey('https://boards.greenhouse.io/b/jobs/123', ''),
  );
});
test('rejects script URLs and invalid records', () => {
  assert.throws(() => jobKey('javascript:alert(1)', ''));
  assert.throws(() =>
    validateRows([
      { url: 'x', Name: 'A', Job: 'https://a.com', Status: 'bogus' },
    ]),
  );
});
test('submitted state cannot become a fresh application', () =>
  assert.throws(() =>
    validateEdit(
      { version: 1, status: 'Submitted' },
      { version: 1, status: 'Held', draft: 'x', blocker: '' },
    ),
  ));
test('acceptance requires exact text, no blocker, and current version', () => {
  for (const patch of [{ draft: '' }, { blocker: 'captcha' }, { version: 0 }])
    assert.throws(() =>
      validateEdit(
        { version: 1, status: 'Held' },
        {
          version: 1,
          status: 'Ready',
          draft: 'Approved answer',
          blocker: '',
          ...patch,
        },
      ),
    );
  assert.doesNotThrow(() =>
    validateEdit(
      { version: 1, status: 'Held' },
      { version: 1, status: 'Ready', draft: 'Approved answer', blocker: '' },
    ),
  );
});
