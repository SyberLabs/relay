import { loadObsidian, obsidianResearchBatch } from './obsidian.ts';
import { matchesJobKey } from './domain.ts';
import { type EditorTarget } from './editor.ts';

export function draftFromResult(
  value: {
    schema?: string;
    draft?: unknown;
    provider?: string;
    job?: { id?: string; key?: string; url?: string | null; version?: number };
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
    (['obsidian', 'chatgpt', 'codex'].includes(value.provider || '') &&
      value.job?.id !== started.jobId) ||
    value.job?.key !== started.job_key ||
    value.job?.version !== started.version ||
    !matchesJobKey(value.job?.url, started.job_key)
  )
    throw Error(
      'Select the matching job. If it has changed, download a new packet or draft note.',
    );
  return value.draft;
}

export async function readIntegrationFiles(
  files: { name: string; size: number; text: () => Promise<string> }[],
) {
  if (!files.length || files.length > 200)
    throw Error('Select between 1 and 200 notes, or one JSON result.');
  if (files.reduce((total, file) => total + file.size, 0) > 1800000)
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
