import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clickFixtureSubmit,
  fillFixtureFields,
  readFixtureReceipt,
} from '../extensions/operative/fill.js';
import { fillFixtureTab } from '../extensions/operative/fill-run.js';

function ioFrom(handlers) {
  return {
    inspect: handlers.inspect,
    execute: handlers.execute,
    now: handlers.now || Date.now,
    sleep: handlers.sleep || (async () => {}),
    receiptWaitMs: handlers.receiptWaitMs ?? 0,
  };
}

void test('a throw after Submit click is uncertain and never fills 0', async () => {
  const result = await fillFixtureTab(
    ioFrom({
      inspect: async () => ({ ok: true }),
      async execute(_tabId, func) {
        if (func === fillFixtureFields) return { result: { ok: true } };
        if (func === clickFixtureSubmit) return { result: { ok: true } };
        if (func === readFixtureReceipt) throw new Error('No tab with id: 42');
        throw new Error(`unexpected ${func.name}`);
      },
      now: () => 0,
      receiptWaitMs: 50,
    }),
    42,
    [{ label: 'Full name', value: 'Avery Example' }],
    'https://employer.example/jobs/operative',
  );
  assert.equal(result.fills, 1);
  assert.equal(result.submitted, false);
  assert.equal(result.uncertain, true);
  assert.equal(result.code, 'uncertain');
  assert.match(result.note, /No tab with id: 42/);
});

void test('a throw from the Submit click itself is uncertain', async () => {
  const result = await fillFixtureTab(
    ioFrom({
      inspect: async () => ({ ok: true }),
      async execute(_tabId, func) {
        if (func === fillFixtureFields) return { result: { ok: true } };
        if (func === clickFixtureSubmit) throw new Error('No tab with id: 42');
        throw new Error('must not read a receipt');
      },
    }),
    42,
    [{ label: 'Full name', value: 'Avery Example' }],
    'https://employer.example/jobs/operative',
  );
  assert.equal(result.fills, 1);
  assert.equal(result.uncertain, true);
  assert.equal(result.submitted, false);
});

void test('inspect failure before click stays fills 0', async () => {
  const result = await fillFixtureTab(
    ioFrom({
      inspect: async () => ({
        ok: false,
        code: 'not_fixture',
        error: 'Fixture submit control not found.',
      }),
      execute() {
        throw new Error('must not fill');
      },
    }),
    42,
    [{ label: 'Full name', value: 'Avery Example' }],
    'https://employer.example/jobs/operative',
  );
  assert.equal(result.fills, 0);
  assert.equal(result.submitted, false);
  assert.equal(result.uncertain, undefined);
  assert.equal(result.code, 'not_fixture');
});
