/* global chrome */
import { admitStartClick } from './popup-start.js';
import { isFixtureUrl, isRelayUrl, optionalOriginPatterns } from './tabs.js';

const message = document.getElementById('message');
const relaySelect = document.getElementById('relay-tab');
const fixtureSelect = document.getElementById('fixture-tab');
const jobSelect = document.getElementById('job');
const nameInput = document.getElementById('full-name');
const start = document.getElementById('start');

function option(value, label, url) {
  const node = document.createElement('option');
  node.value = String(value);
  node.textContent = label;
  node.dataset.url = url;
  return node;
}

function selectedUrl(select) {
  return select.selectedOptions[0]?.dataset.url || '';
}

async function loadTabs() {
  const all = await chrome.tabs.query({});
  relaySelect.replaceChildren();
  fixtureSelect.replaceChildren();
  for (const tab of all) {
    if (!tab.id || !tab.url) continue;
    if (isRelayUrl(tab.url))
      relaySelect.append(option(tab.id, tab.title || tab.url, tab.url));
    if (isFixtureUrl(tab.url))
      fixtureSelect.append(option(tab.id, tab.title || tab.url, tab.url));
  }
  if (!relaySelect.options.length)
    message.textContent = 'Open a signed-in Relay tab first.';
}

async function loadJobs() {
  jobSelect.replaceChildren();
  const tabId = Number(relaySelect.value);
  if (!tabId) return;
  const result = await chrome.runtime.sendMessage({
    type: 'page-fetch',
    tabId,
    path: '/api/workspace',
  });
  if (!result?.ok) {
    message.textContent =
      result?.json?.error || 'Sign in to Relay in that tab.';
    return;
  }
  for (const job of result.json.jobs || [])
    jobSelect.append(option(job.id, job.name || job.id, ''));
  message.textContent = jobSelect.options.length
    ? 'Choose the fixture tab and start. Keep the operative tab open.'
    : 'No jobs in this Relay workspace.';
}

async function startRun(relayTabId, fixtureTabId, job, value, fixtureUrl) {
  const destination = fixtureUrl.split('#')[0];
  const probe = await chrome.runtime.sendMessage({
    type: 'probe-fixture',
    tabId: fixtureTabId,
    destination,
  });
  if (!probe?.ok) {
    message.textContent =
      probe?.error ||
      'This tab is not the fictional fixture form. The operative did not start.';
    return;
  }
  const url = new URL(chrome.runtime.getURL('run.html'));
  url.searchParams.set('relayTabId', String(relayTabId));
  url.searchParams.set('fixtureTabId', String(fixtureTabId));
  url.searchParams.set('job', job);
  url.searchParams.set('destination', destination);
  url.searchParams.set(
    'fields',
    JSON.stringify([{ label: 'Full name', value, unknown: false }]),
  );
  await chrome.tabs.create({ url: url.href });
}

start.addEventListener('click', () => {
  const relayTabId = Number(relaySelect.value);
  const fixtureTabId = Number(fixtureSelect.value);
  const value = nameInput.value.trim();
  const relayUrl = selectedUrl(relaySelect);
  const fixtureUrl = selectedUrl(fixtureSelect);
  const admitted = admitStartClick({
    relayTabId,
    fixtureTabId,
    value,
    relayUrl,
    fixtureUrl,
  });
  if (!admitted.ok) {
    message.textContent = admitted.message;
    return;
  }
  const afterGrant = (granted) => {
    if (admitted.origins.length && !granted) {
      message.textContent =
        'The operative needs permission for the Relay and fixture tabs.';
      return;
    }
    void (async () => {
      const previousJob = jobSelect.value;
      await loadJobs();
      if (
        previousJob &&
        [...jobSelect.options].some((option) => option.value === previousJob)
      )
        jobSelect.value = previousJob;
      const job = jobSelect.value;
      if (!job) {
        message.textContent = 'Choose a job, then start again.';
        return;
      }
      await startRun(relayTabId, fixtureTabId, job, value, fixtureUrl);
    })();
  };
  if (admitted.origins.length === 0) afterGrant(true);
  else
    chrome.permissions
      .request({ origins: admitted.origins })
      .then(afterGrant, () => afterGrant(false));
});

relaySelect.addEventListener('change', () => {
  const relayUrl = selectedUrl(relaySelect);
  const origins = optionalOriginPatterns([relayUrl]);
  const load = () => void loadJobs();
  if (origins.length === 0) load();
  else
    chrome.permissions.request({ origins }).then((granted) => {
      if (!granted) {
        message.textContent =
          'The operative needs permission for this Relay tab.';
        return;
      }
      load();
    }, load);
});
void loadTabs().then(loadJobs);
