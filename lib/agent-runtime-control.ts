import {
  ApplicationRefusal,
  answerPreparation,
  inspectApplication,
  proposeApplication,
  upsertPreparation,
  type InspectView,
} from './application-automation.ts';
import { saveProgress } from './application-progress.ts';
import {
  AgentRuntimeRefusal,
  requireAgent,
  type AgentRuntime,
  type AgentRuntimeStatus,
  type RequiredAction,
  type RuntimeSnapshot,
  type ToolResultInput,
} from './agent-runtime.ts';
import {
  AGENT_ARGUMENTS_MAX,
  AGENT_INLINE_STEPS,
  AGENT_INPUT_MAX,
  admitAgentRuntime,
  boundAgentText,
  reserveLiveTurn,
  type AgentAdmissionEnv,
} from './agent-runtime-admission.ts';
import { createMemoryRuntime } from './agent-runtime-memory.ts';
import { createOpenAIAgentsRuntime } from './agent-runtime-openai.ts';
import { parkFromAction, parseArguments } from './agent-runtime-park.ts';
import {
  AGENT_FUNCTION_TOOLS,
  DEFAULT_AGENT_CAPABILITIES,
  isAllowedAgentTool,
  isForbiddenAgentTool,
} from './agent-runtime-tools.ts';
import type { AgentSessionView } from './agent-runtime-view.ts';
import {
  factClaimFromAnswer,
  factFieldKey,
  usableFact,
  type Fact,
} from './profile.ts';
import { loadFacts } from './store.ts';

export type AgentControlDeps = {
  fetch?: typeof fetch;
};

type SessionRow = {
  id: string;
  owner: string;
  job_id: string;
  provider: 'memory' | 'openai';
  provider_session_id: string;
  status: AgentRuntimeStatus;
  capabilities: string;
  provider_state: string;
  turn_id: string;
  created: string;
  updated: string;
};

type CallRow = {
  id: string;
  owner: string;
  session_id: string;
  turn_id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: 'pending' | 'returned' | 'uncertain';
  result: string;
  side_effect: string;
};

const START_TEXT =
  'Prepare the Relay application for this job. Read Relay for verified facts. If a required field is missing, request an answer. Prepare the exact application and wait. You cannot submit or begin.';

function wrapApp(error: unknown): never {
  if (error instanceof AgentRuntimeRefusal) throw error;
  if (error instanceof ApplicationRefusal)
    throw new AgentRuntimeRefusal(error.message, error.status);
  throw error;
}

function runtimeFor(
  env: AgentAdmissionEnv,
  jobId: string,
  deps: AgentControlDeps,
): AgentRuntime {
  const admission = admitAgentRuntime(env, true);
  if (admission.provider === 'memory') return createMemoryRuntime(jobId);
  return createOpenAIAgentsRuntime({
    apiKey: admission.apiKey,
    model: admission.model,
    fetch: deps.fetch,
  });
}

async function jobOwned(db: D1Database, owner: string, jobId: string) {
  const job = await db
    .prepare(
      'SELECT id,name,url,status,version,blocker FROM jobs WHERE owner=? AND id=?',
    )
    .bind(owner, jobId)
    .first<{
      id: string;
      name: string;
      url: string | null;
      status: string;
      version: number;
      blocker: string;
    }>();
  requireAgent(job, 'A selected job is unavailable.', 404);
  return job;
}

async function loadLatestSession(db: D1Database, owner: string, jobId: string) {
  return db
    .prepare(
      'SELECT * FROM agent_sessions WHERE owner=? AND job_id=? ORDER BY updated DESC LIMIT 1',
    )
    .bind(owner, jobId)
    .first<SessionRow>();
}

async function loadSession(db: D1Database, owner: string, sessionId: string) {
  const row = await db
    .prepare('SELECT * FROM agent_sessions WHERE owner=? AND id=?')
    .bind(owner, sessionId)
    .first<SessionRow>();
  requireAgent(row, 'Agent session is unavailable.', 404);
  return row;
}

