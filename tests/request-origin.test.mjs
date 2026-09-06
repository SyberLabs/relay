import test from 'node:test';
import assert from 'node:assert/strict';
import { refuseUntrustedOrigin } from '../lib/request-origin.ts';

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
