/* global chrome */
import { OPERATIVE_ACTOR, runFixtureSend } from './handshake.js';
import { relayPageFetch } from './page-fetch.js';

const message = document.getElementById('message');
const params = new URLSearchParams(location.search);
const relayTabId = Number(params.get('relayTabId'));
const fixtureTabId = Number(params.get('fixtureTabId'));
const controller = new AbortController();

window.addEventListener('pagehide', () => controller.abort(), { once: true });

function report(text) {
  message.textContent = text;
}

async function pageFetch(path, body) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: relayTabId },
    world: 'MAIN',
    func: relayPageFetch,
    args: [path, body ? JSON.stringify(body) : null],
  });
  if (!injection?.result)
    return {
      ok: false,
      status: 500,
      json: { error: 'Relay page fetch did not return.' },
    };
  return injection.result;
}

async function wait(pin) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: relayTabId },
    world: 'MAIN',
    func: async (raw) => {
      const next = JSON.parse(raw);
      const deadline = Date.now() + 15_000;
      while (typeof window.relay?.relay_wait_for_application !== 'function') {
        if (Date.now() > deadline)
          throw new Error(
            JSON.stringify({
              error: 'window.relay is not available in this Relay tab.',
              code: 'relay_unavailable',
            }),
          );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return window.relay.relay_wait_for_application(next);
    },
    args: [JSON.stringify(pin)],
  });
  return injection.result;
}

async function probeFixture(destination) {
  return chrome.runtime.sendMessage({
    type: 'probe-fixture',
    tabId: fixtureTabId,
    destination,
  });
}

async function fillOnce(fields, destination) {
  return chrome.runtime.sendMessage({
    type: 'fill-fixture',
    tabId: fixtureTabId,
    fields,
    destination,
  });
}

async function pageOrigin() {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: relayTabId },
    world: 'MAIN',
    func: () => location.origin,
  });
  return injection?.result || '';
}

let fields;
try {
  fields = JSON.parse(params.get('fields') || '[]');
} catch {
  fields = [];
}

if (!relayTabId || !fixtureTabId || !params.get('job')) {
  report('Missing Relay tab, fixture tab, or job.');
} else {
  report('Preparing and waiting for Inspect Accept…');
  void runFixtureSend(
    {
      pageOrigin,
      pageFetch,
      probeFixture,
      wait,
      fillOnce,
      signal: controller.signal,
    },
    {
      job: params.get('job'),
      destination: params.get('destination'),
      fields,
      files: [],
      actor: OPERATIVE_ACTOR,
    },
  )
    .then((result) => {
      if (result.submitted)
        report(`Submitted once. Receipt: ${result.receipt}`);
      else if (result.uncertain)
        report('Recorded uncertain. Do not submit again.');
      else report(result.error || 'Operative stopped without submitting.');
    })
    .catch((error) => {
      report(error instanceof Error ? error.message : String(error));
    });
}