async function loadCall(
  db: D1Database,
  owner: string,
  turnId: string,
  callId: string,
) {
  return db
    .prepare(
      'SELECT * FROM agent_tool_calls WHERE owner=? AND turn_id=? AND call_id=?',
    )
    .bind(owner, turnId, callId)
    .first<CallRow>();
}

async function loadPending(db: D1Database, owner: string, sessionId: string) {
  return db
    .prepare(
      `SELECT * FROM agent_tool_calls WHERE owner=? AND session_id=? AND status='pending' ORDER BY created DESC LIMIT 1`,
    )
    .bind(owner, sessionId)
    .first<CallRow>();
}

async function saveSession(
  db: D1Database,
  row: SessionRow,
  snap: RuntimeSnapshot,
  now: string,
) {
  await db
    .prepare(
      `UPDATE agent_sessions SET status=?, provider_session_id=?, provider_state=?, turn_id=?, updated=? WHERE owner=? AND id=?`,
    )
    .bind(
      snap.status,
      snap.provider_session_id || row.provider_session_id,
      snap.provider_state || row.provider_state,
      snap.turn_id || row.turn_id,
      now,
      row.owner,
      row.id,
    )
    .run();
  row.status = snap.status;
  row.provider_session_id = snap.provider_session_id || row.provider_session_id;
  row.provider_state = snap.provider_state || row.provider_state;
  row.turn_id = snap.turn_id || row.turn_id;
  row.updated = now;
}

async function upsertCall(
  db: D1Database,
  owner: string,
  sessionId: string,
  action: RequiredAction,
  status: CallRow['status'],
  result: string,
  sideEffect: string,
  now: string,
) {
  const args = JSON.stringify(action.arguments);
  requireAgent(
    new TextEncoder().encode(args).length <= AGENT_ARGUMENTS_MAX,
    'Tool arguments are too large.',
    413,
  );
  const prior = await loadCall(db, owner, action.turn_id, action.call_id);
  if (prior) {
    await db
      .prepare(
        `UPDATE agent_tool_calls SET status=?, result=?, side_effect=?, updated=? WHERE owner=? AND id=?`,
      )
      .bind(status, result, sideEffect, now, owner, prior.id)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO agent_tool_calls (id,owner,session_id,turn_id,call_id,name,arguments,status,result,side_effect,created,updated)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      crypto.randomUUID(),
      owner,
      sessionId,
      action.turn_id,
      action.call_id,
      action.name,
      args,
      status,
      result,
      sideEffect,
      now,
      now,
    )
    .run();
}

async function readJobPayload(
  db: D1Database,
  owner: string,
  jobId: string,
  now: string,
) {
  const job = await jobOwned(db, owner, jobId);
  const facts = (await loadFacts(db, owner))
    .filter((f) => usableFact(f, now))
    .map((f) => ({
      id: f.id,
      claim: f.claim,
      field_key: f.field_key || null,
      status: f.status,
    }));
  let missing: string[] = [];
  try {
    missing = (await inspectApplication(db, owner, jobId, now)).missing;
  } catch {
    missing = ['Work authorization'];
  }
  if (
    !missing.length &&
    !facts.some((f) =>
      String(f.field_key || '').startsWith('work_authorization'),
    )
  )
    missing = ['Work authorization'];
  return {
    job_id: job.id,
    name: job.name,
    url: job.url,
    status: job.status,
    version: job.version,
    facts,
    missing,
  };
}

