import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { holdLoopbackPorts } from '../scripts/ci/loopback-port.mjs';

function listen(port = 0) {
  const server = createServer();
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => accept(server));
  });
}

function close(server) {
  return new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
}

void test('listen(0) then close publishes a port a competitor can bind', async () => {
  const probe = await listen(0);
  const published = probe.address().port;
  await close(probe);
  const competitor = await listen(published);
  assert.equal(competitor.address().port, published);
  await close(competitor);
});

void test('held loopback ports stay exclusive until release', async () => {
  const held = await holdLoopbackPorts(2);
  try {
    assert.equal(held.ports.length, 2);
    assert.notEqual(held.ports[0], held.ports[1]);
    for (const port of held.ports) {
      await assert.rejects(() => listen(port), { code: 'EADDRINUSE' });
    }
    const extra = await listen(0);
    try {
      assert.ok(!held.ports.includes(extra.address().port));
    } finally {
      await close(extra);
    }
  } finally {
    await held.release();
  }
  for (const port of held.ports) {
    const rebound = await listen(port);
    assert.equal(rebound.address().port, port);
    await close(rebound);
  }
});

void test('development CI holds the loopback port across local D1 execute', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../scripts/ci/run-integration.mjs', import.meta.url)),
    'utf8',
  );
  const d1 = src.indexOf("'d1'");
  const hold = src.indexOf('holdLoopbackPorts(1)');
  const release = src.indexOf('held.release');
  const vinext = src.indexOf("'vinext'");
  assert.ok(d1 >= 0 && hold >= 0 && release >= 0 && vinext >= 0);
  assert.ok(d1 < hold, 'D1 execute must finish before the HTTP port is chosen');
  assert.ok(hold < release && release < vinext);
  assert.doesNotMatch(src, /portProbe\.close/);
});

void test('production CI reserves HTTP and inspector ports instead of inspector-port 0', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../scripts/ci/run-production.mjs', import.meta.url)),
    'utf8',
  );
  const d1 = src.indexOf("'d1'");
  const hold = src.indexOf('holdLoopbackPorts(2)');
  const release = src.indexOf('held.release');
  const wranglerDev = src.indexOf("'dev'");
  assert.ok(d1 >= 0 && hold >= 0 && release >= 0 && wranglerDev >= 0);
  assert.ok(d1 < hold && hold < release && release < wranglerDev);
  assert.doesNotMatch(src, /'--inspector-port',\s*'0'/);
  assert.match(src, /'--inspector-port',\s*String\(inspectorPort\)/);
});
