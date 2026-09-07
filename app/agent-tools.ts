'use client';
import { useEffect, useState } from 'react';
import { stageDraft } from '../lib/draft-stage';
import { readApplicationContext } from '../lib/application-context';
type Json = Record<string, unknown>;
export type RelayToolStatus =
  | 'checking'
  | 'unavailable'
  | 'registered'
  | 'failed';
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
  const result = (await r.json()) as {
    error?: string;
    code?: string;
    verification_url?: string;
  };
  if (!r.ok)
    throw Error(
      JSON.stringify({
        error: result.error || 'Relay refused the request.',
        status: r.status,
        code: result.code,
        verification_url: result.verification_url,
        retry_after: r.headers.get('Retry-After'),
      }),
    );
  return result;
}
async function applications(body: Json) {
  const workspace = (await call('/api/workspace')) as { viewer: string };
  return call('/api/applications', { ...body, viewer: workspace.viewer });
}
export function useRelayTools(
  refresh: () => Promise<unknown>,
  onVerb?: (name: string, result: unknown) => void,
) {
  const [status, setStatus] = useState<RelayToolStatus>('checking');
  useEffect(() => {
    const lifecycle = new AbortController();
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
    if (typeof context?.registerTool !== 'function') {
      void Promise.resolve().then(() => {
        if (!lifecycle.signal.aborted) setStatus('unavailable');
      });
      return () => lifecycle.abort();
    }
    const tools: Tool[] = [
      {
        name: 'relay_read_application',
        description:
          'Read one application: job id/version, research, saved candidate facts, saved and accepted wording, and a page of action history. Start here before drafting; reuse saved context and the user’s drafting preference/direction instead of asking again. Choose grounded wording and omit optional unsupported claims. Ask one short question only for a required missing answer. Facts are user-confirmed, not automatically selected for relevance. No writes or approval. Pass history.next as before for older events.',
        readOnly: true,
        schema: object({ id: { type: 'string' }, before: { type: 'string' } }, [
          'id',
        ]),
        run: (input) =>
          readApplicationContext(
            call,
            input.id as string,
            input.before as string | undefined,
          ),
      },
      {
        name: 'relay_read_workspace',
        description:
          'Read opportunities, blockers, saved drafting preferences and per-job drafting_direction alongside exact saved drafts. Use relay_read_application before drafting or asking the user another question. Does not modify records.',
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
      // Draft logging remains subject to gateway quotas and human review.
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
        name: 'relay_save_progress',
        description:
          'Save completed work or a nonblocking next action in note; it appears in history and does not block acceptance. blocker is only an actual unresolved condition that prevents acceptance, never a review reminder or completion summary. Preserve the existing blocker unless explicitly updating or resolving it; empty blocker clears it. Preserves saved draft, exact acceptance and application status. Requires the current version and a unique operation_id; reuse the same id and exact input only to reconcile an uncertain result. Never retry a refusal automatically. Read workspace/history again to resume; this does not send or approve anything.',
        readOnly: false,
        schema: object(
          {
            id: { type: 'string', minLength: 1, maxLength: 128 },
            version: { type: 'integer', minimum: 1 },
            operation_id: { type: 'string', minLength: 1, maxLength: 128 },
            note: { type: 'string', minLength: 1, maxLength: 4000 },
            blocker: { type: 'string', maxLength: 4000 },
          },
          ['id', 'version', 'operation_id', 'note', 'blocker'],
        ),
        run: async (input) => {
          const result = await call('/api/workspace', {
            ...input,
            action: 'progress',
          });
          try {
            await refresh();
          } catch {
            // The write succeeded. A failed display refresh cannot undo it.
            return { ...result, refresh_required: true };
          }
          return result;
        },
      },
      {
        name: 'relay_stage_draft',
        description:
          'Save a draft into a job record for human review. Never accepts a draft or submits an application. Requires id, current version, draft and blocker. Read application context first and follow the saved drafting preference. Use an empty blocker when resolved; routine wording choices and optional examples are not blockers. Keep a true blocker to one short required question and put explanations in progress notes.',
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
          const result = await stageDraft(call, input);
          await refresh();
          return result;
        },
      },
      {
        name: 'relay_prepare_application',
        description:
          'Replace the Inspect snapshot for one job with exact employer-form fields, files and destination. Unknown answers use unknown: true and never invent. Does not freeze, arm, Accept, or submit. Batch the snapshot; do not send one request per keystroke.',
        readOnly: false,
        schema: object(
          {
            job: { type: 'string', minLength: 1, maxLength: 100 },
            actor: { type: 'string', minLength: 1, maxLength: 100 },
            destination: { type: 'string', minLength: 1, maxLength: 2048 },
            fields: {
              type: 'array',
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
          ['job', 'actor', 'destination', 'fields', 'files'],
        ),
        run: async (input) => {
          const result = await applications({
            action: 'prepare',
            job: input.job,
            actor: input.actor,
            destination: input.destination,
            fields: input.fields,
            files: input.files,
          });
          await refresh();
          return result;
        },
      },
      {
        name: 'relay_arm_application',
        description:
          'Freeze a complete prepared snapshot and keep the operative present so the human can Accept. Unknown answers use unknown: true and never invent; incomplete or unknown fields are refused. Does not click Accept, begin, or submit. Repeat to extend presence without changing the digest.',
        readOnly: false,
        schema: object(
          {
            job: { type: 'string', minLength: 1, maxLength: 100 },
            id: { type: 'string', minLength: 1, maxLength: 100 },
            actor: { type: 'string', minLength: 1, maxLength: 100 },
          },
          ['job', 'id', 'actor'],
        ),
        run: async (input) => {
          const result = await applications({
            action: 'arm',
            job: input.job,
            id: input.id,
            actor: input.actor,
          });
          await refresh();
          return result;
        },
      },
      {
        name: 'relay_inspect_application',
        description:
          'Read the Inspect view for one job: destination, filled/unknown marks, files, ready/armed, operation state, and whether Accept is enabled. Wait here for human Accept (state authorized). Unknown answers use unknown: true and never invent. Does not modify records, click Accept, or submit.',
        readOnly: true,
        schema: object(
          { job: { type: 'string', minLength: 1, maxLength: 100 } },
          ['job'],
        ),
        run: (input) =>
          call(
            `/api/applications?job=${encodeURIComponent(String(input.job))}`,
          ),
      },
      {
        name: 'relay_begin_application',
        description:
          'Consume the one execution permit after the human Accepted this frozen payload. Returns execute and the operation. If execute is not true, do not click the employer submit control. Does not click Accept, record a receipt, or set Submitted.',
        readOnly: false,
        schema: object(
          {
            id: { type: 'string', minLength: 1, maxLength: 100 },
            digest: { type: 'string', minLength: 1, maxLength: 64 },
          },
          ['id', 'digest'],
        ),
        run: async (input) => {
          const result = (await applications({
            action: 'begin',
            id: input.id,
            digest: input.digest,
          })) as { execute?: unknown; operation: unknown };
          try {
            await refresh();
          } catch {
            // Begin already consumed the permit. A failed display refresh
            // cannot undo it; still return { execute, operation }.
            return { execute: result.execute, operation: result.operation };
          }
          return { execute: result.execute, operation: result.operation };
        },
      },
      {
        name: 'relay_finish_application',
        description:
          'Record the employer outcome as complete, uncertain, or not-submitted with a receipt. Only complete may set the job to Submitted. Use uncertain when the result is unknown; do not retry. Use not-submitted with evidence no send occurred. Unknown answers use unknown: true and never invent a receipt. Does not click Accept.',
        readOnly: false,
        schema: object(
          {
            id: { type: 'string', minLength: 1, maxLength: 100 },
            digest: { type: 'string', minLength: 1, maxLength: 64 },
            action: {
              type: 'string',
              enum: ['complete', 'uncertain', 'not-submitted'],
            },
            receipt: { type: 'string', minLength: 1, maxLength: 10000 },
          },
          ['id', 'digest', 'action', 'receipt'],
        ),
        run: async (input) => {
          const action = input.action;
          if (
            action !== 'complete' &&
            action !== 'uncertain' &&
            action !== 'not-submitted'
          )
            throw Error(
              'Outcome must be complete, uncertain, or not-submitted.',
            );
          const result = await applications({
            action,
            id: input.id,
            digest: input.digest,
            receipt: input.receipt,
          });
          await refresh();
          return result;
        },
      },
      {
        name: 'relay_cancel_application',
        description:
          'Cancel this application only if it has not begun execution (pre-begin). If already executing, do not cancel and do not submit. Maps r.close. Does not click Accept or submit.',
        readOnly: false,
        schema: object(
          {
            id: { type: 'string', minLength: 1, maxLength: 100 },
            digest: { type: 'string', minLength: 1, maxLength: 64 },
          },
          ['id', 'digest'],
        ),
        run: async (input) => {
          const result = await applications({
            action: 'cancel',
            id: input.id,
            digest: input.digest,
          });
          await refresh();
          return result;
        },
      },
    ];
    Promise.all(
      tools.map(async (tool) =>
        context.registerTool(
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.schema,
            annotations: {
              readOnlyHint: tool.readOnly,
              untrustedContentHint: true,
            },
            execute: async (input: Json) => {
              const result = await tool.run(input);
              onVerb?.(tool.name, result);
              return result;
            },
          },
          { signal: lifecycle.signal },
        ),
      ),
    ).then(
      () => {
        if (!lifecycle.signal.aborted) setStatus('registered');
      },
      () => {
        if (lifecycle.signal.aborted) return;
        lifecycle.abort();
        setStatus('failed');
      },
    );
    return () => lifecycle.abort();
  }, [refresh, onVerb]);
  return status;
}
