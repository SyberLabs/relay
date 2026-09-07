import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, jobKey, sourceJobKey, validateRows } from '../lib/domain.ts';
import { loadEditor } from '../lib/editor.ts';
import {
  existingJobForUrl,
  firstJobErrors,
  firstJobRow,
  firstJobShouldSelectSaved,
  joinExistingJobNotice,
} from '../lib/first-job.ts';

const posting = 'https://example.com/jobs/first-job';
const title = 'Fictional Example — Reliability Engineer';

function input(extra = {}) {
  return {
    title,
    url: posting,
    notes: 'Fictional posting notes.',
    ...extra,
  };
}

void test('valid fields become a Held import row with stable source identity', () => {
  const row = firstJobRow(input());
  assert.deepEqual(validateRows([row]), [row]);
  assert.equal(row.Status, 'Held');
  assert.equal(row.Name, title);
  assert.equal(row.Job, posting);
  assert.equal(row.Notes, 'Fictional posting notes.');
  assert.equal(row.url, 'first-job:' + jobKey(posting, ''));
  assert.equal(sourceJobKey(row), jobKey(posting, ''));
});

void test('optional notes may be empty and are not trimmed or truncated', () => {
  const notes = '  keep leading and trailing  ';
  const row = firstJobRow(input({ notes }));
  assert.equal(row.Notes, notes);
  assert.equal(firstJobRow(input({ notes: '' })).Notes, '');
  const max = 'n'.repeat(20000);
  assert.equal(firstJobRow(input({ notes: max })).Notes.length, 20000);
  assert.equal(firstJobErrors(input({ notes: max })).notes, undefined);
});

void test('field-specific errors keep the caller responsible for recoverable input', () => {
  assert.deepEqual(firstJobErrors(input({ title: '   ' })), {
    title: 'Enter a role title.',
  });
  assert.deepEqual(firstJobErrors(input({ title: '' })), {
    title: 'Enter a role title.',
  });
  assert.deepEqual(firstJobErrors(input({ title: 'a'.repeat(501) })), {
    title: 'Role title must be 500 characters or fewer.',
  });
  assert.equal(
    firstJobErrors(input({ title: 'a'.repeat(500) })).title,
    undefined,
  );
  assert.deepEqual(firstJobErrors(input({ url: '' })), {
    url: 'Enter an HTTP or HTTPS posting URL.',
  });
  assert.deepEqual(firstJobErrors(input({ url: 'not-a-url' })), {
    url: 'Enter an HTTP or HTTPS posting URL.',
  });
  assert.deepEqual(firstJobErrors(input({ url: 'javascript:alert(1)' })), {
    url: 'Enter an HTTP or HTTPS posting URL.',
  });
  assert.deepEqual(firstJobErrors(input({ url: 'ftp://example.com/jobs/a' })), {
    url: 'Enter an HTTP or HTTPS posting URL.',
  });
  assert.deepEqual(firstJobErrors(input({ notes: 'n'.repeat(20001) })), {
    notes: 'Research notes must be 20,000 characters or fewer.',
  });
  assert.throws(() => firstJobRow(input({ title: '' })), /role title/i);
});

void test('tracking-parameter URL variants join the same job without a second source identity', () => {
  const tracked = posting + '?utm_source=board&utm_campaign=x';
  const a = firstJobRow(input());
  const b = firstJobRow(input({ url: tracked }));
  assert.equal(a.url, b.url);
  assert.equal(sourceJobKey(a), sourceJobKey(b));
  const jobs = [
    {
      id: 'existing',
      job_key: jobKey(posting, ''),
      name: title,
      status: 'Ready',
    },
  ];
  assert.equal(existingJobForUrl(jobs, tracked)?.id, 'existing');
  assert.match(
    joinExistingJobNotice(jobs[0]),
    /matches Fictional Example — Reliability Engineer/,
  );
  assert.match(joinExistingJobNotice(jobs[0]), /Ready/);
  assert.equal(
    existingJobForUrl(jobs, 'https://example.com/jobs/other'),
    undefined,
  );
  const report = classify([b], [{ job_key: jobs[0].job_key, status: 'Ready' }]);
  assert.equal(report.new, 0);
  assert.equal(report.known, 1);
});

void test('company compensation and fit are omitted from the import row', () => {
  const row = firstJobRow(input());
  assert.equal('company' in row, false);
  assert.equal('comp_min' in row, false);
  assert.equal('comp_max' in row, false);
});

void test('delayed add-job completion keeps in-flight editor work instead of selecting', () => {
  const existing = {
    id: 'existing',
    version: 1,
    draft: '',
    blocker: '',
  };
  const editor = loadEditor(existing);
  const started = {
    selectedId: existing.id,
    jobId: editor.jobId,
    session: editor.session,
    draft: editor.draft,
    blocker: editor.blocker,
    progressNote: editor.progressNote,
  };
  assert.equal(
    firstJobShouldSelectSaved(started, editor, existing.id, 'added'),
    true,
  );
  const typed = { ...editor, draft: 'Typed while add-job was in flight.' };
  assert.equal(
    firstJobShouldSelectSaved(started, typed, existing.id, 'added'),
    false,
  );
  assert.equal(
    firstJobShouldSelectSaved(
      started,
      { ...editor, progressNote: 'Nonblocking note typed during add-job.' },
      existing.id,
      'added',
    ),
    false,
  );
  assert.equal(
    firstJobShouldSelectSaved(started, editor, 'other', 'added'),
    false,
  );
  assert.equal(
    firstJobShouldSelectSaved(
      {
        selectedId: '',
        jobId: '',
        session: '',
        draft: '',
        blocker: '',
        progressNote: '',
      },
      null,
      '',
      'added',
    ),
    true,
  );
});