async function proposeAnswerFact(
  db: D1Database,
  owner: string,
  fieldKey: string,
  question: string,
  answer: string,
  now: string,
) {
  const claim = factClaimFromAnswer(question, answer);
  const existing = await db
    .prepare('SELECT * FROM profile_facts WHERE owner=? AND field_key=?')
    .bind(owner, fieldKey)
    .first<Fact>();
  if (existing?.status === 'Verified') {
    return {
      answer,
      claim: existing.claim,
      status: 'Verified',
      verified: true,
      unchanged_verified: true,
    };
  }
  await db
    .prepare(
      `INSERT INTO profile_facts (id,owner,claim,evidence,tag,status,field_key,created)
       SELECT ?,?,?,?,'detail','Proposed',?,?
       WHERE NOT EXISTS (SELECT 1 FROM profile_facts WHERE owner=? AND claim=? AND status!='Retired')
       ON CONFLICT(owner, field_key) DO UPDATE SET claim=excluded.claim,
         evidence=excluded.evidence, tag=excluded.tag, status='Proposed',
         verified=NULL, expires=NULL
       WHERE profile_facts.status IN ('Proposed','Retired')`,
    )
    .bind(
      crypto.randomUUID(),
      owner,
      claim,
      `Agent request on ${question}`.slice(0, 2000),
      fieldKey,
      now,
      owner,
      claim,
    )
    .run();
  const row = await db
    .prepare(
      'SELECT status,claim FROM profile_facts WHERE owner=? AND field_key=?',
    )
    .bind(owner, fieldKey)
    .first<{ status: string; claim: string }>();
  return {
    answer,
    claim: row?.claim || claim,
    status: row?.status || 'Proposed',
    verified: row?.status === 'Verified',
    unchanged_verified: false,
  };
}

function replayResult(row: CallRow): ToolResultInput {
  const parsed = parseArguments(row.result);
  return {
    turn_id: row.turn_id,
    call_id: row.call_id,
    success: parsed.success !== false,
    output: typeof parsed.output === 'string' ? parsed.output : row.result,
    error: typeof parsed.error === 'string' ? parsed.error : undefined,
  };
}

async function freezePrepare(
  db: D1Database,
  owner: string,
  jobId: string,
  sessionId: string,
  action: RequiredAction,
  now: string,
) {
  const prior = await loadCall(db, owner, action.turn_id, action.call_id);
  if (prior?.status === 'uncertain') {
    throw new AgentRuntimeRefusal(
      'Previous prepare outcome is uncertain. Inspect saved work; do not retry.',
      409,
    );
  }
  if (prior?.status === 'pending' && prior.result) {
    return;
  }
  const args = action.arguments;
  const fields = Array.isArray(args.fields) ? args.fields : [];
  if (
    fields.some(
      (f) => f && typeof f === 'object' && (f as { unknown?: boolean }).unknown,
    )
  ) {
    await upsertCall(
      db,
      owner,
      sessionId,
      action,
      'returned',
      JSON.stringify({
        success: false,
        error: 'Request answers for unknown fields before preparing.',
      }),
      'none',
      now,
    );
    throw new AgentRuntimeRefusal(
      'Request answers for unknown fields before preparing.',
      409,
    );
  }
  let inspect: InspectView | null = null;
  try {
    inspect = await inspectApplication(db, owner, jobId, now);
  } catch {
    inspect = null;
  }
  const operationId = `agt:${sessionId}:${action.call_id}`.slice(0, 100);
  try {
    await upsertPreparation(
      db,
      owner,
      {
        job: jobId,
        actor: 'Relay Agents runtime',
        destination: args.destination,
        fields,
        files: args.files || [],
        preparation_revision: inspect?.preparation_revision ?? null,
      },
      now,
    );
    const job = await jobOwned(db, owner, jobId);
    const op = await proposeApplication(
      db,
      owner,
      {
        id: operationId,
        job: jobId,
        version: job.version,
        actor: 'Relay Agents runtime',
        manifest: {
          destination: args.destination,
          fields: fields.map((f) => ({
            label: String((f as { label: string }).label),
            value: String((f as { value: string }).value),
          })),
          files: args.files || [],
        },
      },
      now,
    );
    await upsertCall(
      db,
      owner,
      sessionId,
      action,
      'pending',
      JSON.stringify({
        operation_id: op.id,
        digest: op.digest,
        begin: false,
      }),
      'prepare_freeze',
      now,
    );
  } catch (error) {
    const existing = await db
      .prepare(
        'SELECT id,digest,state FROM application_operations WHERE owner=? AND id=?',
      )
      .bind(owner, operationId)
      .first<{ id: string; digest: string; state: string }>();
    if (existing) {
      await upsertCall(
        db,
        owner,
        sessionId,
        action,
        'pending',
        JSON.stringify({
          operation_id: existing.id,
          digest: existing.digest,
          begin: false,
        }),
        'prepare_freeze',
        now,
      );
      return;
    }
    if (
      error instanceof ApplicationRefusal ||
      error instanceof AgentRuntimeRefusal
    ) {
      await upsertCall(
        db,
        owner,
        sessionId,
        action,
        'returned',
        JSON.stringify({ success: false, error: error.message }),
        'none',
        now,
      );
      throw error instanceof AgentRuntimeRefusal
        ? error
        : new AgentRuntimeRefusal(error.message, error.status);
    }
    await upsertCall(
      db,
      owner,
      sessionId,
      action,
      'uncertain',
      JSON.stringify({ error: 'Prepare outcome is uncertain.' }),
      'prepare_freeze',
      now,
    );
    wrapApp(error);
  }
}

