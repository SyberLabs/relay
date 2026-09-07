import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { generateKeyPair, SignJWT } from 'jose';
import {
  reserve,
  usageGuard,
  bodyGuard,
  boundedBody,
  principalKey,
} from '../deploy/security.mjs';
import { verifyToken, captchaPage } from '../deploy/captcha.mjs';
import { handleRequest } from '../deploy/handler.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      // D1 accepts positional ?1 binds; node:sqlite treats them as named.
      function bound(args) {
        const params = sql.includes('?1')
          ? [Object.fromEntries(args.map((v, i) => [String(i + 1), v]))]
          : args;
        return {
          async first() {
            return statement.get(...params) ?? null;
          },
          async run() {
            return statement.run(...params);
          },
          async all() {
            return { results: statement.all(...params) };
          },
        };
      }
      return { bind: (...args) => bound(args), ...bound([]) };
    },
  };
}
const now = Date.UTC(2026, 8, 6, 12);
function request(
  method = 'GET',
  path = '/api/workspace',
  owner = 'cloudflare:alice',
  body,
) {
  return new Request(`https://relay.example${path}`, {
    method,
    headers: { 'oai-authenticated-user-id': owner },
    ...(body === undefined ? {} : { body }),
  });
}

void test('migrations apply once; atomic reservations never exceed a shared cap and reset in place', async () => {
  const db = database();
  const replies = await Promise.all(
    Array.from({ length: 100 }, () => reserve(db, 'global', 'day-1', 10, 50)),
  );
  assert.equal(replies.filter(Boolean).length, 5);
  assert.equal(await reserve(db, 'global', 'day-1', 1, 50), null);
  assert.equal((await reserve(db, 'global', 'day-2', 1, 50)).used, 1);
  assert.equal(await reserve(db, 'global', 'day-1', 1, 50), null);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM security_counters').get().n,
    1,
  );
  db.sqlite.close();
});

void test('all routes share user throttles, users stay isolated, and expensive planning has a tighter limit', async () => {
  const db = database(),
    env = { DB: db };
  for (let i = 0; i < 6; i++)
    assert.equal(await usageGuard(request('GET', '/api/plan'), env, now), null);
  assert.equal(
    (await usageGuard(request('GET', '/api/plan'), env, now)).status,
    429,
  );
  assert.equal(
    await usageGuard(request('GET', '/api/plan', 'cloudflare:bob'), env, now),
    null,
  );
  for (let i = 0; i < 113; i++)
    assert.equal(
      await usageGuard(request('GET', '/future/route'), env, now),
      null,
    );
  assert.equal((await usageGuard(request(), env, now)).status, 429);
  assert.equal(await usageGuard(request(), env, now + 60_000), null);
  db.sqlite.close();
});

void test('daily and global quotas reject before work; month cap survives daily resets', async () => {
  const db = database(),
    env = { DB: db },
    req = request();
  const user = await principalKey(req);
  await reserve(
    db,
    `${user}:day`,
    String(Math.floor(now / 86_400_000)),
    3000,
    3000,
  );
  assert.equal((await usageGuard(req, env, now)).status, 429);
  await reserve(db, 'global:month', '2026-09', 2_000_000, 2_000_000);
  assert.equal(
    (
      await usageGuard(
        request('GET', '/api/profile', 'cloudflare:bob'),
        env,
        now + 86_400_000,
      )
    ).status,
    429,
  );
  assert.equal(
    await usageGuard(
      request('GET', '/api/profile', 'cloudflare:bob'),
      env,
      Date.UTC(2026, 9, 1),
    ),
    null,
  );
  db.sqlite.close();
});

