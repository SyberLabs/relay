/* global chrome */
import { inspectFixtureTab } from './fill.js';
import { fillFixtureTab as runFillFixtureTab } from './fill-run.js';
import { relayPageFetch } from './page-fetch.js';

async function inspectOnTab(tabId, destination) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: inspectFixtureTab,
    args: [destination || ''],
  });
  return (
    injection?.result || {
      ok: false,
      code: 'not_fixture',
      error: 'Fixture tab could not be inspected.',
    }
  );
}

async function executeIsolated(tabId, func, args = []) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func,
    args,
  });
  return injection;
}

async function fillFixtureTab(tabId, fields, destination) {
  return runFillFixtureTab(
    {
      inspect: inspectOnTab,
      execute: executeIsolated,
      now: Date.now,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    tabId,
    fields,
    destination,
  );
}

async function pageFetchOnTab(tabId, path, body) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: relayPageFetch,
    args: [path, body ? JSON.stringify(body) : null],
  });
  return (
    injection?.result || {
      ok: false,
      status: 500,
      json: { error: 'Relay page fetch did not return.' },
    }
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'probe-fixture') {
    void inspectOnTab(message.tabId, message.destination).then(
      sendResponse,
      (error) =>
        sendResponse({
          ok: false,
          code: 'not_fixture',
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return true;
  }
  if (message.type === 'fill-fixture') {
    void fillFixtureTab(
      message.tabId,
      message.fields,
      message.destination,
    ).then(sendResponse, (error) =>
      sendResponse({
        submitted: false,
        receipt: null,
        fills: 0,
        note: error instanceof Error ? error.message : String(error),
      }),
    );
    return true;
  }
  if (message.type === 'page-fetch') {
    void pageFetchOnTab(message.tabId, message.path, message.body).then(
      sendResponse,
      (error) =>
        sendResponse({
          ok: false,
          status: 500,
          json: {
            error: error instanceof Error ? error.message : String(error),
          },
        }),
    );
    return true;
  }
});
