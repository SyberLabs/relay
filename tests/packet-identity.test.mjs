import test from 'node:test';
import assert from 'node:assert/strict';
import { jobKey, packetKeyMatches } from '../lib/domain.ts';
import { validatePacket } from '../integrations/connectors.mjs';
import {
  draftFromResult,
  selectedJobPacket,
} from '../lib/integration-files.ts';

const sourceUrl = 'https://example.com/research/null-job';
const nullKey = jobKey(null, sourceUrl);
const started = {
  jobId: 'job-null',
  session: 's1',
  version: 2,
  draft: 'Original',
  job_key: nullKey,
};

void test('null posting URLs keep source identity and still validate packets', () => {
  assert.equal(nullKey, `source:${sourceUrl}`);
  assert.equal(packetKeyMatches(null, nullKey), true);
  assert.equal(packetKeyMatches('', nullKey), true);
  assert.equal(packetKeyMatches(undefined, nullKey), true);
  assert.equal(packetKeyMatches('https://example.com/jobs/a', nullKey), false);
  assert.equal(
    packetKeyMatches('https://example.com/jobs/a', 'https://example.com/jobs/a'),
    true,
  );
  assert.equal(
    packetKeyMatches('https://example.com/jobs/a', 'https://example.com/other'),
    false,
  );
  const packet = selectedJobPacket(
    {
      id: 'job-null',
      job_key: nullKey,
      name: 'Role without posting URL',
      url: null,
      version: 2,
      status: 'Held',
    },
    'Verified tenure at Example.',
    'Visible draft',
  );
  assert.equal(packet.job.url, null);
  assert.equal(validatePacket(packet).job.key, nullKey);
  assert.equal(
    draftFromResult(
      {
        schema: 'relay.draft.v1',
        job: { id: 'job-null', key: nullKey, url: null, version: 2 },
        draft: 'Returned wording',
      },
      started,
    ),
    'Returned wording',
  );
});

void test('null-URL packets reject conflicting identity and stale versions', () => {
  const packet = {
    schema: 'relay.packet.v1',
    job: {
      id: 'job-null',
      key: nullKey,
      name: 'Role',
      url: null,
      version: 2,
      status: 'Held',
    },
    facts: 'Verified fact.',
    draft: '',
  };
  assert.throws(
    () =>
      validatePacket({
        ...packet,
        job: { ...packet.job, key: 'https://example.com/jobs/a' },
      }),
    /identity/,
  );
  assert.throws(
    () =>
      validatePacket({
        ...packet,
        job: {
          ...packet.job,
          url: 'https://example.com/jobs/a',
          key: nullKey,
        },
      }),
    /identity/,
  );
  assert.throws(
    () =>
      draftFromResult(
        {
          schema: 'relay.draft.v1',
          job: { id: 'job-null', key: nullKey, url: null, version: 1 },
          draft: 'Stale wording',
        },
        started,
      ),
    /matching job/,
  );
  assert.throws(
    () =>
      draftFromResult(
        {
          schema: 'relay.draft.v1',
          job: {
            id: 'job-null',
            key: 'https://example.com/jobs/a',
            url: 'https://example.com/jobs/a',
            version: 2,
          },
          draft: 'Wrong job',
        },
        started,
      ),
    /matching job/,
  );
});
