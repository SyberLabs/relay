import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pullNotion,
  draftClaude,
  validatePacket,
  notionRow,
  pullBoard,
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
});

const greenhousePayload = {
  jobs: [
    {
      absolute_url: 'https://boards.greenhouse.io/northstar/jobs/4001',
      title: 'Senior Backend Engineer',
      updated_at: '2026-09-01T00:00:00.000Z',
      location: { name: 'Remote — US' },
      content: '<p>Base range $150,000 - $190,000</p>',
      company_name: 'Northstar',
    },
  ],
};
const ok = (payload) => async () => ({
  ok: true,
  status: 200,
  json: async () => payload,
});
test('a public board pull normalises into importable rows', async () => {
  const rows = await pullBoard({
    provider: 'greenhouse',
    board: 'northstar',
    fetchImpl: ok(greenhousePayload),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Status, 'Held', 'discovery never implies a decision');
  assert.equal(rows[0].comp_min, 150000);
  assert.equal(rows[0].remote, 'remote');
});
test('board pulls reject unknown providers and unsafe board names', async () => {
  await assert.rejects(
    () => pullBoard({ provider: 'linkedin', board: 'x', fetchImpl: ok({}) }),
    /supported board/,
  );
  await assert.rejects(
    () =>
      pullBoard({
        provider: 'greenhouse',
        board: '../../etc/passwd',
        fetchImpl: ok({}),
      }),
    /board identifier/,
  );
});
test('a failed board response is reported, not treated as empty', async () => {
  await assert.rejects(
    () =>
      pullBoard({
        provider: 'lever',
        board: 'harbor',
        fetchImpl: async () => ({ ok: false, status: 404 }),
      }),
    /responded 404/,
  );
});