async function executeImmediate(
  db: D1Database,
  owner: string,
  jobId: string,
  sessionId: string,
  action: RequiredAction,
  now: string,
) {
  if (action.name === 'relay_read_job') {
    const output = JSON.stringify(await readJobPayload(db, owner, jobId, now));
    await upsertCall(
      db,
      owner,
      sessionId,
      action,
      'returned',
      JSON.stringify({ success: true, output }),
      'none',
      now,
    );
    return {
      turn_id: action.turn_id,
      call_id: action.call_id,
      success: true,
      output,
    };
  }
  if (action.name === 'relay_record_progress') {
    const job = await jobOwned(db, owner, jobId);
    const note =
      typeof action.arguments.note === 'string'
        ? action.arguments.note
        : 'Agent progress';
    const blocker =
      typeof action.arguments.blocker === 'string'
        ? action.arguments.blocker
        : '';
    const saved = await saveProgress(
      db,
      owner,
      {
        action: 'progress',
        id: jobId,
        version: job.version,
        operation_id: `agent:${sessionId}`.slice(0, 128),
        note,
        blocker,
      },
      now,
    );
    requireAgent(
      saved.status === 200,
      saved.data.error || 'Progress failed.',
      saved.status,
    );
    const output = JSON.stringify({ ok: true, begin: false });
    await upsertCall(
      db,
      owner,
      sessionId,
      action,
      'returned',
      JSON.stringify({ success: true, output }),
      'progress',
      now,
    );
    return {
      turn_id: action.turn_id,
      call_id: action.call_id,
      success: true,
      output,
    };
  }
  throw new AgentRuntimeRefusal('Unknown agent tool.', 400);
}

