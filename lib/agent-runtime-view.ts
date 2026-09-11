import type {
  AgentRuntimeProvider,
  AgentRuntimeStatus,
} from './agent-runtime.ts';
import type { AgentRuntimeMode } from './agent-runtime-admission.ts';
import type { ParkedCall } from './agent-runtime-park.ts';

export type AgentSessionView = {
  session_id: string;
  job_id: string;
  provider: AgentRuntimeProvider;
  status: AgentRuntimeStatus;
  turn_id: string;
  park: ParkedCall | null;
  operation_id: string | null;
  digest: string | null;
  authorized: boolean;
  begin: false;
  capabilities: string[];
};

export function agentParkCopy(view: AgentSessionView | null, jobName: string) {
  if (!view) return { title: '', detail: '', action: 'none' as const };
  if (view.status === 'cancelled') {
    return {
      title: 'Agent session cancelled',
      detail: 'The agent cannot begin. Start a new session if you need one.',
      action: 'start' as const,
    };
  }
  if (view.status === 'failed') {
    return {
      title: 'Agent session failed',
      detail:
        'Inspect saved work. An uncertain Submit stays uncertain; do not retry it.',
      action: 'start' as const,
    };
  }
  if (view.park?.kind === 'answer') {
    const question =
      typeof view.park.arguments.question === 'string'
        ? view.park.arguments.question
        : 'The agent needs a missing fact.';
    return {
      title: 'Agent needs your answer',
      detail: question,
      action: 'answer' as const,
    };
  }
  if (view.park?.kind === 'authorization') {
    return {
      title: `Ready to submit ${jobName}`.trim(),
      detail:
        'Inspect the frozen digest, then Accept & send. That is not an agent tool. The agent cannot begin.',
      action: 'authorize' as const,
    };
  }
  if (view.status === 'queued' || view.status === 'in_progress') {
    return {
      title: 'Agent is working',
      detail:
        'The runtime still owns this turn. Refresh retrieves the session; the workspace poll does not call OpenAI.',
      action: 'working' as const,
    };
  }
  if (view.status === 'idle') {
    return {
      title: 'Agent is idle',
      detail:
        'The agent cannot click Submit or call begin. The browser operative remains the effector.',
      action: 'idle' as const,
    };
  }
  return { title: 'Agent session', detail: '', action: 'none' as const };
}

export function agentModeCopy(mode: AgentRuntimeMode) {
  if (mode === 'off') return 'Cognitive runtime is off.';
  if (mode === 'memory')
    return 'Memory runtime is on. No upstream model calls.';
  return 'Live Agents API is enabled. OpenAI stores session state in the United States without Zero Data Retention.';
}
