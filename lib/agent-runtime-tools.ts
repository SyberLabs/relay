import { AGENT_RUNTIME_CAPABILITIES } from './agent-runtime.ts';

export const ALLOWED_AGENT_TOOLS = [
  'relay_read_job',
  'relay_request_answer',
  'relay_prepare_application',
  'relay_record_progress',
] as const;
export type AllowedAgentTool = (typeof ALLOWED_AGENT_TOOLS)[number];

export const FORBIDDEN_AGENT_TOOLS = [
  'verify_fact',
  'accept_draft',
  'authorize_send',
  'approve',
  'begin',
  'complete',
  'execute',
] as const;

export const PARKING_AGENT_TOOLS = [
  'relay_request_answer',
  'relay_prepare_application',
] as const;

const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const AGENT_FUNCTION_TOOLS = [
  {
    type: 'function' as const,
    name: 'relay_read_job',
    description:
      'Read the current Relay job, verified facts only, and missing application fields. Relay is canonical; do not trust remembered claims.',
    parameters: object({
      job_id: { type: 'string', minLength: 1, maxLength: 100 },
    }),
  },
  {
    type: 'function' as const,
    name: 'relay_request_answer',
    description:
      'Ask the human for a missing fact. Parks the session. Does not verify the answer and cannot remember drafting preferences.',
    parameters: object(
      {
        field_key: { type: 'string', minLength: 1, maxLength: 128 },
        question: { type: 'string', minLength: 1, maxLength: 2000 },
        label: { type: 'string', minLength: 1, maxLength: 300 },
      },
      ['question'],
    ),
  },
  {
    type: 'function' as const,
    name: 'relay_prepare_application',
    description:
      'Validate and freeze an exact application digest in Relay. Parks until a human Accepts. Does not authorize send and cannot begin execution.',
    parameters: object(
      {
        destination: { type: 'string', minLength: 1, maxLength: 2048 },
        fields: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: object(
            {
              label: { type: 'string', minLength: 1, maxLength: 300 },
              value: { type: 'string', maxLength: 20000 },
              unknown: { type: 'boolean' },
            },
            ['label', 'value', 'unknown'],
          ),
        },
        files: {
          type: 'array',
          maxItems: 2,
          items: object(
            {
              name: { type: 'string' },
              base64: { type: 'string' },
              sha256: { type: 'string' },
            },
            ['name', 'base64', 'sha256'],
          ),
        },
      },
      ['destination', 'fields'],
    ),
  },
  {
    type: 'function' as const,
    name: 'relay_record_progress',
    description:
      'Record a bounded progress note on the job. Cannot change drafts, acceptance, or send permission.',
    parameters: object(
      {
        note: { type: 'string', minLength: 1, maxLength: 4000 },
        blocker: { type: 'string', maxLength: 4000 },
      },
      ['note', 'blocker'],
    ),
  },
];

export function isAllowedAgentTool(name: string): name is AllowedAgentTool {
  return (ALLOWED_AGENT_TOOLS as readonly string[]).includes(name);
}

export function isForbiddenAgentTool(name: string) {
  return (FORBIDDEN_AGENT_TOOLS as readonly string[]).includes(name);
}

export function isParkingAgentTool(name: string) {
  return (PARKING_AGENT_TOOLS as readonly string[]).includes(name);
}

export const DEFAULT_AGENT_CAPABILITIES = [...AGENT_RUNTIME_CAPABILITIES];

export const AGENT_INSTRUCTIONS = `You are a Relay application assistant. Relay owns verified facts, exact draft acceptance, send authorization, permits, and receipts. Call only relay_read_job, relay_request_answer, relay_prepare_application, and relay_record_progress. Never invent or call verify_fact, accept_draft, authorize_send, approve, begin, complete, execute, or any employer HTTP. If a required field is missing, call relay_request_answer and wait. Do not guess facts. Preparing an application freezes a digest; it is not send permission. Do not claim Submit succeeded.`;
