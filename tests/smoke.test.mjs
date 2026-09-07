import test from 'node:test';
import assert from 'node:assert/strict';
import { smokeRelease, SMOKE_RETRY_DELAY_MS, SMOKE_RETRY_WINDOW_MS } from '../scripts/release/smoke.mjs';

const sha = 'a'.repeat(40);
const stale = 'b'.repeat(40);
const origin = 'https://relay-production.example.workers.dev';
const env = {
  DEPLOY_URL: origin,
  RELEASE_SHA: sha,
  ACCESS_CLIENT_ID: 'smoke-client-id',
  ACCESS_CLIENT_SECRET: 'smoke-client-secret',
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    elapsed: () => t,
  };
}

function assertAccessHeaders(init, redirect) {
  assert.equal(init.headers['CF-Access-Client-Id'], env.ACCESS_CLIENT_ID);
  assert.equal(init.headers['CF-Access-Client-Secret'], env.ACCESS_CLIENT_SECRET);
  assert.equal(init.redirect, redirect);
  assert.equal(init.cache, 'no-store');
}

void test('protected smoke retries workers.dev 404s until health, readiness, and service isolation succeed', async () => {
  const time = clock();
  const hits = { '/healthz': 0, '/readyz': 0, '/api/workspace': 0 };
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    hits[path] += 1;
    if (path === '/healthz') {
      assertAccessHeaders(init, 'error');
      if (hits[path] < 3) return new Response('', { status: 404 });
      return jsonResponse(200, { status: 'ok', release: sha });
    }
    if (path === '/readyz') {
      assertAccessHeaders(init, 'error');
      if (hits[path] < 2) return new Response('', { status: 404 });
      return jsonResponse(200, { status: 'ready', release: sha });
    }
    assert.equal(path, '/api/workspace');
    assertAccessHeaders(init, 'manual');
    return new Response('', { status: 401 });
  };
  await smokeRelease({ env, fetchImpl, sleep: time.sleep, now: time.now });
  assert.deepEqual(hits, { '/healthz': 3, '/readyz': 2, '/api/workspace': 1 });
  assert.equal(time.elapsed(), SMOKE_RETRY_DELAY_MS * 3);
});

void test('protected smoke retries a prior Worker SHA until the published release is visible', async () => {
  const time = clock();
  const hits = { '/healthz': 0, '/readyz': 0, '/api/workspace': 0 };
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    hits[path] += 1;
    if (path === '/healthz') {
      assertAccessHeaders(init, 'error');
      if (hits[path] < 3) return jsonResponse(200, { status: 'ok', release: stale });
      return jsonResponse(200, { status: 'ok', release: sha });
    }
    if (path === '/readyz') {
      assertAccessHeaders(init, 'error');
      if (hits[path] < 2) return jsonResponse(200, { status: 'ready', release: stale });
      return jsonResponse(200, { status: 'ready', release: sha });
    }
    assert.equal(path, '/api/workspace');
    assertAccessHeaders(init, 'manual');
    return new Response('', { status: 401 });
  };
  await smokeRelease({ env, fetchImpl, sleep: time.sleep, now: time.now });
  assert.deepEqual(hits, { '/healthz': 3, '/readyz': 2, '/api/workspace': 1 });
  assert.equal(time.elapsed(), SMOKE_RETRY_DELAY_MS * 3);
});

void test('401 and 403 on health fail immediately without retrying as routing 404s', async () => {
  for (const status of [401, 403, 500]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('', { status });
    };
    await assert.rejects(
      () => smokeRelease({ env, fetchImpl, sleep: async () => assert.fail('must not sleep'), now: () => 0 }),
      new RegExp(`/healthz returned ${status}`),
    );
    assert.equal(calls, 1);
  }
});

void test('matching SHA with the wrong readiness status fails without retry', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, { status: 'ready', release: sha });
  };
  await assert.rejects(
    () => smokeRelease({ env, fetchImpl, sleep: async () => assert.fail('must not sleep'), now: () => 0 }),
    /\/healthz did not return the expected release \(ready, a{40}\)/,
  );
  assert.equal(calls, 1);
});

void test('persistent 404s fail after the bounded retry window', async () => {
  const time = clock();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('', { status: 404 });
  };
  await assert.rejects(
    () => smokeRelease({ env, fetchImpl, sleep: time.sleep, now: time.now }),
    /\/healthz returned 404/,
  );
  assert.equal(time.elapsed(), SMOKE_RETRY_WINDOW_MS);
  assert.equal(calls, SMOKE_RETRY_WINDOW_MS / SMOKE_RETRY_DELAY_MS + 1);
});

void test('a prior Worker SHA that never updates fails after the bounded retry window', async () => {
  const time = clock();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, { status: 'ok', release: stale });
  };
  await assert.rejects(
    () => smokeRelease({ env, fetchImpl, sleep: time.sleep, now: time.now }),
    new RegExp(`/healthz did not return the expected release \\(ok, ${stale}\\)`),
  );
  assert.equal(time.elapsed(), SMOKE_RETRY_WINDOW_MS);
  assert.equal(calls, SMOKE_RETRY_WINDOW_MS / SMOKE_RETRY_DELAY_MS + 1);
});

void test('workspace access through the service token does not retry', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const path = new URL(url).pathname;
    if (path === '/healthz') return jsonResponse(200, { status: 'ok', release: sha });
    if (path === '/readyz') return jsonResponse(200, { status: 'ready', release: sha });
    return new Response('', { status: 200 });
  };
  await assert.rejects(
    () => smokeRelease({ env, fetchImpl, sleep: async () => assert.fail('must not sleep'), now: () => 0 }),
    /Service token accessed workspace unexpectedly/,
  );
  assert.equal(calls, 3);
});

void test('smoke refuses HTTP origins and missing Access service credentials', async () => {
  await assert.rejects(
    () => smokeRelease({ env: { ...env, DEPLOY_URL: 'http://relay.example' }, fetchImpl: async () => assert.fail('must not fetch') }),
    /HTTPS required/,
  );
  await assert.rejects(
    () => smokeRelease({ env: { ...env, ACCESS_CLIENT_SECRET: '' }, fetchImpl: async () => assert.fail('must not fetch') }),
    /Access service credentials required/,
  );
});