async function processActions(
  db: D1Database,
  row: SessionRow,
  runtime: AgentRuntime,
  snap: RuntimeSnapshot,
  now: string,
) {
  let current = snap;
  for (let step = 0; step < AGENT_INLINE_STEPS; step += 1) {
    await saveSession(db, row, current, now);
    if (current.status !== 'requires_action' || !current.required_actions[0])
      return current;
    const action = current.required_actions[0];
    if (isForbiddenAgentTool(action.name) || !isAllowedAgentTool(action.name)) {
      current = await runtime.returnToolResult(
        row.provider_session_id,
        {
          turn_id: action.turn_id,
          call_id: action.call_id,
          success: false,
          error: 'Tool is not allowed.',
        },
        current.provider_state,
      );
      continue;
    }
    const existing = await loadCall(
      db,
      row.owner,
      action.turn_id,
      action.call_id,
    );
    if (existing?.status === 'uncertain') {
      throw new AgentRuntimeRefusal(
        'Previous tool outcome is uncertain. Inspect saved work; do not retry.',
        409,
      );
    }
    if (existing?.status === 'returned') {
      current = await runtime.returnToolResult(
        row.provider_session_id,
        replayResult(existing),
        current.provider_state,
      );
      continue;
    }
    const park = parkFromAction(action);
    if (park?.kind === 'answer') {
      await upsertCall(
        db,
        row.owner,
        row.id,
        action,
        'pending',
        '',
        'none',
        now,
      );
      current = {
        ...current,
        status: 'requires_action',
        turn_id: action.turn_id,
      };
      await saveSession(db, row, current, now);
      return current;
    }
    if (park?.kind === 'authorization') {
      await freezePrepare(db, row.owner, row.job_id, row.id, action, now);
      current = {
        ...current,
        status: 'requires_action',
        turn_id: action.turn_id,
      };
      await saveSession(db, row, current, now);
      return current;
    }
    const result = await executeImmediate(
      db,
      row.owner,
      row.job_id,
      row.id,
      action,
      now,
    );
    current = await runtime.returnToolResult(
      row.provider_session_id,
      result,
      current.provider_state,
    );
  }
  await saveSession(db, row, current, now);
  return current;
}

async function viewFrom(
  db: D1Database,
  row: SessionRow,
): Promise<AgentSessionView> {
  const pending = await loadPending(db, row.owner, row.id);
  const args = pending ? parseArguments(pending.arguments) : {};
  const result = pending ? parseArguments(pending.result) : {};
  const park = pending
    ? parkFromAction({
        type: 'function_call',
        turn_id: pending.turn_id,
        call_id: pending.call_id,
        name: pending.name,
        arguments: args,
      })
    : null;
  let authorized = false;
  const operationId =
    typeof result.operation_id === 'string' ? result.operation_id : null;
  if (operationId) {
    const op = await db
      .prepare(
        'SELECT state FROM application_operations WHERE owner=? AND id=?',
      )
      .bind(row.owner, operationId)
      .first<{ state: string }>();
    authorized = op?.state === 'authorized';
  }
  return {
    session_id: row.id,
    job_id: row.job_id,
    provider: row.provider,
    status: row.status,
    turn_id: row.turn_id,
    park,
    operation_id: operationId,
    digest: typeof result.digest === 'string' ? result.digest : null,
    authorized,
    begin: false,
    capabilities: JSON.parse(row.capabilities) as string[],
  };
}

export async function getAgentSession(
  db: D1Database,
  owner: string,
  jobId: string,
  env: AgentAdmissionEnv,
  _now: string,
  _deps: AgentControlDeps = {},
): Promise<{
  mode: ReturnType<typeof admitOrOff>;
  session: AgentSessionView | null;
}> {
  const mode = admitOrOff(env);
  await jobOwned(db, owner, jobId);
  const row = await loadLatestSession(db, owner, jobId);
  return { mode, session: row ? await viewFrom(db, row) : null };
}

function admitOrOff(env: AgentAdmissionEnv) {
  try {
    return admitAgentRuntime(env, false).mode;
  } catch {
    return 'off' as const;
  }
}

