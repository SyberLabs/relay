import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../integrations/cli.mjs';

void test('CLI stage preserves its file through success and auth, quota, stale and uncertain responses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-stage-'));
  const file = join(dir, 'draft.txt');
  const draft = '\uFEFF Exact — wording 😀\r\n';
  writeFileSync(file, draft);
  const args = [
    'stage',
    'owned',
    file,
    '--version',
    '2',
    '--blocker=Confirm location.',
    '--json',
  ];
  try {
    for (const [status, expected] of [
      [200, 0],
      [401, 2],
      [403, 3],
      [409, 3],
      [429, 3],
      [503, 4],
      [0, 4],
    ]) {
      for (const failedCall of status === 200 ? [2] : [1, 2]) {
        const calls = [];
        const code = await run(args, {
          session: 'fictional=1',
          fetchImpl: async (url, init) => {
            calls.push({ url, init });
            assert.equal(new URL(url).pathname, '/api/workspace');
            assert.equal(init.headers.cookie, 'fictional=1');
            if (calls.length === failedCall) {
              if (!status) throw Error('Response lost');
              return Response.json(
                status === 200 ? { ok: true } : { error: 'Refused' },
                { status },
              );
            }
            return Response.json({
              jobs: [{ id: 'owned', status: 'Ready', version: 8 }],
            });
          },
        });
        assert.equal(code, expected, `HTTP ${status} at request ${failedCall}`);
        assert.equal(calls.length, failedCall, 'no retry');
        if (calls.length === 2)
          assert.deepEqual(JSON.parse(calls[1].init.body), {
            action: 'save',
            id: 'owned',
            version: 2,
            draft,
            blocker: 'Confirm location.',
            status: 'Held',
          });
        assert.equal(readFileSync(file, 'utf8'), draft);
      }
    }
    const calls = [];
    assert.equal(
      await run([...args.slice(0, 5), '--blocker=', '--json'], {
        session: 'fictional=1',
        fetchImpl: async (_url, init) => {
          calls.push(init);
          return Response.json(
            init.body
              ? { ok: true }
              : { jobs: [{ id: 'owned', status: 'Held' }] },
          );
        },
      }),
      0,
    );
    assert.equal(JSON.parse(calls[1].body).blocker, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test('CLI stage rejects missing/unsafe arguments, oversized and invalid UTF-8 input before network', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-stage-'));
  const file = join(dir, 'draft.txt');
  const io = {
    session: 'fictional=1',
    fetchImpl: () => assert.fail('invalid input reached network'),
  };
  try {
    writeFileSync(file, 'Exact wording');
    for (const flags of [
      [],
      ['--version=2'],
      ['--version=2', '--blocker'],
      ['--version=0', '--blocker='],
      ['--version=2.5', '--blocker='],
      ['--version=9007199254740992', '--blocker='],
      ['--version=2', '--blocker=', '--status=Ready'],
      ['--version=2', '--blocker=', '--accept'],
      ['--version=2', '--blocker=', 'extra'],
    ]) {
      assert.equal(await run(['stage', 'owned', file, ...flags], io), 1);
      assert.equal(readFileSync(file, 'utf8'), 'Exact wording');
    }
    for (const [body, expected] of [
      [Buffer.from([0xff]), 1],
      ['x'.repeat(80001), 1],
      ['x'.repeat(20001), 3],
    ]) {
      writeFileSync(file, body);
      assert.equal(
        await run(['stage', 'owned', file, '--version=2', '--blocker='], io),
        expected,
      );
      assert.deepEqual(readFileSync(file), Buffer.from(body));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
