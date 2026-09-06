import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as helper from '../lib/workspace-refresh.ts';

void test('a refresh cannot restore records after a synchronous expiry callback', async () => {
  const source = readFileSync('app/workspace.tsx', 'utf8');
  const expirySource = source.match(
    /const applyExpired = useCallback\(([\s\S]*?), \[\]\);/,
  )[1];
  const refreshSource = source.match(
    /const refresh = useCallback\(([\s\S]*?),\s*\[applyExpired\],\s*\);/,
  )[1];
  function deferred() {
    let resolve;
    const promise = new Promise((accept) => {
      resolve = accept;
    });
    return { promise, resolve };
  }
  for (let gap = 0; gap < 20; gap++) {
    const get = deferred(),
      post = deferred();
    const session = helper.createWorkspaceSession();
    const state = { jobs: [], editor: null, signedOut: false };
    const deps = {
      ...helper,
      selectedRef: { current: '' }, sessionRef: { current: session },
      fetch: async (_url, init) =>
        init?.method === 'POST' ? post.promise : get.promise,
    };
    for (const key of [
      'jobs',
      'sources',
      'events',
      'editor',
      'importText',
      'previewedImport',
      'report',
      'showImport',
      'signedOut',
      'loaded',
      'message',
    ]) {
      deps['set' + key[0].toUpperCase() + key.slice(1)] = (value) => {
        state[key] = typeof value === 'function' ? value(state[key]) : value;
      };
    }
    const bind = (text) => {
      const compiled = stripTypeScriptTypes(text, { mode: 'transform' })
        .trim()
        .replace(/;$/, '');
      // oxlint-disable-next-line typescript/no-implied-eval -- exercise the actual Workspace callback
      return new Function(...Object.keys(deps), 'return (' + compiled + ');')(
        ...Object.values(deps),
      );
    };
    deps.applyExpired = bind(expirySource);
    const refresh = bind(refreshSource);
    const pendingRefresh = refresh();
    // A child importer can synchronously apply expiry after its fetch, without
    // the additional processMutation continuation used by Workspace.run.
    const pendingExpiry = (async () => {
      const response = await deps.fetch('/api/workspace', { method: 'POST' });
      if (response.status === 401) {
        helper.expireSession(session);
        deps.applyExpired();
      }
    })();
    get.resolve(
      new Response(
        JSON.stringify({
          jobs: [
            { id: 'private', version: 1, draft: 'private text', blocker: '' },
          ],
          sources: [],
          events: [],
        }),
      ),
    );
    for (let tick = 0; tick < gap; tick++) await Promise.resolve();
    post.resolve(new Response('Unauthorized', { status: 401 }));
    await Promise.all([pendingRefresh, pendingExpiry]);
    assert.equal(state.signedOut, true, `gap ${gap}`);
    assert.deepEqual(state.jobs, [], `gap ${gap}`);
  }
});
