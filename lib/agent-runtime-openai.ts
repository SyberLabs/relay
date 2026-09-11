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
} from './agent-runtime-admission.ts';
import { AGENT_INSTRUCTIONS } from './agent-runtime-tools.ts';
import { parseArguments } from './agent-runtime-park.ts';

const SESSIONS = 'https://api.openai.com/v1/agents/sessions';

export type OpenAIAgentsOptions = {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
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
    environment: { type: 'none' },
    input: input.text,
  };
}

function snapshotFromSession(
  session: Record<string, unknown>,
  provider_state = '',
): RuntimeSnapshot {
  const required = Array.isArray(session.required_actions)
    ? (session.required_actions as RequiredAction[]).map((action) => ({
        type: 'function_call' as const,
        turn_id: String(action.turn_id || ''),
        call_id: String(action.call_id || ''),
        name: String(action.name || ''),
        arguments: parseArguments(action.arguments),
      }))
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

export function createOpenAIAgentsRuntime(
  options: OpenAIAgentsOptions,
): AgentRuntime {
  const send = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? AGENT_HTTP_TIMEOUT_MS;
  async function openai(
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
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
      return snapshotFromSession(session);
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
      return retrieve(id);
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
      return retrieve(id);
    },
    async returnToolResult(id, result: ToolResultInput) {
      await openai(`${SESSIONS}/${id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              type: 'agent.session.input.tool_result',
              turn_id: result.turn_id,
              call_id: result.call_id,
              ...(result.success
                ? { success: true, output: result.output ?? '' }
                : { success: false, error: result.error || 'Tool failed.' }),
            },
          ],
        }),
      });
      return retrieve(id);
    },
  };
}
