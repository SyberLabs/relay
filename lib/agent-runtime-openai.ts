import {
  AgentRuntimeRefusal,
  type AgentRuntime,
  type FunctionToolDefinition,
  type RequiredAction,
  type RuntimeSnapshot,
  type ToolResultInput,
} from './agent-runtime.ts';
import {
  AGENT_HTTP_ATTEMPTS,
  AGENT_HTTP_TIMEOUT_MS,
  AGENT_SETTLE_DELAY_MS,
  AGENT_SETTLE_POLLS,
} from './agent-runtime-admission.ts';
import { AGENT_INSTRUCTIONS } from './agent-runtime-tools.ts';
import { parseArguments, toolResultPayload } from './agent-runtime-park.ts';

const SESSIONS = 'https://api.openai.com/v1/agents/sessions';
const AGENTS_ORIGIN = 'https://api.openai.com';
const AGENTS_PATH = '/v1/agents/';

export type OpenAIAgentsOptions = {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  settleDelayMs?: number;
  settlePolls?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function openaiSessionBody(input: {
  model: string;
  text: string;
  tools: FunctionToolDefinition[];
}) {
  return {
    agent: {
      model: input.model,
      instructions: AGENT_INSTRUCTIONS,
      tools: input.tools,
    },
    environment: { type: 'none' as const },
    input: input.text,
  };
}

export function assertAgentsUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AgentRuntimeRefusal(
      'Agents API destination is not allowed.',
      502,
    );
  }
  if (
    parsed.origin !== AGENTS_ORIGIN ||
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port !== '' ||
    !parsed.pathname.startsWith(AGENTS_PATH)
  ) {
    throw new AgentRuntimeRefusal(
      'Agents API destination is not allowed.',
      502,
    );
  }
}

export function mapRequiredAction(action: unknown): RequiredAction {
  const row =
    action && typeof action === 'object'
      ? (action as Record<string, unknown>)
      : {};
  const type =
    row.type === 'environment_connection'
      ? ('environment_connection' as const)
      : ('function_call' as const);
  return {
    type,
    turn_id: typeof row.turn_id === 'string' ? row.turn_id : '',
    call_id: typeof row.call_id === 'string' ? row.call_id : '',
    name: typeof row.name === 'string' ? row.name : '',
    arguments: parseArguments(row.arguments),
    ...(typeof row.environment_id === 'string'
      ? { environment_id: row.environment_id }
      : {}),
  };
}

export function isActionableSnapshot(snap: RuntimeSnapshot) {
  if (
    snap.status === 'idle' ||
    snap.status === 'cancelled' ||
    snap.status === 'failed'
  )
    return true;
  return snap.status === 'requires_action' && snap.required_actions.length > 0;
}

function snapshotFromSession(
  session: Record<string, unknown>,
  provider_state = '',
): RuntimeSnapshot {
  const required = Array.isArray(session.required_actions)
    ? session.required_actions.map(mapRequiredAction)
    : [];
  const statusRaw =
    typeof session.status === 'string' ? session.status : 'in_progress';
  const status =
    statusRaw === 'requires_action' ||
    statusRaw === 'idle' ||
    statusRaw === 'cancelled' ||
    statusRaw === 'failed' ||
    statusRaw === 'queued'
      ? statusRaw
      : 'in_progress';
  const sessionId = typeof session.id === 'string' ? session.id : '';
  const turn =
    required[0]?.turn_id ||
    (typeof session.turn_id === 'string' ? session.turn_id : '');
  return {
    provider: 'openai',
    provider_session_id: sessionId,
    status,
    turn_id: turn,
    required_actions: required,
    provider_state,
  };
}

function sleepFor(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createOpenAIAgentsRuntime(
  options: OpenAIAgentsOptions,
): AgentRuntime {
  const send = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? AGENT_HTTP_TIMEOUT_MS;
  const settleDelay = options.settleDelayMs ?? AGENT_SETTLE_DELAY_MS;
  const settlePolls = options.settlePolls ?? AGENT_SETTLE_POLLS;
  const sleep = options.sleep ?? sleepFor;

  async function openai(
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    assertAgentsUrl(url);
    let lastError: unknown;
    for (let attempt = 1; attempt <= AGENT_HTTP_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await send(url, {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'OpenAI-Beta': 'agents=v1',
            'Content-Type': 'application/json',
          },
        });
        const body = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) {
            throw new AgentRuntimeRefusal(
              'Agents API refused the request.',
              response.status === 429 ? 429 : 502,
            );
          }
          lastError = new AgentRuntimeRefusal(
            'Agents API is unavailable.',
            502,
          );
          continue;
        }
        return body;
      } catch (error) {
        lastError = error;
        if (error instanceof AgentRuntimeRefusal) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastError instanceof AgentRuntimeRefusal) throw lastError;
    throw new AgentRuntimeRefusal('Agents API is unavailable.', 502);
  }

  async function retrieve(id: string) {
    const session = await openai(`${SESSIONS}/${id}`, { method: 'GET' });
    return snapshotFromSession(session);
  }

  async function waitUntilSettled(
    id: string,
    initial?: RuntimeSnapshot,
  ): Promise<RuntimeSnapshot> {
    let snap = initial ?? (await retrieve(id));
    if (isActionableSnapshot(snap)) return snap;
    for (let attempt = 0; attempt < settlePolls; attempt += 1) {
      await sleep(settleDelay);
      snap = await retrieve(id);
      if (isActionableSnapshot(snap)) return snap;
    }
    return snap;
  }

  return {
    async start(input) {
      const session = await openai(SESSIONS, {
        method: 'POST',
        body: JSON.stringify(
          openaiSessionBody({
            model: options.model,
            text: input.text,
            tools: input.tools,
          }),
        ),
      });
      const first = snapshotFromSession(session);
      if (!first.provider_session_id) {
        throw new AgentRuntimeRefusal(
          'Agents API did not return a session.',
          502,
        );
      }
      return waitUntilSettled(first.provider_session_id, first);
    },
    async sendInput(id, text) {
      await openai(`${SESSIONS}/${id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              type: 'agent.session.input.message',
              input: [
                {
                  role: 'user',
                  content: [{ type: 'input_text', text }],
                },
              ],
            },
          ],
        }),
      });
      return waitUntilSettled(id);
    },
    async getState(id) {
      return retrieve(id);
    },
    async cancel(id) {
      await openai(`${SESSIONS}/${id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          events: [{ type: 'agent.session.input.cancel' }],
        }),
      });
      return waitUntilSettled(id);
    },
    async returnToolResult(id, result: ToolResultInput) {
      await openai(`${SESSIONS}/${id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              type: 'agent.session.input.tool_result',
              ...toolResultPayload(result),
            },
          ],
        }),
      });
      return waitUntilSettled(id);
    },
  };
}
