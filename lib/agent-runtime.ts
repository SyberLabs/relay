export const AGENT_RUNTIME_CAPABILITIES = [
  'read_context',
  'propose_answer',
  'stage_draft',
  'prepare_application',
  'record_progress',
] as const;
export type AgentRuntimeCapability =
  (typeof AGENT_RUNTIME_CAPABILITIES)[number];

export const AGENT_RUNTIME_STATUSES = [
  'queued',
  'in_progress',
  'requires_action',
  'idle',
  'cancelled',
  'failed',
] as const;
export type AgentRuntimeStatus = (typeof AGENT_RUNTIME_STATUSES)[number];

export type AgentRuntimeProvider = 'memory' | 'openai';

export type RequiredAction = {
  type: 'function_call' | 'environment_connection';
  turn_id: string;
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  environment_id?: string;
};

export type ToolResultInput = {
  turn_id: string;
  call_id: string;
  success: boolean;
  output?: string;
  error?: string;
};

export type RuntimeSnapshot = {
  provider: AgentRuntimeProvider;
  provider_session_id: string;
  status: AgentRuntimeStatus;
  turn_id: string;
  required_actions: RequiredAction[];
  provider_state: string;
};

export type FunctionToolDefinition = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentRuntime = {
  start(input: {
    job_id: string;
    text: string;
    tools: FunctionToolDefinition[];
    provider_session_id: string;
  }): Promise<RuntimeSnapshot>;
  sendInput(
    providerSessionId: string,
    text: string,
    state: string,
  ): Promise<RuntimeSnapshot>;
  getState(providerSessionId: string, state: string): Promise<RuntimeSnapshot>;
  cancel(providerSessionId: string, state: string): Promise<RuntimeSnapshot>;
  returnToolResult(
    providerSessionId: string,
    result: ToolResultInput,
    state: string,
  ): Promise<RuntimeSnapshot>;
  subscribe?(
    providerSessionId: string,
    onEvent: (snapshot: RuntimeSnapshot) => void,
  ): { stop(): void };
};

export class AgentRuntimeRefusal extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export function requireAgent(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AgentRuntimeRefusal(message, status);
}
