import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as helper from '../lib/page-session.ts';

// The expiry rule used to be written out once per mounted page, so this file
// used to prove it once per mounted page: it read the four page sources,
// sliced the callback bodies out with regular expressions and evaluated them.
// The rule now has one owner in lib/page-session.ts, so the ordering cases are
// proved once against that module, directly. What is left per page is what is
// genuinely per page — which private fields it clears — plus a check that a
// page still routes through the runner instead of hand-rolling the sequence.
//
// Coverage: helper 401-before-parse; runner read/sibling-read/mutation across
// 401 before parse, expiry mid-parse, expiry across a microtask sweep, expiry
// before the request, expiry on the follow-up refresh, and the error path;
// each page's cleared fields; each page's wiring.
// Gaps: browser tests cover same-mount POST 401 and profile extract 401 only.
// Same-mount reauthentication is not offered.

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

async function flush(n = 8) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

const PRIVATE = { facts: [{ claim: 'PRIVATE_RECORD' }], error: undefined };

// A stand-in page: it holds private records, a busy flag and a message, and
// clears the records when its session expires. That is the whole contract the
// runner depends on.
function page() {
  const state = {
    records: null,
    busy: false,
    message: 'old',
    signedOut: false,
    expiries: 0,
  };
  const session = helper.createPageSession();
  const host = {
    session,
    onExpired: () => {
      state.expiries += 1;
      state.records = null;
      state.busy = false;
      state.message = '';
      state.signedOut = true;
    },
    setBusy: (busy) => {
      state.busy = busy;
    },
    setMessage: (message) => {
      state.message = message;
    },
  };
  return { state, session, host };
}

const unauthorizedBodies = [
  { format: 'json', body: { error: 'Sign in first.' } },
  { format: 'plain', body: 'Unauthorized' },
];

// ---------------------------------------------------------------- helper ---

void test('plain Unauthorized 401 expires without parsing JSON', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  const response = http(401, 'Unauthorized');
  const reply = await helper.readAuthorizedJson(
    session,
    started,
    response,
    'Unable.',
  );
  assert.equal(reply.kind, 'expired');
  assert.equal(session.expired, true);
  assert.equal(response.jsonCalls, 0);
});

void test('JSON 401 expires without parsing the body', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  const response = http(401, { error: 'Sign in first.' });
  const reply = await helper.readAuthorizedJson(
    session,
    started,
    response,
    'Unable.',
  );
  assert.equal(reply.kind, 'expired');
  assert.equal(response.jsonCalls, 0);
});

void test('a later 200 is ignored after expiry and does not parse', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  helper.expirePageSession(session);
  const response = http(200, PRIVATE);
  const reply = await helper.readAuthorizedJson(
    session,
    started,
    response,
    'Unable.',
  );
  assert.equal(reply.kind, 'ignore');
  assert.equal(response.jsonCalls, 0);
});

void test('expiry during JSON parse cannot return private records', async () => {
  const session = helper.createPageSession();
  const started = helper.beginPageWork(session);
  const response = http(200, PRIVATE, () => {
    helper.expirePageSession(session);
  });
  const reply = await helper.readAuthorizedJson(
    session,
    started,
    response,
    'Unable.',
  );
  assert.equal(reply.kind, 'ignore');
});

void test('an older 401 still expires while other work is live', async () => {
  const session = helper.createPageSession();
  const older = helper.beginPageWork(session);
  session.epoch += 1;
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
    http(200, PRIVATE),
    'Unable.',
  );
  assert.equal(late.kind, 'ignore');
  assert.equal(session.expired, true);
});

// ------------------------------------------------------------------ read ---

for (const { format, body } of unauthorizedBodies) {
  void test(`read 401 ${format} expires before parse`, async () => {
    const { state, session, host } = page();
    const unauthorized = http(401, body);
    await helper.runPageRead(
      host,
      async () => unauthorized,
      'Unable to load.',
      (loaded) => {
        state.records = loaded;
      },
    );
    assert.equal(session.expired, true);
    assert.equal(state.signedOut, true);
    assert.equal(state.records, null);
    assert.equal(unauthorized.jsonCalls, 0);
  });
}

void test('read refuses to start once the session has expired', async () => {
  const { state, session, host } = page();
  helper.expirePageSession(session);
  host.onExpired();
  let calls = 0;
  await helper.runPageRead(
    host,
    async () => {
      calls += 1;
      return http(200, PRIVATE);
    },
    'Unable to load.',
    (loaded) => {
      state.records = loaded;
    },
  );
  assert.equal(calls, 0);
  assert.equal(state.records, null);
});

