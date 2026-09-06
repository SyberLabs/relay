'use client';
import { useEffect } from 'react';
type Json = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  readOnly: boolean;
  schema: Json;
  run: (input: Json) => Promise<unknown>;
};
const object = (properties: Json, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
async function call(url: string, body?: Json) {
  const r = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {},
  );
  const result = (await r.json()) as { error?: string };
  if (!r.ok) throw Error(result.error);
  return result;
}
export function useRelayTools(refresh: () => Promise<void>) {
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'relay_read_workspace',
        description:
          'Read opportunities, blockers and exact saved drafts. Does not modify records.',
        readOnly: true,
        schema: object({}),
        run: async () => ({
          jobs: ((await call('/api/workspace')) as { jobs: unknown }).jobs,
        }),
      },
      // The brief a writing agent works from: verified facts and the style
      // rules learned so far. Read-only by design — an agent that can edit its
      // own instructions drifts toward whatever is cheapest to generate.
      {
        name: 'relay_read_profile',
        description:
          'Read the verified fact ledger and learned style rules that drafts must follow. Cite these fact ids when writing. Does not modify the profile.',
        readOnly: true,
        schema: object({}),
        run: () => call('/api/profile'),
      },
      {
        name: 'relay_review_status',
        description:
          'Read per-cluster trust, pending draft counts and whether a human review is due. Does not modify records.',
        readOnly: true,
        schema: object({}),
        run: async () => {
          const d = (await call('/api/drafts')) as Json;
          return { trust: d.trust, trigger: d.trigger, batches: d.batches };
        },
      },
      {
        name: 'relay_preview_import',
        description:
          'Check an array of research rows for duplicates without importing or changing records.',
        readOnly: true,
        schema: object({ rows: { type: 'array', items: { type: 'object' } } }, [
          'rows',
        ]),
        run: (input) => call('/api/workspace', { ...input, action: 'preview' }),
      },
      // Logging is the autonomous path: unlimited volume, no human gate, but
      // every factual claim must trace to a verified fact or the write is
      // refused outright.
      {
        name: 'relay_log_draft',
        description:
          'Log a written draft for later batch review. Every sentence making a factual claim must be supported by a cited verified fact id from relay_read_profile; unsupported claims are rejected. Set confidence "low" when a needed fact is missing instead of guessing. Never accepts or submits.',
        readOnly: false,
        schema: object(
          {
            job_id: { type: 'string' },
            body: { type: 'string' },
            cited: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'string', enum: ['high', 'low'] },
          },
          ['job_id', 'body', 'cited'],
        ),
        run: async (input) => {
          const result = await call('/api/drafts', { ...input, action: 'log' });
          await refresh();
          return result;
        },
      },
      {
        name: 'relay_stage_draft',
        description:
          'Save a draft into a job record for human review. Never accepts a draft or submits an application. Requires id, current version, draft and blocker.',
        readOnly: false,
        schema: object(
          {
            id: { type: 'string' },
            version: { type: 'integer' },
            draft: { type: 'string' },
            blocker: { type: 'string' },
          },
          ['id', 'version', 'draft', 'blocker'],
        ),
        run: async (input) => {
          const snapshot = (await call('/api/workspace')) as {
            jobs: { id: string; status: string }[];
          };
          const job = snapshot.jobs.find((j) => j.id === input.id);
          if (!job) throw Error('Record not found.');
          const status = ['Submitted', 'Live loop'].includes(job.status)
            ? job.status
            : 'Held';
          const result = await call('/api/workspace', {
            ...input,
            action: 'save',
            status,
          });
          await refresh();
          return result;
        },
      },
    ];
    for (const tool of tools)
      Promise.resolve(
        context.registerTool(
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.schema,
            annotations: {
              readOnlyHint: tool.readOnly,
              untrustedContentHint: true,
            },
            execute: tool.run,
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => console.warn('Relay agent tools could not register.'));
    return () => lifecycle.abort();
  }, [refresh]);
}
