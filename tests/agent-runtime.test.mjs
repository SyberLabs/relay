import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  actOnApplication,
  armPreparation,
  changeApplicationPolicy,
  inspectApplication,
} from '../lib/application-automation.ts';
import {
  AGENT_FUNCTION_TOOLS,
  FORBIDDEN_AGENT_TOOLS,
} from '../lib/agent-runtime-tools.ts';
import {
  answerAgentSession,
  cancelAgentSession,
  continueAgentSession,
  getAgentSession,
  startAgentSession,
} from '../lib/agent-runtime-control.ts';
import { openaiSessionBody } from '../lib/agent-runtime-openai.ts';
import { agentParkCopy } from '../lib/agent-runtime-view.ts';

const now = '2026-09-11T12:00:00.000Z';
const memoryEnv = { RELAY_AGENTS: 'memory' };

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${f}`, 'utf8'));
  let pending = Promise.resolve();
  const db = {
    sqlite,
    prepare(sql) {
      const s = sqlite.prepare(sql);
      const bound = (args) => {
        const params = sql.includes('?1')
          ? [Object.fromEntries(args.map((v, i) => [String(i + 1), v]))]
          : args;
        return {
          async first() {
            return s.get(...params) || null;
          },
          async all() {
            return { results: s.all(...params) };
          },
          async run() {
            return { meta: s.run(...params) };
          },
        };
      };
      return { bind: (...args) => bound(args), ...bound([]) };
    },
    batch(statements) {
      const work = pending.then(async () => {
        sqlite.exec('BEGIN');
        try {
          const out = [];
          for (const s of statements) out.push(await s.run());
          sqlite.exec('COMMIT');
          return out;
        } catch (e) {
          sqlite.exec('ROLLBACK');
          throw e;
        }
      });
      pending = work.catch(() => {});
      return work;
    },
  };
  for (const owner of ['alice', 'bob'])
    for (let i = 0; i < 12; i++)
      sqlite
        .prepare(
          "INSERT INTO jobs (id,owner,job_key,name,url,status,version,updated) VALUES (?,?,?,?,?,'Held',1,?)",
        )
        .run(
          `${owner}-${i}`,
          owner,
          `job-${i}`,
          `Fictional role ${i}`,
          `https://employer.example/jobs/${i}`,
          now,
        );
  return db;
}

async function policy(db, owner = 'alice') {
  await changeApplicationPolicy(
    db,
    owner,
    {
      version: 0,
      enabled: true,
      review: 'all',
      jobs: Array.from({ length: 12 }, (_, i) => `${owner}-${i}`),
      maximum: 12,
      expires: '2026-10-11T12:00:00.000Z',
    },
    now,
  );
}

function begins(db) {
  return db.sqlite
    .prepare(
      "SELECT COUNT(*) c FROM application_operations WHERE state IN ('executing','submitted')",
    )
    .get().c;
}

void test('forbidden authority tools are never registered', () => {
  const names = AGENT_FUNCTION_TOOLS.map((tool) => tool.name);
  assert.deepEqual(names, [
    'relay_read_job',
    'relay_request_answer',
    'relay_prepare_application',
    'relay_record_progress',
  ]);
  for (const name of FORBIDDEN_AGENT_TOOLS)
    assert.ok(!names.includes(name), name);
  const body = openaiSessionBody({
    model: 'gpt-6-astra',
    text: 'Prepare this job.',
    tools: AGENT_FUNCTION_TOOLS,
  });
  assert.equal(body.environment.type, 'none');
  assert.ok(!JSON.stringify(body).includes('openai_hosted'));
  assert.ok(
    !body.agent.tools.some((tool) => FORBIDDEN_AGENT_TOOLS.includes(tool.name)),
  );
});

