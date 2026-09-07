export type WebMcpContext = {
  registerTool: (
    tool: unknown,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

export type WebMcpHost = {
  document?: unknown;
  navigator?: unknown;
};

export const RELAY_WEBMCP_WORKFLOW_TOOLS = [
  'relay_read_workspace',
  'relay_preview_import',
  'relay_stage_draft',
] as const;

function contextFrom(value: unknown): WebMcpContext | null {
  if (!value || typeof value !== 'object') return null;
  const registerTool = (value as { registerTool?: unknown }).registerTool;
  return typeof registerTool === 'function' ? (value as WebMcpContext) : null;
}

function modelContextFrom(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  return contextFrom((value as { modelContext?: unknown }).modelContext);
}

export function webMcpCapability(host: WebMcpHost) {
  const fromDocument = modelContextFrom(host.document);
  if (fromDocument)
    return {
      available: true,
      source: 'document' as const,
      context: fromDocument,
    };
  const fromNavigator = modelContextFrom(host.navigator);
  if (fromNavigator)
    return {
      available: true,
      source: 'navigator' as const,
      context: fromNavigator,
    };
  return { available: false, source: null, context: null };
}

export function browserAgentToolsCopy(available: boolean) {
  if (available)
    return `Browser agent tools: available. This page registers ${RELAY_WEBMCP_WORKFLOW_TOOLS.join(', ')}.`;
  return 'Browser agent tools: not available in this browser (WebMCP missing). Use file handoff or a local CLI on this computer. Seeing the workspace does not mean tools work.';
}
