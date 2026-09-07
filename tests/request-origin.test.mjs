import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jsonCharsTooLarge,
  refuseUntrustedOrigin,
} from '../lib/request-origin.ts';

const hung = { hung: true };

function within(ms, work) {
  return Promise.race([
    work,
    new Promise((resolve) => {
      setTimeout(() => resolve(hung), ms);
    }),
  ]);
}

function post(url, origin, body) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body,
    duplex: 'half',
  });
}

void test('same-origin and missing origin leave the body for the handler', async () => {
  for (const origin of [undefined, 'http://127.0.0.1:8787']) {
    const request = post(
      'http://127.0.0.1:8787/api/workspace',
      origin,
      '{"action":"save"}',
    );
    assert.equal(await refuseUntrustedOrigin(request), null);
    assert.equal(request.bodyUsed, false);
    assert.equal(await request.text(), '{"action":"save"}');
  }
});

void test('untrusted origin refuses without granting the write and consumes the body', async () => {
  let pulls = 0;
  const payload = new TextEncoder().encode('{"action":"save"}');
  const request = post(
    'http://127.0.0.1:8787/api/workspace',
    'https://untrusted.example.com',
    new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(payload);
        controller.close();
      },
    }),
  );
  const response = await refuseUntrustedOrigin(request);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    error: 'Invalid request origin.',
  });
  assert.equal(request.bodyUsed, true);
  assert.ok(pulls > 0, 'origin refusal must read the POST body, not abort it');
});

void test('untrusted origin 403s an oversized body without buffering the remainder', async () => {
  const chunk = new Uint8Array(64 * 1024);
  const total = 4 * 1024 * 1024;
  let pulled = 0;
  const request = post(
    'http://127.0.0.1:8787/api/workspace',
    'https://untrusted.example.com',
    new ReadableStream({
      pull(controller) {
        if (pulled >= total) {
          controller.close();
          return;
        }
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
    }),
  );
  const response = await refuseUntrustedOrigin(request);
  assert.equal(response.status, 403);
  // 2MB plus at most one crossing chunk and one stream prefetch.
  const maxPulled = 2_000_000 + 2 * chunk.byteLength;
  assert.ok(
    pulled <= maxPulled,
    `origin refusal buffered ${pulled} bytes; 2MB drain allows at most ${maxPulled}`,
  );
});

void test('untrusted origin 403s when the body never delivers a chunk', async () => {
  const request = post(
    'http://127.0.0.1:8787/api/workspace',
    'https://untrusted.example.com',
    new ReadableStream({
      start() {
        /* Stay open and never enqueue. */
      },
    }),
  );
  const response = await within(750, refuseUntrustedOrigin(request));
  assert.notEqual(response, hung);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'Invalid request origin.',
  });
});

void test('untrusted origin 403s when body cancel never settles', async () => {
  const chunk = new Uint8Array(64 * 1024);
  const total = 4 * 1024 * 1024;
  let pulled = 0;
  const request = post(
    'http://127.0.0.1:8787/api/workspace',
    'https://untrusted.example.com',
    new ReadableStream({
      pull(controller) {
        if (pulled >= total) {
          controller.close();
          return;
        }
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        return new Promise(() => {});
      },
    }),
  );
  const response = await within(750, refuseUntrustedOrigin(request));
  assert.notEqual(response, hung);
  assert.equal(response.status, 403);
});

void test('json character cap matches drafts: header or body over 2000000', () => {
  assert.equal(jsonCharsTooLarge('2000001', 0), true);
  assert.equal(jsonCharsTooLarge(null, 2000001), true);
  assert.equal(jsonCharsTooLarge('2000000', 2000000), false);
  assert.equal(jsonCharsTooLarge('', 12), false);
});
