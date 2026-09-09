import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fillFixtureFields,
  inspectFixtureTab,
} from '../extensions/operative/fill.js';

/* oxlint-disable typescript/no-deprecated -- Node has no page DOM; stubs stand in for Document. */

function withDom({ href, labels, buttons }, work) {
  const previousLocation = globalThis.location;
  const previousDocument = globalThis.document;
  const previousEvent = globalThis.Event;
  if (typeof globalThis.Event !== 'function') {
    globalThis.Event = class Event {
      constructor(type) {
        this.type = type;
        this.bubbles = true;
      }
    };
  }
  globalThis.location = { href };
  const nodes = { labels, buttons };
  globalThis.document = {
    querySelectorAll: (selector) =>
      selector === 'label'
        ? nodes.labels
        : selector === 'button'
          ? nodes.buttons
          : [],
    getElementById: () => null,
    querySelector: () => null,
  };
  try {
    return work();
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousEvent === undefined) delete globalThis.Event;
    else globalThis.Event = previousEvent;
  }
}

function nameInput() {
  return {
    value: '',
    events: [],
    querySelector(selector) {
      return selector.includes('input') ? this : null;
    },
    dispatchEvent(event) {
      this.events.push(event.type);
      return true;
    },
  };
}

void test('inspect refuses a URL that is not the armed destination without reading inputs', () => {
  const input = nameInput();
  const ready = withDom(
    {
      href: 'https://boards.example/jobs/real',
      labels: [{ textContent: 'Full name', querySelector: () => input }],
      buttons: [{ textContent: 'Submit fictional application' }],
    },
    () => inspectFixtureTab('https://employer.example/jobs/operative'),
  );
  assert.equal(ready.ok, false);
  assert.equal(ready.code, 'wrong_host');
  assert.equal(input.value, '');
});

void test('inspect refuses a matching URL that lacks the fictional submit control', () => {
  const input = nameInput();
  const ready = withDom(
    {
      href: 'https://employer.example/jobs/operative',
      labels: [{ textContent: 'Full name', querySelector: () => input }],
      buttons: [{ textContent: 'Apply now' }],
    },
    () => inspectFixtureTab('https://employer.example/jobs/operative'),
  );
  assert.equal(ready.ok, false);
  assert.equal(ready.code, 'not_fixture');
  assert.equal(input.value, '');
});

void test('fill writes only after a separate inspect of the fictional control', () => {
  const input = nameInput();
  const destination = 'https://employer.example/jobs/operative';
  const result = withDom(
    {
      href: destination,
      labels: [{ textContent: 'Full name', querySelector: () => input }],
      buttons: [{ textContent: 'Submit fictional application' }],
    },
    () => {
      const ready = inspectFixtureTab(destination);
      assert.equal(ready.ok, true);
      assert.equal(input.value, '');
      return fillFixtureFields([
        { label: 'Full name', value: 'Avery Example' },
      ]);
    },
  );
  assert.equal(result.ok, true);
  assert.equal(input.value, 'Avery Example');
});
