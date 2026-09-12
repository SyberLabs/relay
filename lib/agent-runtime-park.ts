import type { RequiredAction, ToolResultInput } from './agent-runtime.ts';

export type ParkKind = 'answer' | 'authorization';

export type ParkedCall = {
  kind: ParkKind;
  turn_id: string;
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export function parkFromAction(action: RequiredAction): ParkedCall | null {
  if (action.type !== 'function_call') return null;
  if (action.name === 'relay_request_answer') {
    return {
      kind: 'answer',
      turn_id: action.turn_id,
      call_id: action.call_id,
      name: action.name,
      arguments: action.arguments,
    };
  }
  if (action.name === 'relay_prepare_application') {
    return {
      kind: 'authorization',
      turn_id: action.turn_id,
      call_id: action.call_id,
      name: action.name,
      arguments: action.arguments,
    };
  }
  return null;
}

export function toolResultPayload(
  result: ToolResultInput,
): Record<string, unknown> {
  return {
    turn_id: result.turn_id,
    call_id: result.call_id,
    success: result.success,
    ...(result.success
      ? { output: result.output ?? '' }
      : { error: result.error || 'Tool failed.' }),
  };
}

export function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      /* invalid JSON is empty arguments */
    }
  }
  return {};
}