void test('sustained writes require unexpired owner verification, which never overrides quotas', async () => {
  const db = database(),
    env = { DB: db },
    req = request('POST');
  for (let i = 0; i < 20; i++)
    assert.equal(await usageGuard(req, env, now), null);
  const later = now + 60_000;
  const blocked = await usageGuard(req, env, later);
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).verification_url, '/security/check');
  assert.equal(
    await usageGuard(request('POST', '/security/check'), env, later),
    null,
  );
  const user = await principalKey(req);
  db.sqlite
    .prepare('INSERT INTO security_clearances VALUES (?, ?)')
    .run(user, later + 1000);
  assert.equal(await usageGuard(req, env, later), null);
  assert.equal((await usageGuard(req, env, later + 2000)).status, 403);
  db.sqlite.close();
});

void test('bounded bodies reject multibyte/chunked excess and retain exact accepted bytes', async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('😀😀'));
      c.close();
    },
  });
  const chunked = new Request('https://relay.example', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  });
  await assert.rejects(boundedBody(chunked, 7), RangeError);
  const db = database();
  const guarded = await bodyGuard(
    request('POST', '/api/profile', undefined, '{"claim":"fiction"}'),
    { DB: db },
  );
  assert.equal(await guarded.text(), '{"claim":"fiction"}');
  const oversized = await bodyGuard(
    request('POST', '/api/profile', undefined, 'x'.repeat(256001)),
    { DB: db },
  );
  assert.equal(oversized.status, 413);
  db.sqlite.close();
});

void test('lifetime byte quota and pause switches prevent further writes', async () => {
  const db = database(),
    req = request('POST', '/api/profile', undefined, 'abc');
  const user = await principalKey(req);
  await reserve(db, `${user}:bytes`, 'lifetime', 99_999_999, 100_000_000);
  assert.equal((await bodyGuard(req, { DB: db })).status, 429);
  assert.equal(
    (await usageGuard(request('POST'), { DB: db, RELAY_PAUSE: 'writes' }, now))
      .status,
    503,
  );
  assert.equal(
    await usageGuard(request(), { DB: db, RELAY_PAUSE: 'writes' }, now),
    null,
  );
  assert.equal(
    (await usageGuard(request(), { DB: db, RELAY_PAUSE: 'all' }, now)).status,
    503,
  );
  db.sqlite.close();
});

void test('storage caps reject inserts atomically but allow updates, deletion, and another owner', () => {
  const db = database();
  const insert = db.sqlite.prepare(
    "INSERT INTO jobs (id, owner, job_key, name, status, updated) VALUES (?, ?, ?, 'Fictional role', 'Held', '2026-09-06')",
  );
  for (let i = 0; i < 500; i++) insert.run(`a${i}`, 'alice', `key${i}`);
  assert.throws(() => insert.run('over', 'alice', 'over'), /storage quota/);
  db.sqlite.prepare("UPDATE jobs SET name='Edited' WHERE id='a0'").run();
  insert.run('bob', 'bob', 'bob-only');
  assert.throws(
    () =>
      db.sqlite.prepare("UPDATE jobs SET owner='alice' WHERE id='bob'").run(),
    /storage quota/,
  );
  db.sqlite.prepare("DELETE FROM jobs WHERE id='a0'").run();
  insert.run('replacement', 'alice', 'replacement');
  assert.equal(
    db.sqlite
      .prepare("SELECT count(*) AS n FROM jobs WHERE owner='alice'")
      .get().n,
    500,
  );
  const caps = {
    jobs: 500,
    observations: 5000,
    events: 20000,
    profile_facts: 500,
    style_rules: 500,
    drafts: 5000,
    review_batches: 1000,
    choices: 2000,
    outcomes: 5000,
    refusals: 5000,
  };
  for (const [table, cap] of Object.entries(caps)) {
    for (const kind of ['insert', 'update']) {
      const sql = db.sqlite
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
        )
        .get(`security_${table}_${kind}_quota`).sql;
      assert.match(sql, new RegExp(`LIMIT ${cap + 1}`));
      assert.match(sql, new RegExp(`> ${cap}`));
    }
  }
  db.sqlite.close();
});

