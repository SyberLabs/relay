import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { stageDraft } from '../lib/draft-stage.ts';
import { readApplicationContext } from '../lib/application-context.ts';
import { createApplicationWait } from '../lib/application-wait.ts';

const source = stripTypeScriptTypes(
  readFileSync(new URL('../app/agent-tools.ts', import.meta.url), 'utf8')
    .replaceAll('\r\n', '\n')
    .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
    .replace(/export /g, ''),
);

for (const mode of ['unavailable', 'registered', 'throw', 'reject']) {
  void test(`window.relay reports success once and preserves refusals with ${mode} WebMCP`, async () => {
    const active = new Map();
    const window = {};
    const callbacks = [];
    const statuses = [];
    const requests = [];
    let cleanup;
    let response = () => Response.json({ jobs: [{ id: 'fictional-job' }] });
    const deps = {
      useEffect: (effect) => {
        cleanup = effect();
      },
      useState: () => ['checking', (status) => statuses.push(status)],
      stageDraft,
      readApplicationContext,
      createApplicationWait,
      document: {
        modelContext:
          mode === 'unavailable'
            ? undefined
            : {
                registerTool(tool, { signal }) {
                  if (tool.name === 'relay_stage_draft') {
                    if (mode === 'throw') throw Error('Registration refused');
                    if (mode === 'reject')
                      return Promise.reject(Error('Registration refused'));
                  }
                  active.set(tool.name, tool);
                  signal.addEventListener('abort', () =>
                    active.delete(tool.name),
                  );
                },
              },
      },
      window,
      fetch: async (...args) => {
        requests.push(args);
        return response();
      },
    };
    // oxlint-disable-next-line typescript/no-implied-eval -- run the actual hook with isolated host dependencies
    const useRelayTools = new Function(
      ...Object.keys(deps),
      `${source}\nreturn useRelayTools;`,
    )(...Object.values(deps));
    useRelayTools(
      async () => {},
      (name, result) => callbacks.push({ name, result }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      statuses.at(-1),
      mode === 'throw' || mode === 'reject' ? 'failed' : mode,
    );
    assert.equal(Object.keys(window.relay).length, 15);
    assert.equal(window.relay.relay_approve_application, undefined);

    const result = await window.relay.relay_read_workspace({});
    assert.deepEqual(callbacks, [{ name: 'relay_read_workspace', result }]);
    assert.equal(requests.length, 1);
    if (mode === 'registered') {
      await active.get('relay_read_workspace').execute({});
      assert.equal(
        callbacks.length,
        2,
        'one callback per transport invocation',
      );
    } else {
      assert.equal(active.size, 0);
    }

    const before = callbacks.slice();
    const beforeRequests = requests.length;
    response = () =>
      Response.json(
        { error: 'Fictional quota refusal.', code: 'usage_limit' },
        {
          status: 429,
          headers: { 'Retry-After': '60' },
        },
      );
    await assert.rejects(
      window.relay.relay_preview_import({ rows: [] }),
      (error) => {
        assert.deepEqual(JSON.parse(error.message), {
          error: 'Fictional quota refusal.',
          status: 429,
          code: 'usage_limit',
          retry_after: '60',
        });
        return true;
      },
    );
    assert.equal(
      requests.length,
      beforeRequests + 1,
      'refusals are never retried',
    );
    assert.deepEqual(
      callbacks,
      before,
      'a refusal is not a successful verb result',
    );
    cleanup();
    assert.equal(window.relay, undefined);
    assert.equal(active.size, 0);
  });
}

void test(
  'relay_wait_for_application returns even if display refresh never settles',
  { timeout: 2_000 },
  async () => {
    const pin = {
      job: 'job-a',
      preparation_revision: 'rev-1',
      id: 'op-1',
      digest: 'd'.repeat(64),
      actor: 'Fictional applying agent',
    };
    const snapshot = {
      viewer: 'owner-a',
      job_id: pin.job,
      preparation_revision: pin.preparation_revision,
      destination: 'https://employer.example/jobs/a',
      fields: [],
      files: [],
      ready: true,
      armed: true,
      operation_id: pin.id,
      digest: pin.digest,
      state: 'authorized',
      accept_enabled: false,
      recorded_result: null,
      recorded_receipt: null,
    };
    const window = {};
    const requests = [];
    let cleanup;
    const deps = {
      useEffect: (effect) => {
        cleanup = effect();
      },
      useState: () => ['checking', () => {}],
      stageDraft,
      readApplicationContext,
      createApplicationWait,
      document: { modelContext: undefined },
      window,
      fetch: async (url) => {
        requests.push(url);
        if (String(url).includes('/api/workspace'))
          return Response.json({ viewer: 'owner-a', jobs: [] });
        return Response.json(snapshot);
      },
    };
    // oxlint-disable-next-line typescript/no-implied-eval -- run the actual hook with isolated host dependencies
    const useRelayTools = new Function(
      ...Object.keys(deps),
      `${source}\nreturn useRelayTools;`,
    )(...Object.values(deps));
    useRelayTools(() => new Promise(() => {}));
    await new Promise((resolve) => setImmediate(resolve));
    const result = await window.relay.relay_wait_for_application(pin);
    assert.equal(result.authorized, true);
    assert.equal(result.id, pin.id);
    cleanup();
  },
);
