import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pullNotion,
  draftClaude,
  validatePacket,
  notionRow,
} from '../integrations/connectors.mjs';
const packet = {
  schema: 'relay.packet.v1',
  job: {
    key: 'https://example.com/jobs/a',
    url: 'https://example.com/jobs/a',
    version: 1,
  },
  facts: 'Built a sample service.',
  draft: '',
};
const page = {
  url: 'https://example.com/source',
  properties: {
    Name: { title: [{ plain_text: 'Example job' }] },
    Job: { url: 'https://example.com/jobs/a' },
    Status: { status: { name: 'Live loop' } },
    Notes: { rich_text: [{ text: { content: 'Interview scheduled' } }] },
  },
};
test('Notion preserves status and returns continuation instead of silently truncating', async () => {
  const r = await pullNotion(
    { token: 'test-token', dataSource: 'a'.repeat(32), cursor: 'prior' },
    async (url, options) => {
      assert.equal(options.headers['Notion-Version'], '2025-09-03');
      assert.equal(JSON.parse(options.body).start_cursor, 'prior');
      assert.match(url, /data_sources/);
      return Response.json({
        results: [page],
        has_more: true,
        next_cursor: 'next',
      });
    },
  );
  assert.equal(r.rows[0].Status, 'Live loop');
  assert.equal(r.cursor, 'next');
});
test('unknown Notion statuses are rejected', () => {
  assert.throws(() =>
    notionRow({
      ...page,
      properties: {
        ...page.properties,
        Status: { status: { name: 'Unknown' } },
      },
    }),
  );
});
test('Claude output remains a draft tied to its original job and version', async () => {
  const result = await draftClaude(
    { token: 'test-token', model: 'test-model', packet },
    async (url, options) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(JSON.parse(options.body).model, 'test-model');
      assert.equal(options.headers['x-api-key'], 'test-token');
      return Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: ' A draft. ' }],
      });
    },
  );
  assert.equal(result.draft, 'A draft.');
  assert.equal(result.reviewRequired, true);
  assert.deepEqual(result.job, packet.job);
});
test('provider errors and truncated responses never produce drafts', async () => {
  await assert.rejects(
    draftClaude(
      { token: 't', model: 'm', packet },
      async () => new Response('', { status: 429 }),
    ),
    /429/,
  );
  await assert.rejects(
    draftClaude({ token: 't', model: 'm', packet }, async () =>
      Response.json({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: 'Partial' }],
      }),
    ),
    /did not finish/,
  );
});
test('packets require verified facts and matching job identity', () => {
  assert.throws(() => validatePacket({ ...packet, facts: '' }));
  assert.throws(() =>
    validatePacket({ ...packet, job: { ...packet.job, key: 'different' } }),
  );
  const sourcePacket = {
    ...packet,
    job: {
      id: 'job-1',
      key: 'source:https://example.com/research/a',
      url: null,
      version: 3,
    },
  };
  assert.deepEqual(validatePacket(sourcePacket), sourcePacket);
  assert.throws(() =>
    validatePacket({
      ...sourcePacket,
      job: { ...sourcePacket.job, url: 'https://example.com/jobs/a' },
    }),
  );
  assert.throws(() =>
    validatePacket({
      ...sourcePacket,
      job: { ...sourcePacket.job, key: 'source:' },
    }),
  );
});