void test('CAPTCHA fails closed on missing secrets, token failure/replay, wrong action/host, and provider errors', async () => {
  const env = {
    TURNSTILE_SECRET_KEY: 'fictional',
    TURNSTILE_HOSTNAME: 'relay.example',
  };
  const valid = {
    success: true,
    hostname: 'relay.example',
    action: 'relay_write',
  };
  assert.equal(
    await verifyToken('token', env, async () => Response.json(valid)),
    true,
  );
  for (const result of [
    { ...valid, success: false },
    { ...valid, action: 'login' },
    { ...valid, hostname: 'attacker.example' },
    {},
  ]) {
    assert.equal(
      await verifyToken('token', env, async () => Response.json(result)),
      false,
    );
  }
  await assert.rejects(
    verifyToken('token', {}, async () => {
      throw Error('must not call');
    }),
  );
  await assert.rejects(
    verifyToken('token', env, async () => new Response(null, { status: 500 })),
  );
  assert.equal(
    await verifyToken('x'.repeat(2049), env, async () => {
      throw Error('must not call');
    }),
    false,
  );
  assert.equal(
    (await captchaPage(request('GET', '/security/check'), {})).status,
    503,
  );
  const page = await captchaPage(request('GET', '/security/check'), {
    ...env,
    TURNSTILE_SITE_KEY: 'fictional',
  });
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get('content-security-policy'),
    /style-src 'unsafe-inline'/,
  );
  assert.equal(
    (
      await captchaPage(request('POST', '/security/check'), {
        ...env,
        TURNSTILE_SITE_KEY: 'fictional',
      })
    ).status,
    403,
  );
});

void test('real gateway protects anonymous, static, dynamic, and future routes; missing bindings fail closed', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const db = database();
  const env = {
    DB: db,
    ACCESS_ISSUER: 'https://relay.cloudflareaccess.com',
    ACCESS_AUD: 'a'.repeat(64),
    TURNSTILE_SITE_KEY: 'fictional',
    TURNSTILE_SECRET_KEY: 'fictional',
    EDGE_RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    ASSETS: {
      async fetch(req) {
        return new Response('asset', {
          status: /\.(js|svg)$/.test(new URL(req.url).pathname) ? 200 : 404,
        });
      },
    },
  };
  const jwt = await new SignJWT({ sub: 'alice', email: 'alice@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(env.ACCESS_ISSUER)
    .setAudience(env.ACCESS_AUD)
    .setExpirationTime('5m')
    .sign(privateKey);
  let calls = 0;
  const app = {
    async fetch(req) {
      calls++;
      assert.equal(
        req.headers.get('oai-authenticated-user-id'),
        'cloudflare:alice',
      );
      return new Response('ok');
    },
  };
  const req = (path) =>
    new Request(`https://relay.example${path}`, {
      headers: {
        'Cf-Access-Jwt-Assertion': jwt,
        'oai-authenticated-user-id': 'victim',
      },
    });
  assert.equal(
    (await handleRequest(req('/future'), env, {}, app, publicKey)).status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await handleRequest(req('/logo.svg'), env, {}, app, publicKey)).status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await handleRequest(req('/assets/file.js'), env, {}, app, publicKey))
      .status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await handleRequest(
        req('/future'),
        { ...env, DB: null },
        {},
        app,
        publicKey,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleRequest(
        req('/future'),
        { ...env, EDGE_RATE_LIMITER: null },
        {},
        app,
        publicKey,
      )
    ).status,
    503,
  );
  const limited = {
    ...env,
    EDGE_RATE_LIMITER: {
      async limit() {
        return { success: false };
      },
    },
  };
  assert.equal(
    (await handleRequest(req('/healthz'), limited, {}, app, publicKey)).status,
    429,
  );
  assert.equal(
    (await handleRequest(req('/assets/file.js'), limited, {}, app, publicKey))
      .status,
    429,
  );
  assert.equal(
    (
      await handleRequest(
        new Request('https://relay.example/future'),
        env,
        {},
        app,
        publicKey,
      )
    ).status,
    401,
  );
  for (const path of [
    '/security/check',
    '/security/check/',
    '/security%2Fcheck',
  ]) {
    const response = await handleRequest(req(path), env, {}, app, publicKey);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /cf-turnstile/);
  }
  assert.equal(
    (await handleRequest(req('/%E0%A4%A'), env, {}, app, publicKey)).status,
    400,
  );
  for (const { path, headers, config, status } of [
    { path: '/security/check', headers: { 'Cf-Access-Jwt-Assertion': jwt }, config: env, status: 403 },
    { path: '/api/workspace', headers: {}, config: env, status: 401 },
    { path: '/api/workspace', headers: {}, config: {}, status: 503 },
    { path: '/api/applications', headers: {}, config: env, status: 401 },
    { path: '/api/applications', headers: { 'Cf-Access-Jwt-Assertion': jwt }, config: { ...env, RELAY_PAUSE: 'writes' }, status: 503 },
    { path: '/api/applications', headers: { 'Cf-Access-Jwt-Assertion': jwt }, config: { ...env, DB: null }, status: 503 },
    { path: '/signin-with-chatgpt', headers: { 'Cf-Access-Jwt-Assertion': jwt }, config: env, status: 302 },
  ]) {
    let cancelled = false;
    const upload = new Request(`https://relay.example${path}`, {
      method: 'POST', headers, duplex: 'half',
      body: new ReadableStream({
        pull(controller) { controller.enqueue(new Uint8Array(1_000_000)); },
        cancel() { cancelled = true; },
      }),
    });
    assert.equal((await handleRequest(upload, config, {}, app, publicKey)).status, status);
    assert.equal(cancelled, true, `${path} must cancel its bounded drain`);
  }
  assert.equal(calls, 1);
  db.sqlite.close();
});

