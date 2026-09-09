import test from 'node:test';
import assert from 'node:assert/strict';
import { relayPageFetch } from '../extensions/operative/page-fetch.js';

function withGlobals({ origin, fetch }, work) {
  const previousLocation = globalThis.location;
  const previousFetch = globalThis.fetch;
  globalThis.location = { origin };
  globalThis.fetch = fetch;
  return Promise.resolve()
    .then(work)
    .finally(() => {
      if (previousLocation === undefined) delete globalThis.location;
      else globalThis.location = previousLocation;
      if (previousFetch === undefined) delete globalThis.fetch;
      else globalThis.fetch = previousFetch;
    });
}

void test('Relay page fetch refuses chrome-extension origin without calling fetch', async () => {
  let called = 0;
  await withGlobals(
    {
      origin: 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef',
      fetch: async () => {
        called += 1;
        throw new Error('must not fetch');
      },
    },
    async () => {
      const result = await relayPageFetch('/api/applications', {
        action: 'begin',
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 403);
      assert.equal(result.json.code, 'extension_origin');
      assert.equal(called, 0);
    },
  );
});

void test('Relay page fetch uses same-origin cookies on the page origin', async () => {
  const requests = [];
  await withGlobals(
    {
      origin: 'http://127.0.0.1:4173',
      fetch: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({ viewer: 'owner-1' }),
        };
      },
    },
    async () => {
      const result = await relayPageFetch('/api/workspace');
      assert.equal(result.ok, true);
      assert.equal(result.json.viewer, 'owner-1');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, '/api/workspace');
      assert.equal(requests[0].init.credentials, 'same-origin');
      assert.equal(requests[0].init.redirect, 'error');
      assert.equal(requests[0].init.method, 'GET');
    },
  );
});

void test('Relay page fetch refuses a different URL origin', async () => {
  let called = 0;
  await withGlobals(
    {
      origin: 'http://127.0.0.1:4173',
      fetch: async () => {
        called += 1;
        throw new Error('must not fetch a foreign origin');
      },
    },
    async () => {
      const result = await relayPageFetch(
        'https://untrusted.example/api/applications',
        { action: 'begin' },
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, 403);
      assert.equal(called, 0);
    },
  );
});
