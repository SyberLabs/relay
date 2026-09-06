import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as helper from '../lib/page-session.ts';

// Coverage: helper 401-before-parse; each page refresh/mutation/extract via
// compiled source callbacks; review sibling GET held after the other 401s;
// delayed GET/POST/json cannot restore or start a follow-up refresh;
// helper kind=ok then a later-turn 401 cannot restore refresh/extract state
// (microtask offset sweep plus a forced helper-to-caller gap).
// Gaps: browser tests cover same-mount POST 401 and profile extract 401 only
// (no user-triggered GET refresh). Overlapping successful GETs without 401
// are not generation-gated. Same-mount reauthentication is not offered.
// Delayed restoration was not observed in prior QA; these cases are
// regressions, not a claim that it was seen.

function http(status, body, jsonHook) {
  const state = { jsonCalls: 0 };
  return {
    status,
    ok: status >= 200 && status < 300,
    get jsonCalls() {
      return state.jsonCalls;
    },
    async json() {
      state.jsonCalls += 1;
      if (jsonHook) await jsonHook();
      if (typeof body === 'string')
        throw new SyntaxError('Unexpected token U in JSON at position 0');
      return body;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

function compile(text) {
  return stripTypeScriptTypes(text, { mode: 'transform' })
    .trim()
    .replace(/;$/, '');
}

function bind(text, deps) {
  // oxlint-disable-next-line typescript/no-implied-eval -- exercise actual page callbacks
  return new Function(...Object.keys(deps), 'return (' + compile(text) + ');')(
    ...Object.values(deps),
  );
}

function bindFunction(text, deps) {
  // oxlint-disable-next-line typescript/no-implied-eval -- exercise actual page callbacks
  return new Function(
    ...Object.keys(deps),
    compile(text) + ';return ' + nameOf(text),
  )(...Object.values(deps));
}

function nameOf(text) {
  return text.match(/function\s+([A-Za-z0-9_]+)/)[1];
}

function callbackBody(source, name) {
  const token = `const ${name} = useCallback(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error('missing callback ' + name);
  const matched = source
    .slice(start + token.length)
    .match(/^([\s\S]*?),\s*\[(?:applyExpired)?\]\s*\);/);
  if (!matched) throw new Error('could not extract ' + name);
  return matched[1];
}

function sliceFrom(source, startToken, stopToken) {
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error('missing ' + startToken);
  const end = source.indexOf(stopToken, start + startToken.length);
  if (end < 0) throw new Error('missing stop ' + stopToken);
  return source.slice(start, end);
}

function setters(state, keys) {
  const deps = {};
  for (const key of keys) {
    deps['set' + key[0].toUpperCase() + key.slice(1)] = (value) => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
    };
  }
  return deps;
}

function pageDeps(state, keys, fetchImpl) {
  const session = helper.createPageSession();
  const deps = {
    ...helper,
    ...setters(state, keys),
    ...state,
    sessionRef: { current: session },
    fetch: fetchImpl,
  };
  return { session, deps };
}

function bindExpired(source, deps) {
  deps.applyExpired = bind(callbackBody(source, 'applyExpired'), deps);
}

function watchAuthorizedJson(deps, onReply) {
  const inner = helper.readAuthorizedJson;
  deps.readAuthorizedJson = async (...args) => {
    const reply = await inner(...args);
    onReply(reply);
    return reply;
  };
}

function expireAfterHelperOk(deps, session, afterCount = 1) {
  let oks = 0;
  watchAuthorizedJson(deps, (reply) => {
    if (reply.kind !== 'ok') return;
    oks += 1;
    if (oks < afterCount) return;
    helper.expirePageSession(session);
    deps.applyExpired();
  });
}

function mutationStop(label, source) {
  if (label === 'profile') return '  async function extract()';
  if (label === 'review')
    return source.includes('async function saveCorrection(')
      ? '  async function saveCorrection('
      : '  function addRule(';
  return '  if (signedOut)';
}

async function flush(n = 8) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

const profileKeys = [
  'facts',
  'rules',
  'version',
  'usable',
  'resume',
  'candidates',
  'chosen',
  'expiry',
  'rule',
  'scope',
  'busy',
  'message',
  'signedOut',
];
const preferencesKeys = ['state', 'busy', 'message', 'minutes', 'signedOut'];
const reviewKeys = [
  'drafts',
  'facts',
  'batches',
  'trust',
  'trigger',
  'edits',
  'proposals',
  'basket',
  'busy',
  'message',
  'signedOut',
];
const trackKeys = ['data', 'busy', 'message', 'receipts', 'signedOut'];

function loadedProfile() {
  return {
    facts: [
      {
        id: 'f1',
        claim: 'PRIVATE_PROFILE_FACT',
        evidence: 'ev',
        tag: 'role',
        status: 'Verified',
        verified: '2026-01-01',
        expires: null,
      },
    ],
    rules: [{ id: 'r1', rule: 'PRIVATE_PROFILE_RULE', scope: 'global' }],
    version: 7,
    usable: 1,
    resume: 'PRIVATE_RESUME',
    candidates: [{ claim: 'PRIVATE_CANDIDATE', evidence: 'e', tag: 'role' }],
    chosen: new Set([0]),
    expiry: { f1: '2026-12-01' },
    rule: 'typed rule',
    scope: 'backend',
    busy: false,
    message: 'old',
    signedOut: false,
  };
}

function loadedPreferences() {
  return {
    state: {
      weights: { comp: 0.2, remote: 0.1, level: 0, size: 0, domain: 0 },
      answered: 3,
      minutes: 180,
      pool: 4,
      target: 12,
      pair: {
        a: { job_key: 'a', name: 'PRIVATE_PREF_JOB_A' },
        b: { job_key: 'b', name: 'PRIVATE_PREF_JOB_B' },
      },
    },
    busy: false,
    message: 'old',
    minutes: 180,
    signedOut: false,
  };
}

function loadedReview() {
  return {
    drafts: [
      {
        id: 'd1',
        body: 'PRIVATE_REVIEW_DRAFT',
        cluster: 'backend',
        verdict: 'Logged',
      },
    ],
    facts: [{ id: 'f1', claim: 'PRIVATE_REVIEW_FACT' }],
    batches: [{ id: 'b1', reason: 'PRIVATE_BATCH', closed: null, size: 1 }],
    trust: {
      backend: { cluster: 'backend', state: 'Review', reviewed: 2, edit: 0.1 },
    },
    trigger: { reason: 'PRIVATE_REVIEW_REASON', ids: ['d1'] },
    edits: { d1: 'PRIVATE_EDIT' },
    proposals: { d1: ['PRIVATE_PROPOSAL'] },
    basket: [{ rule: 'PRIVATE_STAGED_RULE', scope: 'global' }],
    busy: false,
    message: 'old',
    signedOut: false,
  };
}

function loadedTrack() {
  return {
    data: {
      outcomes: [{ id: 'o1', kind: 'submitted', receipt: 'PRIVATE_RECEIPT' }],
      prep: [
        {
          id: 'job-1',
          name: 'PRIVATE_TRACK_JOB',
          status: 'Ready',
          claims: [{ id: 'c1', claim: 'PRIVATE_TRACK_CLAIM' }],
        },
      ],
      rates: {
        backend: { mean: 0.2, low: 0.1, high: 0.3, sent: 4, responses: 1 },
      },
    },
    busy: false,
    message: 'old',
    receipts: { 'job-1': 'PRIVATE_TYPED_RECEIPT' },
    signedOut: false,
  };
}

const profileOk = {
  facts: loadedProfile().facts,
  rules: loadedProfile().rules,
  version: 7,
  usable: 1,
};
const preferencesOk = loadedPreferences().state;
const reviewDraftsOk = {
  drafts: loadedReview().drafts,
  batches: loadedReview().batches,
  trust: loadedReview().trust,
  trigger: loadedReview().trigger,
};
const reviewProfileOk = { facts: loadedReview().facts };
const trackOk = loadedTrack().data;
const extractOk = {
  candidates: [{ claim: 'PRIVATE_CANDIDATE', evidence: 'e', tag: 'role' }],
};

function assertCleared(label, state, detail) {
  assert.equal(state.signedOut, true, detail);
  if (label === 'profile') {
    assert.deepEqual(state.facts, [], detail);
    assert.deepEqual(state.rules, [], detail);
    assert.equal(state.resume, '', detail);
    assert.deepEqual(state.candidates, [], detail);
  }
  if (label === 'preferences') assert.equal(state.state, null, detail);
  if (label === 'review') {
    assert.deepEqual(state.drafts, [], detail);
    assert.deepEqual(state.facts, [], detail);
  }
  if (label === 'track') assert.equal(state.data, null, detail);
}

void test('plain Unauthorized 401 expires without parsing JSON', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  const r = http(401, 'Unauthorized');
  const reply = await helper.readAuthorizedJson(session, started, r, 'Unable.');
  assert.equal(reply.kind, 'expired');
  assert.equal(r.jsonCalls, 0);
  assert.equal(session.expired, true);
});

void test('JSON 401 expires without parsing the body', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  const r = http(401, { error: 'Sign in first.' });
  const reply = await helper.readAuthorizedJson(session, started, r, 'Unable.');
  assert.equal(reply.kind, 'expired');
  assert.equal(r.jsonCalls, 0);
});

void test('a later 200 is ignored after expiry and does not parse', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  helper.expirePageSession(session);
  const r = http(200, { facts: [{ claim: 'PRIVATE_PROFILE_FACT' }] });
  const reply = await helper.readAuthorizedJson(session, started, r, 'Unable.');
  assert.equal(reply.kind, 'ignore');
  assert.equal(r.jsonCalls, 0);
});

void test('expiry during JSON parse cannot return private records', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  const r = http(
    200,
    { facts: [{ claim: 'PRIVATE_PROFILE_FACT' }] },
    async () => {
      helper.expirePageSession(session);
    },
  );
  const reply = await helper.readAuthorizedJson(session, started, r, 'Unable.');
  assert.equal(reply.kind, 'ignore');
  assert.equal(session.expired, true);
});

void test('an older 401 still expires while other work is live', async () => {
  const session = helper.createPageSession();
  const older = helper.beginPageWork(session);
  const newer = helper.beginPageWork(session);
  await helper.readAuthorizedJson(
    session,
    older,
    http(401, 'Unauthorized'),
    'Unable.',
  );
  const late = await helper.readAuthorizedJson(
    session,
    newer,
    http(200, { facts: [{ claim: 'leaked' }] }),
    'Unable.',
  );
  assert.equal(late.kind, 'ignore');
  assert.equal(session.expired, true);
});

const pages = [
  {
    label: 'profile',
    file: 'app/profile/page.tsx',
    keys: profileKeys,
    seed: loadedProfile,
    mutation: 'run',
    okBody: profileOk,
  },
  {
    label: 'preferences',
    file: 'app/preferences/page.tsx',
    keys: preferencesKeys,
    seed: loadedPreferences,
    mutation: 'post',
    okBody: preferencesOk,
  },
  {
    label: 'review',
    file: 'app/review/page.tsx',
    keys: reviewKeys,
    seed: loadedReview,
    mutation: 'run',
    okBody: reviewDraftsOk,
  },
  {
    label: 'track',
    file: 'app/track/page.tsx',
    keys: trackKeys,
    seed: loadedTrack,
    mutation: 'record',
    okBody: trackOk,
  },
];
const unauthorizedBodies = [
  { format: 'json', body: { error: 'Sign in first.' } },
  { format: 'plain', body: 'Unauthorized' },
];

for (const { label, file, keys, seed, mutation, okBody } of pages) {
  for (const { format, body } of unauthorizedBodies) {
    void test(`${label} POST 401 ${format} expires and skips body parse`, async () => {
      const source = readFileSync(file, 'utf8');
      const state = seed();
      let posts = 0;
      const { session, deps } = pageDeps(state, keys, async (_url, init) => {
        if (init?.method === 'POST') {
          posts += 1;
          return http(401, body);
        }
        throw new Error('unexpected GET');
      });
      bindExpired(source, deps);
      deps.refresh = bind(callbackBody(source, 'refresh'), deps);
      const mutate = bindFunction(
        sliceFrom(
          source,
          `async function ${mutation}(`,
          mutationStop(label, source),
        ),
        deps,
      );
      const result = await mutate(
        { action: 'probe' },
        'should not appear after expiry',
      );
      assert.equal(session.expired, true);
      assert.equal(state.signedOut, true);
      assert.equal(state.busy, false);
      assert.equal(state.message, '');
      assert.equal(result, undefined);
      assert.equal(posts, 1);
      if (label === 'profile') {
        assert.deepEqual(state.facts, []);
        assert.deepEqual(state.rules, []);
        assert.equal(state.resume, '');
        assert.deepEqual(state.candidates, []);
        assert.equal(state.chosen.size, 0);
        assert.deepEqual(state.expiry, {});
        assert.equal(state.rule, '');
        assert.equal(state.scope, 'global');
        assert.equal(state.version, 1);
        assert.equal(state.usable, 0);
      }
      if (label === 'preferences') {
        assert.equal(state.state, null);
        assert.equal(state.minutes, 120);
      }
      if (label === 'review') {
        assert.deepEqual(state.drafts, []);
        assert.deepEqual(state.facts, []);
        assert.deepEqual(state.batches, []);
        assert.deepEqual(state.trust, {});
        assert.equal(state.trigger, null);
        assert.deepEqual(state.edits, {});
        assert.deepEqual(state.proposals, {});
        assert.deepEqual(state.basket, []);
      }
      if (label === 'track') {
        assert.equal(state.data, null);
        assert.deepEqual(state.receipts, {});
      }
    });

    void test(`${label} GET 401 ${format} expires before parse`, async () => {
      const source = readFileSync(file, 'utf8');
      const state = seed();
      const unauthorized = http(401, body);
      const { session, deps } = pageDeps(state, keys, async () => unauthorized);
      bindExpired(source, deps);
      const refresh = bind(callbackBody(source, 'refresh'), deps);
      await refresh();
      assert.equal(session.expired, true);
      assert.equal(state.signedOut, true);
      assert.equal(unauthorized.jsonCalls, 0);
    });
  }

  void test(`${label} delayed GET 200 cannot restore after mutation 401`, async () => {
    const source = readFileSync(file, 'utf8');
    const state = seed();
    const get = deferred();
    const post = deferred();
    let gets = 0;
    const { session, deps } = pageDeps(state, keys, async (_url, init) => {
      if (init?.method === 'POST') return post.promise;
      gets += 1;
      return get.promise;
    });
    bindExpired(source, deps);
    deps.refresh = bind(callbackBody(source, 'refresh'), deps);
    const mutate = bindFunction(
      sliceFrom(
        source,
        `async function ${mutation}(`,
        mutationStop(label, source),
      ),
      deps,
    );
    const pendingRefresh = deps.refresh();
    const pendingMutation = mutate({ action: 'probe' }, 'saved');
    post.resolve(http(401, 'Unauthorized'));
    await flush();
    assert.equal(
      state.signedOut,
      true,
      'must expire before the held GET lands',
    );
    const getsAfterExpiry = gets;
    get.resolve(http(200, okBody));
    await Promise.all([pendingRefresh, pendingMutation]);
    assert.equal(state.signedOut, true);
    assert.equal(session.expired, true);
    assert.equal(
      gets,
      getsAfterExpiry,
      'expired mutation must not start a follow-up refresh',
    );
    if (label === 'profile') assert.deepEqual(state.facts, []);
    if (label === 'preferences') assert.equal(state.state, null);
    if (label === 'review') assert.deepEqual(state.drafts, []);
    if (label === 'track') assert.equal(state.data, null);
  });

  void test(`${label} expired session refuses a new mutation before fetch`, async () => {
    const source = readFileSync(file, 'utf8');
    const state = seed();
    let calls = 0;
    const { session, deps } = pageDeps(state, keys, async () => {
      calls += 1;
      return http(200, { ok: true });
    });
    bindExpired(source, deps);
    deps.refresh = bind(callbackBody(source, 'refresh'), deps);
    helper.expirePageSession(session);
    deps.applyExpired();
    const mutate = bindFunction(
      sliceFrom(
        source,
        `async function ${mutation}(`,
        mutationStop(label, source),
      ),
      deps,
    );
    await mutate({ action: 'probe' }, 'saved');
    assert.equal(calls, 0);
    assert.equal(state.signedOut, true);
  });

  void test(`${label} GET 200 cannot restore across 401 microtask gaps`, async () => {
    const source = readFileSync(file, 'utf8');
    let sawOk = false;
    for (let gap = 0; gap < 20; gap++) {
      const state = seed();
      const get = deferred();
      const profileGet = deferred();
      const post = deferred();
      const { session, deps } = pageDeps(state, keys, async (url, init) => {
        if (init?.method === 'POST') return post.promise;
        if (label === 'review' && String(url).includes('/api/profile'))
          return profileGet.promise;
        return get.promise;
      });
      bindExpired(source, deps);
      watchAuthorizedJson(deps, (reply) => {
        if (reply.kind === 'ok') sawOk = true;
      });
      deps.refresh = bind(callbackBody(source, 'refresh'), deps);
      const pendingRefresh = deps.refresh();
      const pendingExpiry = (async () => {
        const response = await deps.fetch('/api/probe', { method: 'POST' });
        if (helper.expireIfUnauthorized(session, response)) deps.applyExpired();
      })();
      get.resolve(http(200, okBody));
      if (label === 'review') profileGet.resolve(http(200, reviewProfileOk));
      for (let tick = 0; tick < gap; tick++) await Promise.resolve();
      post.resolve(http(401, 'Unauthorized'));
      await Promise.all([pendingRefresh, pendingExpiry]);
      assertCleared(label, state, `gap ${gap}`);
      assert.equal(session.expired, true, `gap ${gap}`);
    }
    assert.equal(
      sawOk,
      true,
      'helper must return ok before a 401 in this sweep',
    );
  });

  void test(`${label} refresh does not apply body after helper returns ok`, async () => {
    const source = readFileSync(file, 'utf8');
    const state = seed();
    let gets = 0;
    const { session, deps } = pageDeps(state, keys, async (url) => {
      gets += 1;
      if (label === 'review' && String(url).includes('/api/profile'))
        return http(200, reviewProfileOk);
      return http(200, okBody);
    });
    bindExpired(source, deps);
    expireAfterHelperOk(deps, session, label === 'review' ? 2 : 1);
    deps.refresh = bind(callbackBody(source, 'refresh'), deps);
    await deps.refresh();
    assert.ok(gets >= 1);
    assert.equal(session.expired, true);
    assertCleared(label, state);
  });
}

void test('profile extract 401 expires without restoring candidates', async () => {
  const source = readFileSync('app/profile/page.tsx', 'utf8');
  const state = loadedProfile();
  const unauthorized = http(401, 'Unauthorized');
  const { session, deps } = pageDeps(state, profileKeys, async (_url, init) => {
    assert.equal(init?.method, 'POST');
    return unauthorized;
  });
  bindExpired(source, deps);
  deps.refresh = bind(callbackBody(source, 'refresh'), deps);
  const extract = bindFunction(
    sliceFrom(source, 'async function extract()', '  const proposed ='),
    deps,
  );
  await extract();
  assert.equal(session.expired, true);
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.candidates, []);
  assert.equal(state.resume, '');
  assert.equal(unauthorized.jsonCalls, 0);
});

void test('profile extract 200 after expiry cannot restore candidates', async () => {
  const source = readFileSync('app/profile/page.tsx', 'utf8');
  const state = loadedProfile();
  const post = deferred();
  let posts = 0;
  const { session, deps } = pageDeps(state, profileKeys, async (_url, init) => {
    if (init?.method === 'POST') {
      posts += 1;
      return post.promise;
    }
    throw new Error('extract must not refresh');
  });
  bindExpired(source, deps);
  const extract = bindFunction(
    sliceFrom(source, 'async function extract()', '  const proposed ='),
    deps,
  );
  const pending = extract();
  helper.expirePageSession(session);
  deps.applyExpired();
  post.resolve(
    http(200, {
      candidates: [{ claim: 'PRIVATE_CANDIDATE', evidence: 'e', tag: 'role' }],
    }),
  );
  await pending;
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.candidates, []);
  assert.equal(posts, 1);
});

void test('profile extract 200 cannot restore across 401 microtask gaps', async () => {
  const source = readFileSync('app/profile/page.tsx', 'utf8');
  let sawOk = false;
  for (let gap = 0; gap < 20; gap++) {
    const state = loadedProfile();
    const extractPost = deferred();
    const mutatePost = deferred();
    const { session, deps } = pageDeps(
      state,
      profileKeys,
      async (_url, init) => {
        if (init?.method !== 'POST')
          throw new Error('extract sweep must not GET');
        return String(init.body).includes('extract')
          ? extractPost.promise
          : mutatePost.promise;
      },
    );
    bindExpired(source, deps);
    watchAuthorizedJson(deps, (reply) => {
      if (reply.kind === 'ok') sawOk = true;
    });
    const extract = bindFunction(
      sliceFrom(source, 'async function extract()', '  const proposed ='),
      deps,
    );
    const pendingExtract = extract();
    const pendingExpiry = (async () => {
      const response = await deps.fetch('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ action: 'probe' }),
      });
      if (helper.expireIfUnauthorized(session, response)) deps.applyExpired();
    })();
    extractPost.resolve(http(200, extractOk));
    for (let tick = 0; tick < gap; tick++) await Promise.resolve();
    mutatePost.resolve(http(401, 'Unauthorized'));
    await Promise.all([pendingExtract, pendingExpiry]);
    assert.equal(session.expired, true, `gap ${gap}`);
    assertCleared('profile', state, `gap ${gap}`);
  }
  assert.equal(
    sawOk,
    true,
    'extract helper must return ok before a 401 in this sweep',
  );
});

void test('profile extract does not apply candidates after helper returns ok', async () => {
  const source = readFileSync('app/profile/page.tsx', 'utf8');
  const state = loadedProfile();
  const { session, deps } = pageDeps(state, profileKeys, async (_url, init) => {
    assert.equal(init?.method, 'POST');
    return http(200, extractOk);
  });
  bindExpired(source, deps);
  expireAfterHelperOk(deps, session);
  const extract = bindFunction(
    sliceFrom(source, 'async function extract()', '  const proposed ='),
    deps,
  );
  await extract();
  assert.equal(session.expired, true);
  assertCleared('profile', state);
});

void test('review profile sibling 401 expires while drafts GET is held', async () => {
  const source = readFileSync('app/review/page.tsx', 'utf8');
  const state = loadedReview();
  const drafts = deferred();
  const profile = deferred();
  const { session, deps } = pageDeps(state, reviewKeys, async (url) => {
    if (String(url).includes('/api/drafts')) return drafts.promise;
    if (String(url).includes('/api/profile')) return profile.promise;
    throw new Error('unexpected ' + url);
  });
  bindExpired(source, deps);
  const refresh = bind(callbackBody(source, 'refresh'), deps);
  const pending = refresh();
  profile.resolve(http(401, { error: 'Sign in first.' }));
  await flush();
  assert.equal(state.signedOut, true, 'must not wait for Promise.all');
  assert.deepEqual(state.facts, []);
  assert.deepEqual(state.drafts, []);
  drafts.resolve(http(200, reviewDraftsOk));
  await pending;
  assert.equal(session.expired, true);
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.drafts, []);
  assert.deepEqual(state.facts, []);
});

void test('review drafts sibling 401 expires while profile GET is held', async () => {
  const source = readFileSync('app/review/page.tsx', 'utf8');
  const state = loadedReview();
  const drafts = deferred();
  const profile = deferred();
  const { deps } = pageDeps(state, reviewKeys, async (url) => {
    if (String(url).includes('/api/drafts')) return drafts.promise;
    return profile.promise;
  });
  bindExpired(source, deps);
  const refresh = bind(callbackBody(source, 'refresh'), deps);
  const pending = refresh();
  drafts.resolve(http(401, 'Unauthorized'));
  await flush();
  assert.equal(state.signedOut, true);
  profile.resolve(http(200, reviewProfileOk));
  await pending;
  assert.deepEqual(state.facts, []);
  assert.deepEqual(state.drafts, []);
});

void test('review Save correction does not stage proposals after expiry', async () => {
  const source = readFileSync('app/review/page.tsx', 'utf8');
  const state = loadedReview();
  const post = deferred();
  let gets = 0;
  const { session, deps } = pageDeps(state, reviewKeys, async (_url, init) => {
    if (init?.method === 'POST') return post.promise;
    gets += 1;
    return http(401, 'Unauthorized');
  });
  bindExpired(source, deps);
  deps.refresh = bind(callbackBody(source, 'refresh'), deps);
  deps.run = bindFunction(
    sliceFrom(
      source,
      'async function run(',
      '  async function saveCorrection(',
    ),
    deps,
  );
  const saveCorrection = bindFunction(
    sliceFrom(source, 'async function saveCorrection(', '  function addRule('),
    deps,
  );
  const pending = saveCorrection('d1');
  post.resolve(
    http(200, { ok: true, proposals: ['Keep PRIVATE_PROPOSAL forever.'] }),
  );
  await pending;
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.proposals, {});
  assert.equal(session.expired, true);
  assert.ok(gets >= 1);
  assert.equal(state.message, '');
});

void test('review addRule is refused after expiry', () => {
  const source = readFileSync('app/review/page.tsx', 'utf8');
  const state = loadedReview();
  state.basket = [];
  const { session, deps } = pageDeps(state, reviewKeys, async () => {
    throw new Error('addRule must not fetch');
  });
  bindExpired(source, deps);
  helper.expirePageSession(session);
  deps.applyExpired();
  const addRule = bindFunction(
    sliceFrom(source, 'function addRule(', '  const open ='),
    deps,
  );
  addRule('Do not leak private rules.');
  assert.deepEqual(state.basket, []);
  assert.equal(state.signedOut, true);
});

void test('GET JSON parse that expires mid-read cannot restore profile facts', async () => {
  const source = readFileSync('app/profile/page.tsx', 'utf8');
  const state = loadedProfile();
  const { session, deps } = pageDeps(state, profileKeys, async () =>
    http(200, profileOk, async () => {
      helper.expirePageSession(session);
      deps.applyExpired();
    }),
  );
  bindExpired(source, deps);
  const refresh = bind(callbackBody(source, 'refresh'), deps);
  await refresh();
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.facts, []);
});

void test('successful mutation refresh 401 does not return private proposals', async () => {
  const source = readFileSync('app/review/page.tsx', 'utf8');
  const state = loadedReview();
  const { session, deps } = pageDeps(state, reviewKeys, async (_url, init) => {
    if (init?.method === 'POST')
      return http(200, { ok: true, proposals: ['PRIVATE_PROPOSAL'] });
    return http(401, 'Unauthorized');
  });
  bindExpired(source, deps);
  deps.refresh = bind(callbackBody(source, 'refresh'), deps);
  const run = bindFunction(
    sliceFrom(
      source,
      'async function run(',
      '  async function saveCorrection(',
    ),
    deps,
  );
  const result = await run({ action: 'correct', id: 'd1' }, 'saved');
  assert.equal(result, undefined);
  assert.equal(state.signedOut, true);
  assert.equal(session.expired, true);
});
