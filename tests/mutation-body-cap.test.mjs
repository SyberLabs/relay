import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import {
  jsonCharsTooLarge,
  refuseUntrustedOrigin,
} from '../lib/request-origin.ts';

function handler(route, signedIn = true) {
  const source = readFileSync(
    new URL(`../app/api/${route}/route.ts`, import.meta.url),
    'utf8',
  );
  // Run the actual route body with isolated auth/storage dependencies. These
  // handler checks supplement the separate production gateway byte-limit tests.
  const code = stripTypeScriptTypes(
    source
      .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
      .replace(/export /g, ''),
  );
  const calls = { parse: 0, database: 0 };
  const deps = {
    getChatGPTUser: async () =>
      signedIn ? { userId: 'fictional-body-cap-reviewer' } : null,
    database: () => {
      calls.database++;
      throw Error('Refused requests must not open the database.');
    },
    jsonCharsTooLarge,
    refuseUntrustedOrigin,
    JSON: {
      parse(raw) {
        calls.parse++;
        return JSON.parse(raw);
      },
    },
  };
  // oxlint-disable-next-line typescript/no-implied-eval -- compile the actual route with isolated dependencies
  const POST = new Function(...Object.keys(deps), `${code}\nreturn POST;`)(
    ...Object.values(deps),
  );
  return { POST, calls };
}

for (const route of ['outcomes', 'preferences']) {
  void test(`${route} refuses a large declared body before reading or parsing`, async () => {
    const { POST, calls } = handler(route);
    const request = new Request(`https://relay.example/api/${route}`, {
      method: 'POST',
      headers: { 'content-length': '2000001' },
      body: '{"action":"record"}',
    });
    let reads = 0;
    request.text = async () => {
      reads++;
      throw Error('Oversized declared bodies must not be read.');
    };
    const response = await POST(request);
    assert.equal(response.status, 413);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Request too large.' });
    assert.equal(reads, 0);
    assert.deepEqual(calls, { parse: 0, database: 0 });
  });

  void test(`${route} refuses an oversized body without a length header before parse or database work`, async () => {
    const { POST, calls } = handler(route);
    const request = new Request(`https://relay.example/api/${route}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'record', padding: 'x'.repeat(2000001) }),
    });
    assert.equal(request.headers.get('content-length'), null);
    const response = await POST(request);
    assert.equal(response.status, 413);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Request too large.' });
    assert.deepEqual(calls, { parse: 0, database: 0 });
  });

  void test(`${route} keeps authentication ahead of the body cap`, async () => {
    const { POST, calls } = handler(route, false);
    const request = new Request(`https://relay.example/api/${route}`, {
      method: 'POST',
      headers: { 'content-length': '2000001' },
      body: '{}',
    });
    const response = await POST(request);
    assert.equal(response.status, 401);
    assert.equal(request.bodyUsed, false);
    assert.deepEqual(calls, { parse: 0, database: 0 });
  });
}
