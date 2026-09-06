import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { assistantPrompt, assistantResult } from '../lib/assistant-handoff.ts';
import { draftFromResult } from '../lib/integration-files.ts';
import { draftCodex } from '../integrations/codex.mjs';

const packet = {
  schema: 'relay.packet.v1',
  job: {
    id: 'fictional-a',
    name: 'Example role',
    url: 'https://example.com/jobs/a',
    key: 'https://example.com/jobs/a',
    version: 3,
    status: 'Submitted',
  },
  facts: 'Built a fictional inventory service.',
  draft: '',
};
const target = {
  jobId: packet.job.id,
  job_key: packet.job.key,
  version: 3,
  session: 's',
  draft: '',
};

test('assistant handoffs include only selected context and preserve review authority', () => {
  for (const provider of ['chatgpt', 'codex']) {
    const input = {
      ...packet,
      secret: 'DO_NOT_EXPORT',
      otherJobs: ['DO_NOT_EXPORT'],
      job: { ...packet.job, privateExtra: 'DO_NOT_EXPORT' },
    };
    const prompt = assistantPrompt(input, provider);
    assert.doesNotMatch(prompt, /DO_NOT_EXPORT/);
    assert.match(prompt, /untrusted source data/);
    assert.match(prompt, /reviewRequired/);
    const result = assistantResult(input, 'Draft for review.', provider);
    assert.deepEqual(result.job, packet.job);
    assert.equal(result.reviewRequired, true);
    assert.equal(draftFromResult(result, target), 'Draft for review.');
    assert.throws(() => draftFromResult(result, { ...target, version: 4 }));
    assert.throws(() => draftFromResult(result, { ...target, jobId: 'other' }));
    assert.throws(() =>
      draftFromResult(result, {
        ...target,
        job_key: 'https://example.com/other',
      }),
    );
  }
});

test('missing facts, invalid identity, empty and oversized drafts stop the handoff', () => {
  assert.throws(() => assistantPrompt({ ...packet, facts: '' }, 'chatgpt'));
  assert.throws(() =>
    assistantPrompt(
      { ...packet, job: { ...packet.job, key: 'other' } },
      'codex',
    ),
  );
  assert.throws(() =>
    assistantPrompt(
      { ...packet, job: { ...packet.job, id: undefined } },
      'codex',
    ),
  );
  assert.throws(() => assistantResult(packet, '', 'chatgpt'));
  assert.throws(() => assistantResult(packet, 'a'.repeat(20001), 'codex'));
});

test('Codex runs with constrained output and Relay owns identity, not the response', async () => {
  let directory;
  const result = await draftCodex(
    packet,
    async (executable, args, options, prompt) => {
      directory = options.cwd;
      assert.equal(executable, 'codex');
      assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
      assert.ok(args.includes('--ephemeral'));
      assert.ok(options.timeout > 0);
      assert.match(prompt, /fictional inventory/);
      const schema = JSON.parse(
        await readFile(args[args.indexOf('--output-schema') + 1], 'utf8'),
      );
      assert.deepEqual(schema.required, ['draft']);
      await writeFile(
        args[args.indexOf('--output-last-message') + 1],
        JSON.stringify({
          draft: 'A reviewed-later draft.',
          job: { id: 'attacker' },
          reviewRequired: false,
        }),
      );
    },
  );
  assert.deepEqual(result.job, packet.job);
  assert.equal(result.reviewRequired, true);
  assert.equal(draftFromResult(result, target), 'A reviewed-later draft.');
  await assert.rejects(access(directory));
});

test('Codex failure or malformed output leaves no draft and cleans temporary files', async () => {
  let directory;
  await assert.rejects(
    draftCodex(packet, async (_exe, _args, options) => {
      directory = options.cwd;
      throw Error('fixture failure');
    }),
    /fixture failure/,
  );
  await assert.rejects(access(directory));
  await assert.rejects(
    draftCodex(packet, async (_exe, args) => {
      await writeFile(
        args[args.indexOf('--output-last-message') + 1],
        '{broken',
      );
    }),
  );
});

test('CLI prompt and draft file round trip rejects output overwrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-assistant-test-'));
  try {
    const input = join(dir, 'packet.json'),
      draft = join(dir, 'draft.txt');
    await writeFile(input, JSON.stringify(packet));
    await writeFile(draft, 'A fictional draft.');
    for (const provider of ['chatgpt', 'codex']) {
      const prompt = join(dir, `${provider}.md`),
        output = join(dir, `${provider}.json`);
      execFileSync(process.execPath, [
        'integrations/relay.mjs',
        `${provider}-prompt`,
        input,
        prompt,
      ]);
      assert.match(await readFile(prompt, 'utf8'), /Required output/);
      const args = [
        'integrations/relay.mjs',
        `${provider}-draft`,
        input,
        draft,
        output,
      ];
      execFileSync(process.execPath, args);
      const result = JSON.parse(await readFile(output, 'utf8'));
      assert.equal(draftFromResult(result, target), 'A fictional draft.');
      assert.notEqual(spawnSync(process.execPath, args).status, 0);
      assert.equal(
        await readFile(output, 'utf8'),
        JSON.stringify(result, null, 2) + '\n',
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
