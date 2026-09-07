import test from 'node:test';
import assert from 'node:assert/strict';
import { smokeRelease, SMOKE_RETRY_DELAY_MS, SMOKE_RETRY_WINDOW_MS } from '../scripts/release/smoke.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const origin = 'https://relay-production.example.workers.dev';
const env = {
  DEPLOY_URL: origin,
  RELEASE_SHA: sha,
  ACCESS_CLIENT_ID: 'smoke-client-id',
  ACCESS_CLIENT_SECRET: 'smoke-client-secret',
};
const endpoints = [
  { path: '/healthz', expectedStatus: 'ok' },
  { path: '/readyz', expectedStatus: 'ready' },
];

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

function expectedBody(path) {
  return path === '/healthz' ? { status: 'ok', release: sha } : { status: 'ready', release: sha };
}

async function assertFailsWithoutRetry(target, invalidBody) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    seen.push(path);
    if (path === '/healthz') {
      assertAccessHeaders(init, 'error');
      if (target.path === '/readyz') return jsonResponse(200, expectedBody('/healthz'));
    } else {
      assertAccessHeaders(init, path === '/api/workspace' ? 'manual' : 'error');
    }
    if (path === target.path && seen.filter((entry) => entry === target.path).length === 1) {
      return jsonResponse(200, invalidBody);
    }
    assert.fail(`must not request ${path} after invalid ${target.path}`);
  };
  await assert.rejects(
    () => smokeRelease({
      env,
      fetchImpl,
      sleep: async () => assert.fail(`must not sleep after invalid ${target.path}`),
      now: () => 0,
    }),
    new RegExp(`${target.path} did not return the expected release`),
  );
  assert.deepEqual(seen, target.path === '/healthz' ? ['/healthz'] : ['/healthz', '/readyz']);
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
      return jsonResponse(200, expectedBody(path));
    }
    if (path === '/readyz') {
      assertAccessHeaders(init, 'error');
      if (hits[path] < 2) return new Response('', { status: 404 });
      return jsonResponse(200, expectedBody(path));
    }
    assert.equal(path, '/api/workspace');
    assertAccessHeaders(init, 'manual');
    return new Response('', { status: 401 });
  };
  await smokeRelease({ env, fetchImpl, sleep: time.sleep, now: time.now });
  assert.deepEqual(hits, { '/healthz': 3, '/readyz': 2, '/api/workspace': 1 });
  assert.equal(time.elapsed(), SMOKE_RETRY_DELAY_MS * 3);
});

void test('a different 40-hex release with the expected endpoint status can retry and converge', async () => {
  const time = clock();
  const hits = { '/healthz': 0, '/readyz': 0, '/api/workspace': 0 };
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    hits[path] += 1;
    if (path === '/healthz' || path === '/readyz') {
      assertAccessHeaders(init, 'error');
      const expected = expectedBody(path);
      if (hits[path] < (path === '/healthz' ? 3 : 2)) return jsonResponse(200, { ...expected, release: other });
      return jsonResponse(200, expected);
    }
    assert.equal(path, '/api/workspace');
    assertAccessHeaders(init, 'manual');
    return new Response('', { status: 401 });
  };
  await smokeRelease({ env, fetchImpl, sleep: time.sleep, now: time.now });
  assert.deepEqual(hits, { '/healthz': 3, '/readyz': 2, '/api/workspace': 1 });
  assert.equal(time.elapsed(), SMOKE_RETRY_DELAY_MS * 3);
});

void test('empty, malformed, missing, and non-string releases fail immediately on both endpoints', async () => {
  const cases = [
    { release: '' },
    { release: 'not-a-sha' },
    { release: 'c'.repeat(39) },
    { release: 'c'.repeat(41) },
    { release: 'C'.repeat(40) },
    {},
    { release: 1 },
    { release: null },
  ];
  for (const endpoint of endpoints) {
    for (const body of cases) {
      await assertFailsWithoutRetry(endpoint, { ...body, status: endpoint.expectedStatus });
    }
  }
});

void test('a different 40-hex release with missing or unexpected status fails immediately on both endpoints', async () => {
  for (const endpoint of endpoints) {
    const unexpected = endpoint.path === '/healthz' ? 'ready' : 'ok';
    await assertFailsWithoutRetry(endpoint, { release: other });
    await assertFailsWithoutRetry(endpoint, { status: unexpected, release: other });
    await assertFailsWithoutRetry(endpoint, { status: 'error', release: other });
  }
});

void test('401, 403, and 500 fail immediately on both endpoints', async () => {
  for (const status of [401, 403, 500]) {
    for (const target of endpoints) {
      const seen = [];
      const fetchImpl = async (url) => {
        const path = new URL(url).pathname;
        seen.push(path);
        if (path === '/healthz' && target.path === '/readyz') return jsonResponse(200, expectedBody(path));
        if (path === target.path && seen.filter((entry) => entry === target.path).length === 1) {
          return new Response('', { status });
        }
        assert.fail(`must not request ${path} after ${status} on ${target.path}`);
      };
      await assert.rejects(
        () => smokeRelease({
          env,
          fetchImpl,
          sleep: async () => assert.fail('must not sleep'),
          now: () => 0,
        }),
        new RegExp(`${target.path} returned ${status}`),
      );
      assert.deepEqual(seen, target.path === '/healthz' ? ['/healthz'] : ['/healthz', '/readyz']);
    }
  }
});

void test('matching SHA with the wrong readiness status fails without retry', async () => {
  for (const endpoint of endpoints) {
    const unexpected = endpoint.path === '/healthz' ? 'ready' : 'ok';
    await assertFailsWithoutRetry(endpoint, { status: unexpected, release: sha });
  }
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

void test('a persistent different 40-hex release fails after that endpoint window', async () => {
  for (const endpoint of endpoints) {
    const time = clock();
    const hits = { '/healthz': 0, '/readyz': 0, '/api/workspace': 0 };
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      hits[path] += 1;
      if (path === '/healthz' && endpoint.path === '/readyz') return jsonResponse(200, expectedBody(path));
      if (path === endpoint.path) {
        return jsonResponse(200, { status: endpoint.expectedStatus, release: other });
      }
      assert.fail(`must not request ${path}`);
    };
    await assert.rejects(
      () => smokeRelease({ env, fetchImpl, sleep: time.sleep, now: time.now }),
      new RegExp(`${endpoint.path} did not return the expected release \\(${endpoint.expectedStatus}, ${other}\\)`),
    );
    assert.equal(time.elapsed(), SMOKE_RETRY_WINDOW_MS);
    if (endpoint.path === '/healthz') {
      assert.equal(hits['/healthz'], SMOKE_RETRY_WINDOW_MS / SMOKE_RETRY_DELAY_MS + 1);
      assert.equal(hits['/readyz'], 0);
    } else {
      assert.equal(hits['/healthz'], 1);
      assert.equal(hits['/readyz'], SMOKE_RETRY_WINDOW_MS / SMOKE_RETRY_DELAY_MS + 1);
    }
  }
});

void test('workspace access through the service token does not retry', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const path = new URL(url).pathname;
    if (path === '/healthz' || path === '/readyz') return jsonResponse(200, expectedBody(path));
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