void test('read cannot apply records when expiry lands mid-parse', async () => {
  const { state, session, host } = page();
  await helper.runPageRead(
    host,
    async () =>
      http(200, PRIVATE, () => {
        helper.expirePageSession(session);
        host.onExpired();
      }),
    'Unable to load.',
    (loaded) => {
      state.records = loaded;
    },
  );
  assert.equal(state.records, null);
  assert.equal(session.expired, true);
});

void test('read 200 cannot restore across 401 microtask gaps', async () => {
  for (let gap = 0; gap < 20; gap++) {
    const { state, session, host } = page();
    const get = deferred();
    const post = deferred();
    const pendingRead = helper.runPageRead(
      host,
      () => get.promise,
      'Unable to load.',
      (loaded) => {
        state.records = loaded;
      },
    );
    const pendingExpiry = (async () => {
      const response = await post.promise;
      if (helper.expireIfUnauthorized(session, response)) host.onExpired();
    })();
    get.resolve(http(200, PRIVATE));
    for (let tick = 0; tick < gap; tick++) await Promise.resolve();
    post.resolve(http(401, 'Unauthorized'));
    await Promise.all([pendingRead, pendingExpiry]);
    assert.equal(state.records, null, `gap ${gap}`);
    assert.equal(state.signedOut, true, `gap ${gap}`);
    assert.equal(session.expired, true, `gap ${gap}`);
  }
});

void test('read reports a failure instead of showing an empty page', async () => {
  const { host } = page();
  await assert.rejects(
    helper.runPageRead(
      host,
      async () => http(500, { error: 'Database unavailable.' }),
      'Unable to load.',
      () => {
        throw new Error('must not apply');
      },
    ),
    /Database unavailable\./,
  );
});

// --------------------------------------------------------- sibling reads ---

void test('a 401 on the second sibling expires while the first is held', async () => {
  const { state, session, host } = page();
  const drafts = deferred();
  const pending = helper.runPageSiblingReads(
    host,
    [() => drafts.promise, async () => http(401, 'Unauthorized')],
    ['Unable to load drafts.', 'Unable to load profile.'],
    (first, second) => {
      state.records = { first, second };
    },
  );
  await flush();
  assert.equal(session.expired, true, 'must expire before the held GET lands');
  assert.equal(state.signedOut, true);
  drafts.resolve(http(200, PRIVATE));
  await pending;
  assert.equal(state.records, null);
});

void test('a 401 on the first sibling expires while the second is held', async () => {
  const { state, session, host } = page();
  const profile = deferred();
  const pending = helper.runPageSiblingReads(
    host,
    [async () => http(401, 'Unauthorized'), () => profile.promise],
    ['Unable to load drafts.', 'Unable to load profile.'],
    (first, second) => {
      state.records = { first, second };
    },
  );
  await flush();
  assert.equal(session.expired, true);
  profile.resolve(http(200, PRIVATE));
  await pending;
  assert.equal(state.records, null);
});

void test('sibling reads apply both bodies only when both are live', async () => {
  const { state, host } = page();
  await helper.runPageSiblingReads(
    host,
    [async () => http(200, { drafts: ['d'] }), async () => http(200, PRIVATE)],
    ['Unable to load drafts.', 'Unable to load profile.'],
    (first, second) => {
      state.records = { first, second };
    },
  );
  assert.deepEqual(state.records.first.drafts, ['d']);
  assert.deepEqual(state.records.second.facts, PRIVATE.facts);
});

void test('sibling reads cannot apply when expiry lands between them', async () => {
  const { state, session, host } = page();
  await helper.runPageSiblingReads(
    host,
    [
      async () => http(200, { drafts: ['d'] }),
      async () =>
        http(200, PRIVATE, () => {
          helper.expirePageSession(session);
          host.onExpired();
        }),
    ],
    ['Unable to load drafts.', 'Unable to load profile.'],
    (first, second) => {
      state.records = { first, second };
    },
  );
  assert.equal(state.records, null);
  assert.equal(session.expired, true);
});

// -------------------------------------------------------------- mutation ---

