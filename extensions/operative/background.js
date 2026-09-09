/* global chrome */
import {
  clickFixtureSubmit,
  fillFixtureFields,
  inspectFixtureTab,
  readFixtureReceipt,
} from './fill.js';
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

async function fillFixtureTab(tabId, fields, destination) {
  const ready = await inspectOnTab(tabId, destination);
  if (!ready.ok)
    return {
      submitted: false,
      receipt: null,
      fills: 0,
      code: ready.code,
      note: ready.error,
    };
  const [filled] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: fillFixtureFields,
    args: [JSON.stringify(fields ?? [])],
  });
  if (!filled?.result?.ok)
    return {
      submitted: false,
      receipt: null,
      fills: 0,
      code: 'missing_field',
      note: filled?.result?.error || 'Fixture form could not be filled.',
    };
  const [clicked] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: clickFixtureSubmit,
  });
  if (!clicked?.result?.ok)
    return {
      submitted: false,
      receipt: null,
      fills: 1,
      note: clicked?.result?.error || 'Fixture submit control not found.',
    };
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [read] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: readFixtureReceipt,
    });
    if (typeof read?.result === 'string' && read.result)
      return { submitted: true, receipt: read.result, fills: 1 };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {
    submitted: false,
    receipt: null,
    fills: 1,
    note: 'Fixture submit no-op; no confirmation heading. Do not submit again.',
  };
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
