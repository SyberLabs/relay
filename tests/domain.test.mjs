import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  jobKey,
  classify,
  validateRows,
  validateEdit,
  importedJobStatus,
  sourceJobKey,
  sourcePostingUrl,
} from '../lib/domain.ts';
function row(status, job = 'https://example.com/jobs/a', notes = '') {
  return {
    url: 'https://example.com/research/' + status + notes,
    Name: 'Example — Role',
    Job: job,
    Status: status,
    Notes: notes,
  };
}
const rows = JSON.parse(
  readFileSync(new URL('../lib/seed.json', import.meta.url), 'utf8'),
);
void test('fictional research finds repeats and earlier submissions', () => {
  const r = classify(rows, []);
  assert.deepEqual([r.new, r.known, r.submitted], [3, 1, 1]);
});
void test('interview and submitted drafts can be edited without resetting status', () => {
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
void test('Greenhouse aliases match; employer identity remains distinct', () => {
  assert.equal(
    jobKey('https://boards.greenhouse.io/a/jobs/123?utm_source=x', ''),
    jobKey('https://job-boards.greenhouse.io/a/jobs/123/', ''),
  );
  assert.notEqual(
    jobKey('https://boards.greenhouse.io/a/jobs/123', ''),
    jobKey('https://boards.greenhouse.io/b/jobs/123', ''),
  );
});
void test('role-title Job with posting url validates and keys as Greenhouse identity', () => {
  const posting = 'https://boards.greenhouse.io/acme/jobs/1';
  const r = {
    url: posting,
    Name: 'Acme',
    Job: 'Software Engineer',
    Status: 'Held',
    Notes: '',
  };
  assert.deepEqual(validateRows([r]), [r]);
  const report = classify([r], []);
  assert.equal(report.items[0].key, jobKey(posting, ''));
  assert.equal(report.new, 1);
});
void test('colon-bearing role titles key from the posting url', () => {
  const posting = 'https://boards.greenhouse.io/acme/jobs/1';
  for (const title of ['Engineer: Backend', 'SRE: Platform']) {
    const r = {
      url: posting,
      Name: 'Acme',
      Job: title,
      Status: 'Held',
      Notes: '',
    };
    assert.deepEqual(validateRows([r]), [r]);
    const report = classify([r], []);
    assert.equal(report.items[0].key, jobKey(posting, ''));
    assert.equal(sourcePostingUrl(r), posting);
    assert.equal(sourceJobKey(r), jobKey(posting, ''));
  }
});
void test('rejects script URLs and invalid records', () => {
  assert.throws(() => jobKey('javascript:alert(1)', ''));
  assert.throws(() => jobKey('Software Engineer', ''), /HTTP or HTTPS job URL/);
  assert.throws(() =>
    validateRows([
      { url: 'x', Name: 'A', Job: 'https://a.com', Status: 'bogus' },
    ]),
  );
  assert.throws(() =>
    validateRows([
      {
        url: 'https://boards.greenhouse.io/acme/jobs/1',
        Name: 'Acme',
        Job: 'javascript:alert(1)',
        Status: 'Held',
        Notes: '',
      },
    ]),
  );
  assert.throws(() =>
    validateRows([
      {
        url: 'javascript:alert(1)',
        Name: 'Acme',
        Job: 'Software Engineer',
        Status: 'Held',
        Notes: '',
      },
    ]),
  );
  assert.throws(() =>
    validateRows([
      {
        url: 'https://boards.greenhouse.io/acme/jobs/1',
        Name: 'Acme',
        Job: 'ftp://example.com/jobs/a',
        Status: 'Held',
        Notes: '',
      },
    ]),
  );
});
void test('HTTP Job posting still keys from Job when url is a research identity', () => {
  const posting = 'https://example.com/jobs/backend';
  const r = {
    url: 'https://example.com/research/0',
    Name: 'Acme — Role',
    Job: posting,
    Status: 'Held',
    Notes: '',
  };
  assert.deepEqual(validateRows([r]), [r]);
  assert.equal(sourcePostingUrl(r), posting);
  assert.equal(sourceJobKey(r), jobKey(posting, r.url));
  assert.equal(classify([r], []).items[0].key, jobKey(posting, ''));
});
void test('submitted state cannot become a fresh application', () =>
  assert.throws(() =>
    validateEdit(
      { version: 1, status: 'Submitted' },
      { version: 1, status: 'Held', draft: 'x', blocker: '' },
    ),
  ));
void test('preview merge reports a later Held row as already submitted', () => {
  const r = classify([row('Held'), row('Submitted'), row('Held')], []);
  assert.equal(r.items.at(-1).kind, 'submitted');
  assert.deepEqual([r.new, r.known, r.submitted], [1, 1, 1]);
});
void test('preview keeps Live loop above Submitted for both import orders', () => {
  const forward = classify([row('Live loop'), row('Submitted')], []);
  assert.equal(forward.items[1].kind, 'known');
  assert.equal(forward.submitted, 0);
  const reverse = classify([row('Submitted'), row('Live loop')], []);
  assert.equal(reverse.items[0].kind, 'new');
  assert.equal(reverse.items[1].kind, 'submitted');
});
void test('imported Ready is Held locally and source Ready stays Ready', () => {
  assert.equal(importedJobStatus('Ready'), 'Held');
  for (const status of ['Held', 'Submitted', 'Skip', 'Live loop'])
    assert.equal(importedJobStatus(status), status);
});
void test('rejects a non-string source timestamp', () => {
  assert.throws(() =>
    validateRows([
      {
        url: 'https://example.com/research/0',
        Name: 'Example',
        Job: 'https://example.com/jobs/a',
        Status: 'Held',
        Notes: '',
        createdTime: 1,
      },
    ]),
  );
  assert.doesNotThrow(() =>
    validateRows([
      {
        url: 'https://example.com/research/0',
        Name: 'Example',
        Job: 'https://example.com/jobs/a',
        Status: 'Held',
        Notes: '',
        createdTime: '2026-01-01T00:00:00.000Z',
      },
    ]),
  );
});
void test('acceptance requires exact text, no blocker, and current version', () => {
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