for (const { format, body } of unauthorizedBodies) {
  void test(`mutation 401 ${format} expires and skips the body parse`, async () => {
    const { state, session, host } = page();
    const unauthorized = http(401, body);
    let posts = 0;
    let refreshes = 0;
    const result = await helper.runPageMutation(
      host,
      async () => {
        posts += 1;
        return unauthorized;
      },
      'Unable to record.',
      {
        clearMessage: true,
        refresh: async () => {
          refreshes += 1;
        },
        succeed: () => {
          state.message = 'should not appear after expiry';
        },
      },
    );
    assert.equal(result, undefined);
    assert.equal(posts, 1);
    assert.equal(
      refreshes,
      0,
      'an expired mutation must not start a follow-up refresh',
    );
    assert.equal(session.expired, true);
    assert.equal(state.signedOut, true);
    assert.equal(state.busy, false);
    assert.equal(state.message, '');
    assert.equal(unauthorized.jsonCalls, 0);
  });
}

void test('an expired session refuses a new mutation before fetching', async () => {
  const { state, session, host } = page();
  helper.expirePageSession(session);
  host.onExpired();
  let calls = 0;
  const result = await helper.runPageMutation(
    host,
    async () => {
      calls += 1;
      return http(200, { ok: true });
    },
    'Unable to record.',
    { succeed: () => assert.fail('must not succeed') },
  );
  assert.equal(calls, 0);
  assert.equal(result, undefined);
  assert.equal(state.signedOut, true);
});

void test('a delayed read cannot restore records after a mutation 401', async () => {
  const { state, session, host } = page();
  const get = deferred();
  const post = deferred();
  let gets = 0;
  const pendingRead = helper.runPageRead(
    host,
    () => {
      gets += 1;
      return get.promise;
    },
    'Unable to load.',
    (loaded) => {
      state.records = loaded;
    },
  );
  const pendingMutation = helper.runPageMutation(
    host,
    () => post.promise,
    'Unable to record.',
    {
      refresh: async () => {
        gets += 1;
      },
      succeed: () => {
        state.message = 'saved';
      },
    },
  );
  post.resolve(http(401, 'Unauthorized'));
  await flush();
  assert.equal(state.signedOut, true, 'must expire before the held GET lands');
  const getsAfterExpiry = gets;
  get.resolve(http(200, PRIVATE));
  await Promise.all([pendingRead, pendingMutation]);
  assert.equal(session.expired, true);
  assert.equal(state.records, null);
  assert.equal(
    gets,
    getsAfterExpiry,
    'an expired mutation must not start a follow-up refresh',
  );
});

void test('a 401 on the follow-up refresh does not report success', async () => {
  const { state, session, host } = page();
  const result = await helper.runPageMutation(
    host,
    async () => http(200, { proposals: ['PRIVATE_PROPOSAL'] }),
    'Unable to complete request.',
    {
      refresh: async () => {
        helper.expirePageSession(session);
        host.onExpired();
      },
      succeed: () => {
        state.message = 'must not appear';
      },
    },
  );
  assert.equal(result, undefined, 'private reply must not reach the page');
  assert.equal(state.message, '');
  assert.equal(state.signedOut, true);
});

void test('a mutation reports its own failure and releases the busy flag', async () => {
  const { state, host } = page();
  const result = await helper.runPageMutation(
    host,
    async () => http(409, { error: 'This record changed.' }),
    'Unable to record.',
    { succeed: () => assert.fail('must not succeed') },
  );
  assert.equal(result, undefined);
  assert.equal(state.message, 'This record changed.');
  assert.equal(state.busy, false);
});

void test('a mutation without a refresh applies its own reply', async () => {
  const { state, host } = page();
  const result = await helper.runPageMutation(
    host,
    async () => http(200, { candidates: [{ claim: 'PRIVATE_CANDIDATE' }] }),
    'Unable to read resume.',
    {
      clearMessage: true,
      succeed: (loaded) => {
        state.records = loaded.candidates;
      },
    },
  );
  assert.deepEqual(state.records, [{ claim: 'PRIVATE_CANDIDATE' }]);
  assert.deepEqual(result.candidates, [{ claim: 'PRIVATE_CANDIDATE' }]);
  assert.equal(state.busy, false);
});

void test('a refusing mutation cannot apply candidates after expiry', async () => {
  const { state, session, host } = page();
  const result = await helper.runPageMutation(
    host,
    async () =>
      http(200, { candidates: [{ claim: 'PRIVATE_CANDIDATE' }] }, () => {
        helper.expirePageSession(session);
        host.onExpired();
      }),
    'Unable to read resume.',
    {
      clearMessage: true,
      succeed: () => {
        state.records = 'restored';
      },
    },
  );
  assert.equal(result, undefined);
  assert.equal(state.records, null);
});

// ----------------------------------------------------------- the pages ----

// applyExpired is the one part that is genuinely per page: which private
// fields that page holds. It is a useCallback with no dependencies, so it can
// be lifted and run without a renderer.
function compile(text) {
  return stripTypeScriptTypes(text, { mode: 'transform' })
    .trim()
    .replace(/;$/, '');
}

