import { loadObsidian, obsidianResearchBatch } from './obsidian.ts';
import { jobKey } from './domain.ts';
import { type EditorTarget } from './editor.ts';

const INTEGRATION_BYTES = 1800000;

export function selectedJobPacket(
  job: {
    id: string;
    job_key: string;
    name: string;
    url: string;
    version: number;
    status: string;
  },
  facts: string,
  draft: string,
) {
  return {
    schema: 'relay.packet.v1',
    job: {
      id: job.id,
      key: job.job_key,
      name: job.name,
      url: job.url,
      version: job.version,
      status: job.status,
    },
    facts,
    draft,
  };
}

export function draftFromResult(
  value: {
    schema?: string;
    draft?: unknown;
    provider?: string;
    job?: { id?: string; key?: string; url?: string; version?: number };
  } | null,
  started: (EditorTarget & { job_key: string }) | undefined,
) {
  if (
    !value ||
    value.schema !== 'relay.draft.v1' ||
    typeof value.draft !== 'string' ||
    !value.draft.trim() ||
    value.draft.length > 20000
  )
    throw Error('Choose a nonempty Relay draft or a research array.');
  if (
    !started ||
    (value.provider === 'obsidian' && value.job?.id !== started.jobId) ||
    value.job?.key !== started.job_key ||
    value.job?.version !== started.version ||
    typeof value.job?.url !== 'string' ||
    jobKey(value.job.url, '') !== started.job_key
  )
    throw Error(
      'Select the matching job. If it has changed, download a new packet or draft note.',
    );
  return value.draft;
}

export function draftFromPastedJson(
  text: string,
  started: (EditorTarget & { job_key: string }) | undefined,
) {
  if (
    typeof text !== 'string' ||
    text.length > INTEGRATION_BYTES ||
    new TextEncoder().encode(text).byteLength > INTEGRATION_BYTES
  )
    throw Error('Paste the complete relay.draft.v1 JSON, under 1.8 MB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error('Paste the complete relay.draft.v1 JSON.');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('schema' in value) ||
    value.schema !== 'relay.draft.v1'
  )
    throw Error('Paste the complete relay.draft.v1 JSON.');
  return draftFromResult(
    value as {
      schema?: string;
      draft?: unknown;
      provider?: string;
      job?: { id?: string; key?: string; url?: string; version?: number };
    },
    started,
  );
}

export async function readIntegrationFiles(
  files: { name: string; size: number; text: () => Promise<string> }[],
) {
  if (!files.length || files.length > 200)
    throw Error('Select between 1 and 200 notes, or one JSON result.');
  if (files.reduce((total, file) => total + file.size, 0) > INTEGRATION_BYTES)
    throw Error('Select files totaling less than 1.8 MB.');
  if (files.length === 1 && /\.json$/i.test(files[0].name))
    return JSON.parse(await files[0].text());
  if (files.some((file) => !/\.md$/i.test(file.name)))
    throw Error(
      'Select Markdown notes together, or load one JSON result separately.',
    );
  const notes = [];
  for (const file of files)
    notes.push({ name: file.name, text: await file.text() });
  if (notes.length === 1) {
    try {
      const result = loadObsidian(notes[0].text);
      if (!Array.isArray(result)) return result;
    } catch (error) {
      throw Error(
        `${notes[0].name}: ${error instanceof Error ? error.message : 'Unable to read note.'}`,
      );
    }
  }
  return obsidianResearchBatch(notes);
}
