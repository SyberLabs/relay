/* global chrome */
const message = document.getElementById('message');
const relaySelect = document.getElementById('relay-tab');
const fixtureSelect = document.getElementById('fixture-tab');
const jobSelect = document.getElementById('job');
const nameInput = document.getElementById('full-name');
const start = document.getElementById('start');

function option(value, label) {
  const node = document.createElement('option');
  node.value = String(value);
  node.textContent = label;
  return node;
}

function hostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isRelayUrl(url) {
  const host = hostname(url);
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host.endsWith('.workers.dev')
  );
}

function isFixtureUrl(url) {
  return Boolean(url) && !url.startsWith('chrome') && !isRelayUrl(url);
}

async function loadTabs() {
  const all = await chrome.tabs.query({});
  relaySelect.replaceChildren();
  fixtureSelect.replaceChildren();
  for (const tab of all) {
    if (!tab.id || !tab.url) continue;
    if (isRelayUrl(tab.url))
      relaySelect.append(option(tab.id, tab.title || tab.url));
    if (isFixtureUrl(tab.url))
      fixtureSelect.append(option(tab.id, tab.title || tab.url));
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
    jobSelect.append(option(job.id, job.name || job.id));
  message.textContent = jobSelect.options.length
    ? 'Choose the fixture tab and start. Keep the operative tab open.'
    : 'No jobs in this Relay workspace.';
}

async function ensureFixturePermission(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return false;
  const origin = new URL(tab.url).origin;
  if (
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://localhost')
  )
    return true;
  const pattern = `${origin}/*`;
  if (await chrome.permissions.contains({ origins: [pattern] })) return true;
  return chrome.permissions.request({ origins: [pattern] });
}

start.addEventListener('click', async () => {
  const relayTabId = Number(relaySelect.value);
  const fixtureTabId = Number(fixtureSelect.value);
  const job = jobSelect.value;
  const value = nameInput.value.trim();
  if (!relayTabId || !fixtureTabId || !job || !value) {
    message.textContent =
      'Choose Relay, fixture, job, and a complete Full name.';
    return;
  }
  if (!(await ensureFixturePermission(fixtureTabId))) {
    message.textContent =
      'The operative needs permission for this fixture tab.';
    return;
  }
  const fixture = await chrome.tabs.get(fixtureTabId);
  const url = new URL(chrome.runtime.getURL('run.html'));
  url.searchParams.set('relayTabId', String(relayTabId));
  url.searchParams.set('fixtureTabId', String(fixtureTabId));
  url.searchParams.set('job', job);
  url.searchParams.set('destination', fixture.url.split('#')[0]);
  url.searchParams.set(
    'fields',
    JSON.stringify([{ label: 'Full name', value, unknown: false }]),
  );
  await chrome.tabs.create({ url: url.href });
});

relaySelect.addEventListener('change', () => void loadJobs());
void loadTabs().then(loadJobs);