function clearedBy(source, state) {
  const token = 'const applyExpired = useCallback(';
  const start = source.indexOf(token);
  assert.ok(start >= 0, 'missing applyExpired');
  const matched = source
    .slice(start + token.length)
    .match(/^([\s\S]*?),\s*\[\]\s*\);/);
  assert.ok(matched, 'could not extract applyExpired');
  const setters = {};
  for (const key of Object.keys(state))
    setters['set' + key[0].toUpperCase() + key.slice(1)] = (value) => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
    };
  // oxlint-disable-next-line typescript/no-implied-eval -- run the page's own callback
  new Function(
    ...Object.keys(setters),
    'return (' + compile(matched[1]) + ');',
  )(...Object.values(setters))();
  return state;
}

const pages = [
  {
    label: 'profile',
    file: 'app/profile/page.tsx',
    loaded: {
      facts: [{ id: 'f1', claim: 'PRIVATE_PROFILE_FACT' }],
      rules: [{ id: 'r1', rule: 'PRIVATE_PROFILE_RULE' }],
      version: 7,
      usable: 1,
      resume: 'PRIVATE_RESUME',
      candidates: [{ claim: 'PRIVATE_CANDIDATE' }],
      chosen: new Set([0]),
      expiry: { f1: '2026-12-01' },
      rule: 'typed rule',
      scope: 'backend',
      busy: true,
      message: 'old',
      signedOut: false,
    },
    private: ['facts', 'rules', 'candidates', 'resume', 'expiry', 'rule'],
  },
  {
    label: 'preferences',
    file: 'app/preferences/page.tsx',
    loaded: {
      state: { pair: { a: { name: 'PRIVATE_PREF_JOB_A' } } },
      busy: true,
      message: 'old',
      minutes: 180,
      signedOut: false,
    },
    private: ['state'],
  },
  {
    label: 'review',
    file: 'app/review/page.tsx',
    loaded: {
      drafts: [{ id: 'd1', body: 'PRIVATE_REVIEW_DRAFT' }],
      facts: [{ id: 'f1', claim: 'PRIVATE_REVIEW_FACT' }],
      batches: [{ id: 'b1', reason: 'PRIVATE_BATCH' }],
      trust: { backend: { state: 'Review' } },
      trigger: { reason: 'PRIVATE_REVIEW_REASON', ids: ['d1'] },
      edits: { d1: 'PRIVATE_EDIT' },
      proposals: { d1: ['PRIVATE_PROPOSAL'] },
      basket: [{ rule: 'PRIVATE_STAGED_RULE' }],
      busy: true,
      message: 'old',
      signedOut: false,
    },
    private: [
      'drafts',
      'facts',
      'batches',
      'trust',
      'trigger',
      'edits',
      'proposals',
      'basket',
    ],
  },
  {
    label: 'track',
    file: 'app/track/page.tsx',
    loaded: {
      data: { outcomes: [{ receipt: 'PRIVATE_RECEIPT' }] },
      busy: true,
      message: 'old',
      receipts: { 'job-1': 'PRIVATE_TYPED_RECEIPT' },
      signedOut: false,
    },
    private: ['data', 'receipts'],
  },
];

function isEmpty(value) {
  if (value === null) return true;
  if (typeof value === 'string') return value === '';
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  if (value && typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

for (const entry of pages) {
  void test(`${entry.label} clears every private field when its session expires`, () => {
    const source = readFileSync(entry.file, 'utf8');
    const state = clearedBy(source, entry.loaded);
    assert.equal(state.signedOut, true);
    assert.equal(state.busy, false);
    assert.equal(state.message, '');
    for (const field of entry.private)
      assert.equal(
        isEmpty(state[field]),
        true,
        `${entry.label} left ${field} populated after expiry`,
      );
  });

  // A page that reimplemented the sequence would pass its own tests while
  // drifting from the one rule every other page follows, so the wiring itself
  // is asserted rather than inferred.
  void test(`${entry.label} routes its requests through the shared runner`, () => {
    const source = readFileSync(entry.file, 'utf8');
    assert.match(source, /runPage(Read|SiblingReads|Mutation)\b/);
    for (const handRolled of [
      'readAuthorizedJson',
      'beginPageWork',
      'pageWorkIsLive',
    ])
      assert.equal(
        source.includes(handRolled),
        false,
        `${entry.file} hand-rolls ${handRolled} instead of using the runner`,
      );
  });
}
