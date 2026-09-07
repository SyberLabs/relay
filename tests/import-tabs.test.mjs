import test from 'node:test';
import assert from 'node:assert/strict';
import { importTabButtonId, importTabFromKey } from '../lib/import-tabs.ts';

void test('arrow, home and end keys move between import tabs', () => {
  assert.equal(importTabFromKey('json', 'ArrowRight'), 'csv');
  assert.equal(importTabFromKey('csv', 'ArrowRight'), 'json');
  assert.equal(importTabFromKey('csv', 'ArrowLeft'), 'json');
  assert.equal(importTabFromKey('json', 'ArrowLeft'), 'csv');
  assert.equal(importTabFromKey('json', 'Home'), 'json');
  assert.equal(importTabFromKey('csv', 'Home'), 'json');
  assert.equal(importTabFromKey('json', 'End'), 'csv');
  assert.equal(importTabFromKey('json', 'Tab'), null);
  assert.equal(importTabFromKey('json', 'Enter'), null);
  assert.equal(importTabButtonId('json'), 'import-tab-json');
  assert.equal(importTabButtonId('csv'), 'import-tab-csv');
});