void test('encoded and trailing-slash planner routes share the same expensive throttle', async () => {
  const db = database();
  for (let i = 0; i < 6; i++)
    assert.equal(
      await usageGuard(request('GET', '/api/plan'), { DB: db }, now),
      null,
    );
  for (const path of ['/api/plan/', '/api/%70lan', '/api//plan']) {
    assert.equal(
      (await usageGuard(request('GET', path), { DB: db }, now)).status,
      429,
    );
  }
  db.sqlite.close();
});

void test('successful CAPTCHA grants only the authenticated owner a bounded clearance; replay grants nothing', async (t) => {
  const db = database();
  const env = {
    DB: db,
    TURNSTILE_SITE_KEY: 'fictional',
    TURNSTILE_SECRET_KEY: 'fictional',
    TURNSTILE_HOSTNAME: 'relay.example',
  };
  let used = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(
      url,
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    assert.equal(options.body.get('response'), 'single-use-token');
    const success = !used;
    used = true;
    return Response.json({
      success,
      hostname: 'relay.example',
      action: 'relay_write',
    });
  });
  const submit = () =>
    new Request('https://relay.example/security/check', {
      method: 'POST',
      headers: {
        origin: 'https://relay.example',
        'oai-authenticated-user-id': 'cloudflare:alice',
      },
      body: new URLSearchParams({
        'cf-turnstile-response': 'single-use-token',
      }),
    });
  const before = Date.now();
  const response = await captchaPage(submit(), env);
  assert.equal(response.status, 303);
  const rows = db.sqlite.prepare('SELECT * FROM security_clearances').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner, await principalKey(submit()));
  assert.ok(
    rows[0].expires >= before + 3_600_000 &&
      rows[0].expires <= Date.now() + 3_600_000,
  );
  assert.equal((await captchaPage(submit(), env)).status, 403);
  assert.deepEqual(
    db.sqlite.prepare('SELECT * FROM security_clearances').all(),
    rows,
  );
  db.sqlite.close();
});

void test('oversized declared bodies are consumed to the byte boundary and cancelled before refusal', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1, 2])); },
    cancel() { cancelled = true; },
  });
  const req = new Request('https://relay.example/api/workspace', {
    method: 'POST', headers: { 'content-length': '2' }, body, duplex: 'half',
  });
  await assert.rejects(boundedBody(req, 1), RangeError);
  assert.equal(cancelled, true);
});
