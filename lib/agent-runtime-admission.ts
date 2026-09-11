import { reserve } from '../deploy/security.mjs';
import {
  AgentRuntimeRefusal,
  requireAgent,
  type AgentRuntimeProvider,
} from './agent-runtime.ts';

export const AGENT_INPUT_MAX = 32_000;
export const AGENT_ARGUMENTS_MAX = 16_000;
export const AGENT_OUTPUT_MAX = 16_000;
export const AGENT_HTTP_TIMEOUT_MS = 60_000;
export const AGENT_HTTP_ATTEMPTS = 3;
export const AGENT_SETTLE_POLLS = 15;
export const AGENT_SETTLE_DELAY_MS = 2_000;
export const AGENT_INLINE_STEPS = 8;
export const HARD_USER_DAY_CENTS = 100;
export const HARD_GLOBAL_DAY_CENTS = 1_000;
export const HARD_GLOBAL_MONTH_CENTS = 5_000;
export const HARD_RESERVE_CENTS = 50;
export const LIVE_MODEL = 'gpt-6-astra';
export const MEMORY_MODEL = 'relay-memory';

export type AgentRuntimeMode = 'off' | 'memory' | 'live';

export type AgentAdmissionEnv = {
  RELAY_AGENTS?: string;
  RELAY_AGENTS_LIVE?: string;
  RELAY_AGENTS_MODEL?: string;
  RELAY_PAUSE?: string;
  OPENAI_API_KEY?: string;
  RELAY_AGENTS_USER_DAY_CENTS?: string;
  RELAY_AGENTS_GLOBAL_DAY_CENTS?: string;
  RELAY_AGENTS_GLOBAL_MONTH_CENTS?: string;
  RELAY_AGENTS_RESERVE_CENTS?: string;
};

export type AgentAdmission = {
  mode: AgentRuntimeMode;
  provider: AgentRuntimeProvider;
  model: string;
  apiKey: string;
  reserveCents: number;
};

function lowerCap(raw: string | undefined, hard: number) {
  if (raw === undefined || raw === '') return hard;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return hard;
  return Math.min(n, hard);
}

export function parseAgentMode(env: AgentAdmissionEnv): AgentRuntimeMode {
  const raw = env.RELAY_AGENTS ?? '';
  if (raw === '' || raw === 'off') return 'off';
  if (raw === 'memory') return 'memory';
  if (raw === 'live') return 'live';
  throw new AgentRuntimeRefusal('Invalid agent runtime mode.', 503);
}

export async function hashedOwner(owner: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(owner),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export function admitAgentRuntime(
  env: AgentAdmissionEnv,
  write: boolean,
): AgentAdmission {
  if (env.RELAY_PAUSE === 'all' || (write && env.RELAY_PAUSE === 'writes')) {
    throw new AgentRuntimeRefusal(
      'Relay is temporarily paused. Please try later.',
      503,
    );
  }
  const mode = parseAgentMode(env);
  if (mode === 'off') {
    throw new AgentRuntimeRefusal('Cognitive runtime is off.', 403);
  }
  if (mode === 'memory') {
    return {
      mode,
      provider: 'memory',
      model: MEMORY_MODEL,
      apiKey: '',
      reserveCents: 0,
    };
  }
  requireAgent(
    env.RELAY_AGENTS_LIVE === '1',
    'Live Agents API is not enabled.',
    403,
  );
  const key = env.OPENAI_API_KEY ?? '';
  requireAgent(key.length >= 20, 'Live Agents API is not configured.', 503);
  const model = env.RELAY_AGENTS_MODEL || LIVE_MODEL;
  requireAgent(model === LIVE_MODEL, 'Model is not allowed.', 403);
  return {
    mode,
    provider: 'openai',
    model,
    apiKey: key,
    reserveCents: lowerCap(env.RELAY_AGENTS_RESERVE_CENTS, HARD_RESERVE_CENTS),
  };
}

export async function reserveLiveTurn(
  db: D1Database,
  owner: string,
  now: string,
  env: AgentAdmissionEnv,
  cents: number,
) {
  if (cents <= 0) {
    throw new AgentRuntimeRefusal(
      'Agent runtime reservation is unavailable.',
      503,
    );
  }
  const user = await hashedOwner(owner);
  const day = Math.floor(Date.parse(now) / 86_400_000);
  const month = now.slice(0, 7);
  const userDay = lowerCap(
    env.RELAY_AGENTS_USER_DAY_CENTS,
    HARD_USER_DAY_CENTS,
  );
  const globalDay = lowerCap(
    env.RELAY_AGENTS_GLOBAL_DAY_CENTS,
    HARD_GLOBAL_DAY_CENTS,
  );
  const globalMonth = lowerCap(
    env.RELAY_AGENTS_GLOBAL_MONTH_CENTS,
    HARD_GLOBAL_MONTH_CENTS,
  );
  for (const [scope, period, limit] of [
    [`agents_usd:${user}:day`, String(day), userDay],
    ['agents_usd:global:day', String(day), globalDay],
    ['agents_usd:global:month', month, globalMonth],
  ] as const) {
    if (!(await reserve(db, scope, period, cents, limit))) {
      throw new AgentRuntimeRefusal(
        'Agent runtime cost limit reached. Please try after the reset.',
        429,
      );
    }
  }
}

export function boundAgentText(value: unknown, maximum: number) {
  requireAgent(
    typeof value === 'string' && value.length <= maximum,
    'Agent input is too large.',
    413,
  );
  return value;
}