void test('kill switch, pause, and live-without-opt-in never call upstream', async () => {
  const db = database();
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    return new Response('{}');
  };
  await assert.rejects(
    () =>
      startAgentSession(
        db,
        'alice',
        { job: 'alice-0' },
        { RELAY_AGENTS: '' },
        now,
        { fetch },
      ),
    /off/i,
  );
  await assert.rejects(
    () =>
      startAgentSession(
        db,
        'alice',
        { job: 'alice-0' },
        { RELAY_AGENTS: 'live', OPENAI_API_KEY: 'sk-fictional-key-1234567890' },
        now,
        { fetch },
      ),
    /not enabled/i,
  );
  await assert.rejects(
    () =>
      startAgentSession(
        db,
        'alice',
        { job: 'alice-0' },
        {
          RELAY_AGENTS: 'live',
          RELAY_AGENTS_LIVE: '1',
          OPENAI_API_KEY: 'short',
        },
        now,
        { fetch },
      ),
    /not configured/i,
  );
  await assert.rejects(
    () =>
      startAgentSession(
        db,
        'alice',
        { job: 'alice-0' },
        { RELAY_AGENTS: 'memory', RELAY_PAUSE: 'all' },
        now,
        { fetch },
      ),
    /paused/i,
  );
  assert.equal(fetches, 0);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) c FROM agent_sessions').get().c,
    0,
  );
  db.sqlite.close();
});

void test('memory mode never fetches even when an API key is present', async () => {
  const db = database();
  await policy(db);
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    return new Response(JSON.stringify({ id: 'agt_x', status: 'idle' }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  await startAgentSession(
    db,
    'alice',
    { job: 'alice-0' },
    { RELAY_AGENTS: 'memory', OPENAI_API_KEY: 'sk-fictional-key-1234567890' },
    now,
    { fetch },
  );
  assert.equal(fetches, 0);
  db.sqlite.close();
});

void test('session binds owner and job; other owners cannot read it', async () => {
  const db = database();
  await policy(db);
  const started = await startAgentSession(
    db,
    'alice',
    { job: 'alice-0' },
    memoryEnv,
    now,
  );
  assert.equal(started.job_id, 'alice-0');
  assert.equal(started.park?.kind, 'answer');
  assert.equal(started.park?.name, 'relay_request_answer');
  assert.equal(started.begin, false);
  await assert.rejects(
    () => startAgentSession(db, 'alice', { job: 'bob-0' }, memoryEnv, now),
    (err) => {
      assert.equal(err.status, 404);
      return true;
    },
  );
  await assert.rejects(
    () => getAgentSession(db, 'bob', 'alice-0', memoryEnv, now),
    (err) => {
      assert.equal(err.status, 404);
      return true;
    },
  );
  const again = await getAgentSession(db, 'alice', 'alice-0', memoryEnv, now);
  assert.equal(again.session.session_id, started.session_id);
  assert.equal(again.session.park.turn_id, started.park.turn_id);
  assert.equal(again.session.park.call_id, started.park.call_id);
  db.sqlite.close();
});

void test('disconnect then human answer resumes the same turn and does not verify', async () => {
  const db = database();
  await policy(db);
  const started = await startAgentSession(
    db,
    'alice',
    { job: 'alice-0' },
    memoryEnv,
    now,
  );
  const recovered = await getAgentSession(
    db,
    'alice',
    'alice-0',
    memoryEnv,
    now,
  );
  assert.equal(recovered.session.park.call_id, started.park.call_id);
  await assert.rejects(
    () =>
      answerAgentSession(
        db,
        'alice',
        { job: 'alice-0', answer: 'Yes', remember: true },
        memoryEnv,
        now,
      ),
    /remember:true/i,
  );
  await assert.rejects(
    () =>
      answerAgentSession(
        db,
        'alice',
        { job: 'alice-0', answer: 'Yes', verify: true },
        memoryEnv,
        now,
      ),
    /cannot verify/i,
  );
  const answered = await answerAgentSession(
    db,
    'alice',
    { job: 'alice-0', answer: 'Yes, authorized to work in the United States.' },
    memoryEnv,
    now,
  );
  const fact = db.sqlite
    .prepare(
      "SELECT status,field_key,claim FROM profile_facts WHERE owner='alice'",
    )
    .get();
  assert.equal(fact.status, 'Proposed');
  assert.equal(fact.field_key, 'work_authorization.us');
  assert.ok(!/Verified/.test(fact.status));
  assert.equal(answered.park?.kind, 'authorization');
  assert.equal(answered.begin, false);
  assert.equal(begins(db), 0);
  db.sqlite.close();
});

void test('prepare freezes a digest in D1; continue without Accept is refused; begin stays 0', async () => {
  const db = database();
  await policy(db);
  await startAgentSession(db, 'alice', { job: 'alice-0' }, memoryEnv, now);
  const parked = await answerAgentSession(
    db,
    'alice',
    { job: 'alice-0', answer: 'Yes, authorized.' },
    memoryEnv,
    now,
  );
  assert.equal(parked.park?.kind, 'authorization');
  assert.ok(parked.operation_id);
  assert.ok(parked.digest);
  const op = db.sqlite
    .prepare('SELECT state,digest FROM application_operations WHERE id=?')
    .get(parked.operation_id);
  assert.equal(op.state, 'proposed');
  assert.equal(op.digest, parked.digest);
  await assert.rejects(
    () => continueAgentSession(db, 'alice', { job: 'alice-0' }, memoryEnv, now),
    /Human acceptance/i,
  );
  assert.equal(begins(db), 0);
  const inspect = await inspectApplication(db, 'alice', 'alice-0', now);
  await armPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      id: parked.operation_id,
      actor: 'Fictional applying agent',
      preparation_revision: inspect.preparation_revision,
    },
    now,
  );
  await actOnApplication(
    db,
    'alice',
    { id: parked.operation_id, digest: parked.digest, action: 'approve' },
    now,
  );
  const continued = await continueAgentSession(
    db,
    'alice',
    { job: 'alice-0' },
    memoryEnv,
    now,
  );
  assert.equal(continued.begin, false);
  assert.equal(continued.park, null);
  assert.equal(continued.status, 'idle');
  assert.equal(begins(db), 0);
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT COUNT(*) c FROM events WHERE owner='alice' AND kind='Progress saved'",
      )
      .get().c,
    1,
  );
  db.sqlite.close();
});

