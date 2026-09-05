'use client';
import { useEffect } from 'react';
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
    for (const [name, description, action, readOnly] of [
      [
        'relay_read_workspace',
        'Read opportunities, blockers and exact saved drafts. Does not modify records.',
        null,
        true,
      ],
      [
        'relay_preview_import',
        'Check an array of research rows for duplicates without importing or changing records.',
        'preview',
        true,
      ],
      [
        'relay_stage_draft',
        'Save a draft for human review. Never accepts a draft or submits an application. Requires id, current version, draft and blocker.',
        'save',
        false,
      ],
    ] as const) {
      const inputSchema =
        action === 'save'
          ? {
              type: 'object',
              properties: {
                id: { type: 'string' },
                version: { type: 'integer' },
                draft: { type: 'string' },
                blocker: { type: 'string' },
              },
              required: ['id', 'version', 'draft', 'blocker'],
              additionalProperties: false,
            }
          : action === 'preview'
            ? {
                type: 'object',
                properties: {
                  rows: { type: 'array', items: { type: 'object' } },
                },
                required: ['rows'],
                additionalProperties: false,
              }
            : { type: 'object', properties: {}, additionalProperties: false };
      Promise.resolve(
        context.registerTool(
          {
            name,
            description,
            inputSchema,
            annotations: { readOnlyHint: readOnly, untrustedContentHint: true },
            async execute(input: Record<string, unknown>) {
              let status = 'Held';
              if (action === 'save') {
                const snapshot = await fetch('/api/workspace');
                if (!snapshot.ok) throw Error('Sign in to stage a draft.');
                const data = (await snapshot.json()) as {
                  jobs: { id: string; status: string }[];
                };
                const job = data.jobs.find((j) => j.id === input.id);
                if (!job) throw Error('Record not found.');
                if (['Submitted', 'Live loop'].includes(job.status))
                  status = job.status;
              }
              const r = await fetch(
                '/api/workspace',
                action
                  ? {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ...input,
                        action,
                        ...(action === 'save' ? { status } : {}),
                      }),
                    }
                  : {},
              );
              const result = (await r.json()) as {
                error?: string;
                jobs?: unknown;
              };
              if (!r.ok) throw Error(result.error);
              if (action === 'save') await refresh();
              return action ? result : { jobs: result.jobs };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => console.warn('Relay agent tools could not register.'));
    }
    return () => lifecycle.abort();
  }, [refresh]);
}
