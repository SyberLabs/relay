import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../extensions/operative/', import.meta.url);
const mailboxFiles = ['background.js', 'popup.js', 'run.js'];

function source(name) {
  return readFileSync(new URL(name, root), 'utf8');
}

void test('mailbox scripts never fetch Relay APIs or touch cookies', () => {
  for (const name of mailboxFiles) {
    const text = source(name);
    assert.equal(
      /chrome\.cookies/.test(text),
      false,
      `${name} must not use chrome.cookies`,
    );
    assert.equal(
      /\bfetch\s*\(/.test(text),
      false,
      `${name} must not fetch; Relay calls run in the signed-in page`,
    );
    assert.equal(
      /externally_connectable/.test(text),
      false,
      `${name} must not open an externally_connectable employer channel`,
    );
  }
});

void test('MV3 manifest is a mailbox with scripting, not cookies', () => {
  const manifest = JSON.parse(source('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions.includes('scripting'), true);
  assert.equal(manifest.permissions.includes('tabs'), true);
  assert.equal(manifest.permissions.includes('activeTab'), true);
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.equal(manifest.permissions.includes('debugger'), false);
  assert.equal(
    manifest.permissions.every((name) =>
      ['activeTab', 'scripting', 'tabs'].includes(name),
    ),
    true,
  );
  assert.equal(manifest.host_permissions?.includes('<all_urls>'), false);
  assert.equal(manifest.host_permissions?.some((rule) => rule.startsWith('https:')), false);
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*']);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.background?.service_worker, 'background.js');
  const packed = JSON.stringify(manifest);
  assert.equal(/chrome-extension/.test(packed), false);
});

void test('background inspects the fixture control before writing fields', () => {
  const text = source('background.js');
  const fn = text.slice(text.indexOf('async function fillFixtureTab'));
  const inspectAt = fn.indexOf('inspectOnTab');
  const fillAt = fn.indexOf('fillFixtureFields');
  assert.ok(inspectAt >= 0 && fillAt > inspectAt);
});

void test('extension directory stays first-party and fictional-fixture scoped', () => {
  const names = readdirSync(fileURLToPath(root));
  assert.equal(names.includes('manifest.json'), true);
  for (const name of names) {
    if (
      !name.endsWith('.js') &&
      !name.endsWith('.html') &&
      name !== 'manifest.json'
    )
      continue;
    const text = readFileSync(join(fileURLToPath(root), name), 'utf8');
    assert.equal(/greenhouse|lever\.co/i.test(text), false, name);
  }
});