void test('uncertain prepare does not retry the freeze', async () => {
  const db = database();
  await policy(db);
  await startAgentSession(db, 'alice', { job: 'alice-0' }, memoryEnv, now);
  const parked = await answerAgentSession(
    db,
    'alice',
    { job: 'alice-0', answer: 'Yes' },
    memoryEnv,
    now,
  );
  db.sqlite
    .prepare(
      "UPDATE agent_tool_calls SET status='uncertain' WHERE owner='alice' AND name='relay_prepare_application'",
    )
    .run();
  const operations = db.sqlite
    .prepare('SELECT COUNT(*) c FROM application_operations')
    .get().c;
  await assert.rejects(
    () => continueAgentSession(db, 'alice', { job: 'alice-0' }, memoryEnv, now),
    /waiting|uncertain|Human/i,
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) c FROM application_operations').get().c,
    operations,
  );
  const same = await startAgentSession(
    db,
    'alice',
    { job: 'alice-0' },
    memoryEnv,
    now,
  );
  assert.equal(same.session_id, parked.session_id);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) c FROM application_operations').get().c,
    operations,
  );
  db.sqlite.close();
});

void test('cancel stops the session; park copy names human work', () => {
  const copy = agentParkCopy(
    {
      session_id: 's',
      job_id: 'alice-0',
      provider: 'memory',
      status: 'requires_action',
      turn_id: 'turn_1',
      park: {
        kind: 'answer',
        turn_id: 'turn_1',
        call_id: 'call_2',
        name: 'relay_request_answer',
        arguments: { question: 'Work authorization?' },
      },
      operation_id: null,
      digest: null,
      authorized: false,
      begin: false,
      capabilities: [],
    },
    'Fictional role 0',
  );
  assert.equal(copy.title, 'Agent needs your answer');
  const ready = agentParkCopy(
    {
      session_id: 's',
      job_id: 'alice-0',
      provider: 'memory',
      status: 'requires_action',
      turn_id: 'turn_1',
      park: {
        kind: 'authorization',
        turn_id: 'turn_1',
        call_id: 'call_3',
        name: 'relay_prepare_application',
        arguments: {},
      },
      operation_id: 'op',
      digest: 'abc',
      authorized: false,
      begin: false,
      capabilities: [],
    },
    'Fictional role 0',
  );
  assert.match(ready.title, /Ready to submit/);
});

