import { parseDocument } from 'yaml';
import { jobKey, validateRows, type SourceRow } from './domain.ts';

// Only explicitly selected notes cross the vault boundary. Never resolve embeds.
function readNote(markdown: string) {
  if (markdown.length > 100000)
    throw Error('Choose a note smaller than 100,000 characters.');
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match)
    throw Error(
      'Add Relay properties at the top of the note. Download the example to get started.',
    );
  if (match[1].length > 10000) throw Error('Note properties are too large.');
  const document = parseDocument(match[1], {
    schema: 'core',
    uniqueKeys: true,
  });
  if (document.errors.length || document.warnings.length)
    throw Error(
      'Fix the note properties: invalid YAML, duplicate keys or unsupported tags.',
    );
  let properties;
  try {
    properties = document.toJS({ maxAliasCount: 0 });
  } catch {
    throw Error('Use plain note properties without YAML aliases.');
  }
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  )
    throw Error(
      'Note properties must contain relay_id, relay_name and relay_job.',
    );
  return { properties, body: normalized.slice(match[0].length).trim() };
}

export function obsidianRow(markdown: string): SourceRow {
  const { properties, body } = readNote(markdown);
  if (
    properties.relay_kind !== undefined &&
    properties.relay_kind !== 'research'
  )
    throw Error(
      'Choose a research note. Drafts must be loaded individually; context snapshots are reference only.',
    );
  const { relay_id: id, relay_name: name, relay_job: job } = properties;
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(id))
    throw Error(
      'Add a stable relay_id using letters, numbers, dots, underscores or hyphens (up to 200 characters).',
    );
  if (typeof job !== 'string' || !job.trim())
    throw Error('Add relay_job with the HTTP or HTTPS posting URL.');
  jobKey(job, '');
  if (body.length > 20000)
    throw Error(
      'Keep the note body within 20,000 characters. Split longer research into separate notes.',
    );
  return validateRows([
    {
      url: `obsidian:${id}`,
      Name: name,
      Job: job,
      // Notes are research, never evidence of a new submission or draft approval.
      Status: 'Held',
      Notes: body,
    },
  ])[0];
}

type HandoffJob = {
  id: string;
  key: string;
  name: string;
  url: string;
  version: number;
};

function validateHandoffJob(job: HandoffJob) {
  if (
    !job ||
    typeof job.id !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(job.id) ||
    typeof job.name !== 'string' ||
    !job.name.trim() ||
    job.name.length > 500 ||
    typeof job.url !== 'string' ||
    !job.url ||
    !Number.isInteger(job.version) ||
    job.version < 0 ||
    jobKey(job.url, '') !== job.key
  )
    throw Error('Choose a Relay job with a posting URL and a valid version.');
}

function frontmatter(properties: Record<string, string | number>) {
  return `---\n${Object.entries(properties)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n`;
}

export function obsidianDraftNote(job: HandoffJob, draft: string) {
  validateHandoffJob(job);
  if (typeof draft !== 'string' || draft.length > 20000)
    throw Error('Keep the draft within 20,000 characters.');
  return (
    frontmatter({
      relay_kind: 'draft',
      relay_id: job.id,
      relay_name: job.name,
      relay_job: job.url,
      relay_key: job.key,
      relay_version: job.version,
    }) + draft
  );
}

export function loadObsidian(markdown: string) {
  const { properties: p, body } = readNote(markdown);
  if (p.relay_kind !== 'draft') return [obsidianRow(markdown)];
  const job = {
    id: p.relay_id,
    name: p.relay_name,
    url: p.relay_job,
    key: p.relay_key,
    version: p.relay_version,
  };
  validateHandoffJob(job);
  if (!body || body.length > 20000)
    throw Error('Draft must contain between 1 and 20,000 characters.');
  return {
    schema: 'relay.draft.v1',
    job,
    draft: body,
    provider: 'obsidian',
    reviewRequired: true,
  };
}

export function obsidianResearchBatch(notes: { name: string; text: string }[]) {
  if (!notes.length || notes.length > 200)
    throw Error('Select between 1 and 200 research notes.');
  const ids = new Set<string>();
  const rows = notes.map((note) => {
    try {
      const row = obsidianRow(note.text);
      if (ids.has(row.url))
        throw Error(
          'Two selected notes share a relay_id. Give each note its own stable ID.',
        );
      ids.add(row.url);
      return row;
    } catch (error) {
      throw Error(
        `${note.name}: ${error instanceof Error ? error.message : 'Unable to read note.'}`,
      );
    }
  });
  if (new TextEncoder().encode(JSON.stringify(rows)).length > 1800000)
    throw Error(
      'Selected research is too large for one import. Select fewer notes.',
    );
  return rows;
}

export const obsidianWorkflows = {
  research:
    '# Role research\n\n## What the role needs\n\n## Evidence and sources\n\n## Questions and unknowns\n',
  interview:
    '# Interview notes\n\n## Date and participants\n\n## Questions to prepare\n\n## What I learned\n\n## Next steps and follow-up date\n',
  followup:
    '# Follow-up planning\n\n## Conversation and date\n\n## Commitments and next steps\n\n## Facts to check before writing\n',
};

export function obsidianResearchNote(
  job: { name: string; url: string },
  workflow: keyof typeof obsidianWorkflows,
  id: string,
) {
  const note =
    frontmatter({
      relay_kind: 'research',
      relay_id: id,
      relay_name: job.name,
      relay_job: job.url,
    }) + obsidianWorkflows[workflow];
  obsidianRow(note);
  return note;
}

function literal(text: string) {
  const fences = text.match(/`+/g) || [];
  const fence = '`'.repeat(Math.max(3, ...fences.map((s) => s.length + 1)));
  return `${fence}text\n${text}\n${fence}`;
}

export function obsidianNote(
  job: {
    id: string;
    name: string;
    url: string;
    status: string;
    version: number;
  },
  draft: string,
  notes: string,
  sources: {
    name: string;
    notes: string;
    status: string;
    source_url: string;
  }[] = [],
): string {
  // JSON-quoted strings are YAML scalars and cannot inject extra properties.
  const properties = {
    relay_kind: 'snapshot',
    relay_id: `relay-${job.id}`,
    relay_name: job.name,
    relay_job: job.url,
    relay_status_snapshot: job.status,
    relay_editor_version: job.version,
    relay_exported_at: new Date().toISOString(),
  };
  return (
    frontmatter(properties) +
    `\n# Job context\n\nReference only. Relay holds the current application status and draft approval. The visible notes and draft below may include unsaved edits. Use a research note to add observations or a draft note to return edited wording; snapshots cannot be imported.\n\n## Notes and blockers\n\n${literal(notes)}\n\n## Draft for review\n\n${literal(draft)}\n\n## Source history\n\n${sources.length ? sources.map((source) => literal(`${source.name}\nSource: ${source.source_url}\nRecorded source status: ${source.status}\n\n${source.notes}`)).join('\n\n') : 'No source observations recorded.'}\n`
  );
}

export const obsidianExample = `---
relay_id: example-company-platform-engineer
relay_name: Example Company — Platform Engineer
relay_job: https://example.com/jobs/platform-engineer
---

# Research and interview notes

Replace the example properties above with one real opportunity. Keep relay_id unchanged when renaming or moving the note, and use a different ID for each note.

Record research, interview questions and follow-up notes here. Only this note's text is imported. Linked notes and attachments stay in your vault.
`;
