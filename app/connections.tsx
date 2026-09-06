'use client';
import { useState } from 'react';
import Link from 'next/link';
import { type EditorTarget } from '../lib/editor';
import {
  obsidianNote,
  obsidianExample,
  obsidianDraftNote,
  obsidianResearchNote,
  type obsidianWorkflows,
} from '../lib/obsidian';
import {
  readIntegrationFiles,
  draftFromResult,
} from '../lib/integration-files';

function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Connections({
  current,
  draft,
  notes,
  sources,
  onDraft,
  onImport,
  openImport,
}: {
  current?: {
    id: string;
    job_key: string;
    name: string;
    url: string | null;
    version: number;
    status: string;
    session?: string;
  };
  draft: string;
  notes: string;
  sources: {
    name: string;
    notes: string;
    status: string;
    source_url: string;
  }[];
  onDraft: (value: string, started: EditorTarget | undefined) => void;
  onImport: (value: string) => void;
  openImport: () => void;
}) {
  const [facts, setFacts] = useState('');
  const [note, setNote] = useState('');
  const [workflow, setWorkflow] =
    useState<keyof typeof obsidianWorkflows>('research');
  const [loading, setLoading] = useState(false);
  function download() {
    if (!current) return;
    const packet = {
      schema: 'relay.packet.v1',
      job: {
        id: current.id,
        key: current.job_key,
        name: current.name,
        url: current.url,
        version: current.version,
        status: current.status,
      },
      facts,
      draft,
    };
    downloadFile(
      JSON.stringify(packet, null, 2),
      'relay-packet.json',
      'application/json',
    );
    setNote(
      'Packet downloaded. It includes only this job, the visible draft, and the facts you supplied.',
    );
  }
  return (
    <details className="import">
      <summary>
        <b>Connect Obsidian, Grok Bot, Notion & Claude</b>
      </summary>
      <p>
        Bring research from Obsidian, Notion or Grok Bot, and review a draft
        prepared by Claude. Load Obsidian notes directly; other integrations use
        the Relay command tool. Accounts are not connected automatically.
      </p>
      <p>
        <Link href="/about">About Relay and integration setup ↗</Link>
      </p>
      <h3>Obsidian notes</h3>
      <p>
        Create a note for the selected job, edit it in your vault, then load it
        here. Select several research notes together to preview one import.
        Linked notes and attachments stay in your vault. Research preserves
        existing status and draft approval.
      </p>
      <label className="field">
        Note purpose
        <select
          value={workflow}
          onChange={(e) =>
            setWorkflow(e.target.value as keyof typeof obsidianWorkflows)
          }
        >
          <option value="research">Role research</option>
          <option value="interview">Interview preparation and notes</option>
          <option value="followup">Follow-up planning</option>
        </select>
      </label>
      <div className="actions">
        <button
          className="secondary"
          disabled={!current?.url}
          onClick={() => {
            if (!current?.url) return;
            const id = crypto.randomUUID();
            downloadFile(
              obsidianResearchNote(
                { name: current.name, url: current.url },
                workflow,
                id,
              ),
              `relay-${workflow}-${id}.md`,
              'text/markdown',
            );
            setNote(
              'Research note downloaded with this job’s details. Keep its properties when editing in Obsidian, then load the note here for preview.',
            );
          }}
        >
          Create note for selected job
        </button>
        <button
          className="secondary"
          onClick={() =>
            downloadFile(
              obsidianExample,
              'relay-note-example.md',
              'text/markdown',
            )
          }
        >
          Download example note
        </button>
        <button
          className="secondary"
          disabled={!current}
          onClick={() => {
            if (!current) return;
            downloadFile(
              obsidianNote(current, draft, notes, sources),
              `relay-context-${current.id}.md`,
              'text/markdown',
            );
            setNote(
              'Job context downloaded with this job’s source history, visible notes and draft, including unsaved edits. Keep it in your vault as a reference; it cannot be imported. Verified facts and review events are not included.',
            );
          }}
        >
          Download job context
        </button>
        <button
          className="secondary"
          disabled={!current}
          onClick={() => {
            if (!current) return;
            try {
              downloadFile(
                obsidianDraftNote({ ...current, key: current.job_key }, draft),
                `relay-draft-${current.id}.md`,
                'text/markdown',
              );
              setNote(
                'Draft note downloaded. Edit only the body in Obsidian and keep its properties. Load it individually here, review the wording, then save or accept it. If the job changes, download a fresh draft note.',
              );
            } catch (error) {
              setNote(
                error instanceof Error
                  ? error.message
                  : 'Unable to export draft.',
              );
            }
          }}
        >
          Edit draft in Obsidian
        </button>
      </div>
      <p>
        Draft notes return wording for review on the same job version. Job
        context is a reference snapshot. Neither file grants approval or sends
        an application.
      </p>
      <label className="field">
        Verified facts for this draft
        <textarea
          value={facts}
          onChange={(e) => setFacts(e.target.value)}
          placeholder="Only include facts you want to share with your chosen assistant. These facts are not saved here."
        />
      </label>
      <div className="actions">
        <button className="secondary" disabled={!current} onClick={download}>
          Download selected job packet
        </button>
        <label className="secondary">
          Load research or draft
          <input
            aria-label="Load integration result"
            type="file"
            multiple
            disabled={loading}
            accept="application/json,.json,text/markdown,.md"
            onChange={async (e) => {
              try {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setLoading(true);
                const started = current?.session
                  ? {
                      jobId: current.id,
                      session: current.session,
                      version: current.version,
                      draft,
                      job_key: current.job_key,
                    }
                  : undefined;
                const value = await readIntegrationFiles(files);
                if (Array.isArray(value)) {
                  onImport(JSON.stringify(value, null, 2));
                  openImport();
                  setNote(
                    `${value.length} research note(s) loaded. Preview matches before importing.`,
                  );
                } else {
                  onDraft(draftFromResult(value, started), started);
                  setNote(
                    'File checked. Review the visible draft before saving; if your selection or draft changed while reading, load the file again.',
                  );
                }
              } catch (error) {
                setNote(
                  error instanceof Error
                    ? error.message
                    : 'Unable to read file.',
                );
              } finally {
                setLoading(false);
                e.target.value = '';
              }
            }}
          />
        </label>
      </div>
      {loading && <output>Reading selected files…</output>}
      {note && <output>{note}</output>}
    </details>
  );
}