void test('cancel is owner-scoped and does not begin', async () => {
  const db = database();
  await policy(db);
  await startAgentSession(db, 'alice', { job: 'alice-0' }, memoryEnv, now);
  const cancelled = await cancelAgentSession(
    db,
    'alice',
    { job: 'alice-0' },
    memoryEnv,
    now,
  );
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(begins(db), 0);
  db.sqlite.close();
});

void test('session and tool-call storage caps abort extra inserts', () => {
  const db = database();
  const insertSession = db.sqlite.prepare(
    `INSERT INTO agent_sessions (id,owner,job_id,provider,provider_session_id,status,capabilities,provider_state,turn_id,created,updated)
     VALUES (?,?,?,'memory',?,'idle','[]','','',?,?)`,
  );
  for (let i = 0; i < 50; i++)
    insertSession.run(`s${i}`, 'alice', 'alice-0', `mem-${i}`, now, now);
  assert.throws(
    () => insertSession.run('s50', 'alice', 'alice-0', 'mem-50', now, now),
    /storage limit/i,
  );
  const insertCall = db.sqlite.prepare(
    `INSERT INTO agent_tool_calls (id,owner,session_id,turn_id,call_id,name,arguments,status,result,side_effect,created,updated)
     VALUES (?,?,?,'turn','call-'||?,'relay_read_job','{}','pending','','none',?,?)`,
  );
  for (let i = 0; i < 500; i++)
    insertCall.run(`c${i}`, 'alice', 's0', String(i), now, now);
  assert.throws(
    () => insertCall.run('c500', 'alice', 's0', '500', now, now),
    /storage limit/i,
  );
  db.sqlite.close();
});

void test('live start reserves maximum cents before fetch; exhausted budget does not fetch', async () => {
  const db = database();
  await policy(db);
  const live = {
    RELAY_AGENTS: 'live',
    RELAY_AGENTS_LIVE: '1',
    OPENAI_API_KEY: 'sk-fictional-key-1234567890',
  };
  let fetches = 0;
  const fetch = async (url) => {
    fetches += 1;
    assert.match(String(url), /^https:\/\/api\.openai.com\//);
    return new Response(
      JSON.stringify({ id: 'agt_fictional', status: 'idle' }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  await startAgentSession(db, 'alice', { job: 'alice-0' }, live, now, {
    fetch,
  });
  assert.ok(fetches >= 1);
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT used FROM security_counters WHERE scope='agents_usd:global:day'",
      )
      .get().used,
    50,
  );
  const db2 = database();
  await policy(db2);
  const day = String(Math.floor(Date.parse(now) / 86_400_000));
  db2.sqlite
    .prepare(
      "INSERT INTO security_counters (scope,period,used) VALUES ('agents_usd:global:day',?,1000)",
    )
    .run(day);
  let blocked = 0;
  await assert.rejects(
    () =>
      startAgentSession(db2, 'alice', { job: 'alice-0' }, live, now, {
        fetch: async () => {
          blocked += 1;
          return new Response('{}');
        },
      }),
    /cost limit/i,
  );
  assert.equal(blocked, 0);
  db.sqlite.close();
  db2.sqlite.close();
});