export async function startAgentSession(
  db: D1Database,
  owner: string,
  input: { job: string; text?: string },
  env: AgentAdmissionEnv,
  now: string,
  deps: AgentControlDeps = {},
) {
  const jobId = String(input.job || '');
  await jobOwned(db, owner, jobId);
  const text = boundAgentText(input.text ?? START_TEXT, AGENT_INPUT_MAX);
  const admission = admitAgentRuntime(env, true);
  const existing = await loadLatestSession(db, owner, jobId);
  if (
    existing &&
    ['queued', 'in_progress', 'requires_action', 'idle'].includes(
      existing.status,
    )
  ) {
    return viewFrom(db, existing);
  }
  const busy = await db
    .prepare(
      `SELECT id FROM agent_sessions WHERE owner=? AND status IN ('queued','in_progress') LIMIT 1`,
    )
    .bind(owner)
    .first();
  requireAgent(!busy, 'Another agent turn is already in progress.', 409);
  if (admission.provider === 'openai')
    await reserveLiveTurn(db, owner, now, env, admission.reserveCents);
  const id = crypto.randomUUID();
  const providerSessionId = admission.provider === 'memory' ? `mem_${id}` : '';
  await db
    .prepare(
      `INSERT INTO agent_sessions (id,owner,job_id,provider,provider_session_id,status,capabilities,provider_state,turn_id,created,updated)
       VALUES (?,?,?,?,?,'queued',?,?,?,?,?)`,
    )
    .bind(
      id,
      owner,
      jobId,
      admission.provider,
      providerSessionId || `pending_${id}`,
      JSON.stringify(DEFAULT_AGENT_CAPABILITIES),
      '',
      '',
      now,
      now,
    )
    .run();
  const row = await loadSession(db, owner, id);
  const runtime = runtimeFor(env, jobId, deps);
  let snap: RuntimeSnapshot;
  try {
    snap = await runtime.start({
      job_id: jobId,
      text,
      tools: AGENT_FUNCTION_TOOLS,
      provider_session_id: row.provider_session_id,
    });
  } catch (error) {
    await db
      .prepare(
        `UPDATE agent_sessions SET status='failed', updated=? WHERE owner=? AND id=?`,
      )
      .bind(now, owner, id)
      .run();
    wrapApp(error);
  }
  await processActions(db, row, runtime, snap, now);
  return viewFrom(db, await loadSession(db, owner, id));
}

export async function answerAgentSession(
  db: D1Database,
  owner: string,
  input: {
    job: string;
    answer?: string;
    remember?: boolean;
    verify?: boolean;
    choice?: string;
  },
  env: AgentAdmissionEnv,
  now: string,
  deps: AgentControlDeps = {},
) {
  requireAgent(
    input.remember !== true,
    'remember:true is not allowed on answers.',
    400,
  );
  requireAgent(input.verify !== true, 'The agent cannot verify facts.', 403);
  requireAgent(
    typeof input.answer === 'string' &&
      input.answer.trim() &&
      input.answer.length <= 20000,
    'Provide an answer.',
  );
  const admission = admitAgentRuntime(env, true);
  const row = await loadLatestSession(db, owner, String(input.job || ''));
  requireAgent(row, 'Agent session is unavailable.', 404);
  requireAgent(row.status !== 'cancelled', 'Agent session was cancelled.', 409);
  const pending = await loadPending(db, owner, row.id);
  requireAgent(
    pending && pending.name === 'relay_request_answer',
    'No pending question.',
    409,
  );
  if (pending.status === 'returned') {
    return viewFrom(db, row);
  }
  const args = parseArguments(pending.arguments);
  const question =
    typeof args.question === 'string'
      ? args.question
      : 'Missing application field';
  const fieldKey =
    typeof args.field_key === 'string' &&
    /^[\w.:-]{1,128}$/.test(args.field_key)
      ? args.field_key
      : factFieldKey(question);
  const proposed = await proposeAnswerFact(
    db,
    owner,
    fieldKey,
    question,
    input.answer.trim(),
    now,
  );
  const label = typeof args.label === 'string' ? args.label : '';
  if (label) {
    try {
      const inspect = await inspectApplication(db, owner, row.job_id, now);
      if (inspect.fields.some((f) => f.label === label)) {
        await answerPreparation(
          db,
          owner,
          {
            job: row.job_id,
            label,
            value: input.answer.trim(),
            preparation_revision: inspect.preparation_revision,
          },
          now,
        );
      }
    } catch {
      /* Preparing a field is optional; the Proposed fact is canonical. */
    }
  }
  const output = JSON.stringify({
    ...proposed,
    begin: false,
  });
  await upsertCall(
    db,
    owner,
    row.id,
    {
      type: 'function_call',
      turn_id: pending.turn_id,
      call_id: pending.call_id,
      name: pending.name,
      arguments: args,
    },
    'returned',
    JSON.stringify({ success: true, output }),
    'propose_fact',
    now,
  );
  const runtime = runtimeFor(env, row.job_id, deps);
  if (admission.provider === 'openai')
    await reserveLiveTurn(db, owner, now, env, admission.reserveCents);
  const snap = await runtime.returnToolResult(
    row.provider_session_id,
    {
      turn_id: pending.turn_id,
      call_id: pending.call_id,
      success: true,
      output,
    },
    row.provider_state,
  );
  await processActions(db, row, runtime, snap, now);
  return viewFrom(db, await loadSession(db, owner, row.id));
}

