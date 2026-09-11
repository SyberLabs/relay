import type {
  AgentRuntime,
  RequiredAction,
  RuntimeSnapshot,
  ToolResultInput,
} from './agent-runtime.ts';
import { parseArguments } from './agent-runtime-park.ts';

export type MemoryPhase =
  | 'await_read'
  | 'await_answer'
  | 'await_prepare'
  | 'await_progress'
  | 'idle'
  | 'cancelled'
  | 'failed';

export type MemoryState = {
  job_id: string;
  turn_id: string;
  seq: number;
  phase: MemoryPhase;
  destination?: string;
  answer?: string;
  question?: string;
  field_key?: string;
  label?: string;
};

function snapshot(
  state: MemoryState,
  providerSessionId: string,
  actions: RequiredAction[] = [],
): RuntimeSnapshot {
  const status =
    state.phase === 'cancelled'
      ? 'cancelled'
      : state.phase === 'failed'
        ? 'failed'
        : state.phase === 'idle'
          ? 'idle'
          : 'requires_action';
  return {
    provider: 'memory',
    provider_session_id: providerSessionId,
    status,
    turn_id: state.turn_id,
    required_actions: actions,
    provider_state: JSON.stringify(state),
  };
}

function call(
  state: MemoryState,
  name: string,
  args: Record<string, unknown>,
): RequiredAction {
  return {
    type: 'function_call',
    turn_id: state.turn_id,
    call_id: `call_${state.seq}`,
    name,
    arguments: args,
  };
}

export function parseMemoryState(raw: string, jobId: string): MemoryState {
  if (!raw) {
    return {
      job_id: jobId,
      turn_id: 'turn_1',
      seq: 1,
      phase: 'await_read',
    };
  }
  const parsed = JSON.parse(raw) as MemoryState;
  if (!parsed || parsed.job_id !== jobId)
    return {
      job_id: jobId,
      turn_id: 'turn_1',
      seq: 1,
      phase: 'failed',
    };
  return parsed;
}

function prepareArgs(state: MemoryState) {
  return {
    destination: state.destination,
    fields: [
      { label: 'Full name', value: 'Avery Example', unknown: false },
      {
        label: state.label || 'Work authorization',
        value: state.answer || '',
        unknown: false,
      },
    ],
    files: [],
  };
}

function afterRead(
  state: MemoryState,
  providerSessionId: string,
  output: string,
): RuntimeSnapshot {
  const body = parseArguments(output);
  const facts = Array.isArray(body.facts) ? body.facts : [];
  const verified = facts.some(
    (f) =>
      f &&
      typeof f === 'object' &&
      typeof (f as { field_key?: string }).field_key === 'string' &&
      String((f as { field_key: string }).field_key).startsWith(
        'work_authorization',
      ),
  );
  const destination =
    typeof body.url === 'string' && body.url.startsWith('https://')
      ? body.url
      : '';
  if (!destination) {
    return snapshot({ ...state, phase: 'failed' }, providerSessionId);
  }
  if (verified) {
    const next = {
      ...state,
      destination,
      seq: state.seq + 1,
      phase: 'await_prepare' as const,
      answer:
        typeof (facts[0] as { claim?: string } | undefined)?.claim === 'string'
          ? String((facts[0] as { claim: string }).claim)
          : 'Authorized to work.',
      question: 'Are you authorized to work in the United States?',
      field_key: 'work_authorization.us',
      label: 'Work authorization',
    };
    return snapshot(next, providerSessionId, [
      call(next, 'relay_prepare_application', prepareArgs(next)),
    ]);
  }
  const next = {
    ...state,
    destination,
    seq: state.seq + 1,
    phase: 'await_answer' as const,
    question: 'Are you authorized to work in the United States?',
    field_key: 'work_authorization.us',
    label: 'Work authorization',
  };
  return snapshot(next, providerSessionId, [
    call(next, 'relay_request_answer', {
      field_key: next.field_key,
      question: next.question,
      label: next.label,
    }),
  ]);
}

export function memoryStart(
  jobId: string,
  providerSessionId: string,
): RuntimeSnapshot {
  const state: MemoryState = {
    job_id: jobId,
    turn_id: 'turn_1',
    seq: 1,
    phase: 'await_read',
  };
  return snapshot(state, providerSessionId, [
    call(state, 'relay_read_job', { job_id: jobId }),
  ]);
}

export function memoryReturnToolResult(
  state: MemoryState,
  providerSessionId: string,
  result: ToolResultInput,
): RuntimeSnapshot {
  if (state.phase === 'cancelled') return snapshot(state, providerSessionId);
  if (!result.success) {
    return snapshot({ ...state, phase: 'failed' }, providerSessionId);
  }
  if (state.phase === 'await_read')
    return afterRead(state, providerSessionId, result.output || '');
  if (state.phase === 'await_answer') {
    const body = parseArguments(result.output);
    const next = {
      ...state,
      seq: state.seq + 1,
      phase: 'await_prepare' as const,
      answer:
        typeof body.answer === 'string' && body.answer
          ? body.answer
          : typeof body.claim === 'string'
            ? body.claim
            : 'Answered.',
    };
    return snapshot(next, providerSessionId, [
      call(next, 'relay_prepare_application', prepareArgs(next)),
    ]);
  }
  if (state.phase === 'await_prepare') {
    const next = {
      ...state,
      seq: state.seq + 1,
      phase: 'await_progress' as const,
    };
    return snapshot(next, providerSessionId, [
      call(next, 'relay_record_progress', {
        note: 'Digest frozen. Waiting for the browser operative. Agent cannot begin.',
        blocker: '',
      }),
    ]);
  }
  if (state.phase === 'await_progress') {
    return snapshot({ ...state, phase: 'idle' }, providerSessionId);
  }
  return snapshot(state, providerSessionId);
}

export function memoryCancel(
  state: MemoryState,
  providerSessionId: string,
): RuntimeSnapshot {
  return snapshot({ ...state, phase: 'cancelled' }, providerSessionId);
}

export function createMemoryRuntime(jobId: string): AgentRuntime {
  return {
    async start(input) {
      return memoryStart(jobId, input.provider_session_id);
    },
    async sendInput(id, _text, state) {
      return snapshot(parseMemoryState(state, jobId), id);
    },
    async getState(id, state) {
      const parsed = parseMemoryState(state, jobId);
      if (parsed.phase === 'await_read') return memoryStart(jobId, id);
      if (parsed.phase === 'await_answer') {
        return snapshot(parsed, id, [
          call(parsed, 'relay_request_answer', {
            field_key: parsed.field_key,
            question: parsed.question,
            label: parsed.label,
          }),
        ]);
      }
      if (parsed.phase === 'await_prepare') {
        return snapshot(parsed, id, [
          call(parsed, 'relay_prepare_application', prepareArgs(parsed)),
        ]);
      }
      if (parsed.phase === 'await_progress') {
        return snapshot(parsed, id, [
          call(parsed, 'relay_record_progress', {
            note: 'Digest frozen. Waiting for the browser operative. Agent cannot begin.',
            blocker: '',
          }),
        ]);
      }
      return snapshot(parsed, id);
    },
    async cancel(id, state) {
      return memoryCancel(parseMemoryState(state, jobId), id);
    },
    async returnToolResult(id, result, state) {
      return memoryReturnToolResult(parseMemoryState(state, jobId), id, result);
    },
  };
}