export async function continueAgentSession(
  db: D1Database,
  owner: string,
  input: { job: string },
  env: AgentAdmissionEnv,
  now: string,
  deps: AgentControlDeps = {},
) {
  const admission = admitAgentRuntime(env, true);
  const row = await loadLatestSession(db, owner, String(input.job || ''));
  requireAgent(row, 'Agent session is unavailable.', 404);
  const pending = await loadPending(db, owner, row.id);
  requireAgent(
    pending && pending.name === 'relay_prepare_application',
    'No frozen application is waiting.',
    409,
  );
  const meta = parseArguments(pending.result);
  requireAgent(
    typeof meta.operation_id === 'string',
    'Frozen digest is missing.',
    409,
  );
  const op = await db
    .prepare(
      'SELECT id,digest,state FROM application_operations WHERE owner=? AND id=?',
    )
    .bind(owner, meta.operation_id)
    .first<{ id: string; digest: string; state: string }>();
  requireAgent(op, 'Frozen digest is unavailable.', 404);
  requireAgent(
    op.state === 'authorized',
    'Human acceptance is required before the agent may continue.',
    409,
  );
  const output = JSON.stringify({
    frozen: true,
    digest: op.digest,
    operation_id: op.id,
    authorized: true,
    begin: false,
  });
  await upsertCall(
    db,
    owner,
    row.id,
    {
      type: 'function_call',
      turn_id: pending.turn_id,
      call_id: pending.call_id,
      name: pending.name,
      arguments: parseArguments(pending.arguments),
    },
    'returned',
    JSON.stringify({ success: true, output }),
    'prepare_freeze',
    now,
  );
  const runtime = runtimeFor(env, row.job_id, deps);
  if (admission.provider === 'openai')
    await reserveLiveTurn(db, owner, now, env, admission.reserveCents);
  const snap = await runtime.returnToolResult(
    row.provider_session_id,
    {
      turn_id: pending.turn_id,
      call_id: pending.call_id,
      success: true,
      output,
    },
    row.provider_state,
  );
  await processActions(db, row, runtime, snap, now);
  return viewFrom(db, await loadSession(db, owner, row.id));
}

export async function cancelAgentSession(
  db: D1Database,
  owner: string,
  input: { job: string },
  env: AgentAdmissionEnv,
  now: string,
  deps: AgentControlDeps = {},
) {
  admitAgentRuntime(env, true);
  const row = await loadLatestSession(db, owner, String(input.job || ''));
  requireAgent(row, 'Agent session is unavailable.', 404);
  const runtime = runtimeFor(env, row.job_id, deps);
  const snap = await runtime.cancel(
    row.provider_session_id,
    row.provider_state,
  );
  await saveSession(db, row, { ...snap, status: 'cancelled' }, now);
  return viewFrom(db, await loadSession(db, owner, row.id));
}

export function agentPublicMode(env: AgentAdmissionEnv) {
  return admitOrOff(env);
}
