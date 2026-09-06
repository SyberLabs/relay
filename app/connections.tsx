'use client';
import { useState } from 'react';
import Link from 'next/link';
import { assistantPrompt, type Assistant } from '../lib/assistant-handoff';
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
  draftFromPastedJson,
  selectedJobPacket,
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
  const [pasted, setPasted] = useState('');
  const [workflow, setWorkflow] =
    useState<keyof typeof obsidianWorkflows>('research');
  const [loading, setLoading] = useState(false);
  const [nextTask, setNextTask] = useState('');
  const [research, setResearch] = useState('');
  function editorTarget() {
    return current?.session
      ? {
          jobId: current.id,
          session: current.session,
          version: current.version,
          draft,
          job_key: current.job_key,
        }
      : undefined;
  }
  function packetText() {
    return current
      ? JSON.stringify(selectedJobPacket(current, facts, draft), null, 2)
      : '';
  }
  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(packetText());
      setNote(
        'Packet copied. It includes only this job, the visible draft, and the facts you supplied.',
      );
    } catch {
      setNote('Unable to copy to the clipboard. Download the packet instead.');
    }
  }
  function loadPastedDraft() {
    try {
      const started = editorTarget();
      onDraft(draftFromPastedJson(pasted, started), started);
      setNote(
        'JSON checked. Review the visible draft before saving; if your selection or draft changed, load it again.',
      );
    } catch (error) {
      setNote(
        error instanceof Error ? error.message : 'Unable to read draft JSON.',
      );
    }
  }
  function download(assistant?: Assistant) {
    if (!current) return;
    const packet = selectedJobPacket(current, facts, draft);
    if (assistant) {
      try {
        downloadFile(
          assistantPrompt(packet, assistant, false, { nextTask, research }),
          `relay-${assistant}-prompt.md`,
          'text/markdown',
        );
        setNote(
          'Prompt downloaded with this job, visible draft, supplied facts and the task context shown below. Share it with your assistant, then paste or load its JSON response here for review.',
        );
      } catch (error) {
        setNote(
          error instanceof Error ? error.message : 'Unable to prepare handoff.',
        );
      }
      return;
    }
    downloadFile(packetText(), 'relay-packet.json', 'application/json');
    setNote(
      'Packet downloaded. It includes only this job, the visible draft, and the facts you supplied.',
    );
  }
  return (
    <details className="import">
      <summary>
        <b>Connect your tools</b>
      </summary>
      <p>
        Bring research from Obsidian, Notion or Grok Bot, and review drafts
        prepared with ChatGPT, Codex or Claude. Choose which files to share.
        Accounts are not connected automatically.
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
                { ...current, url: current.url },
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
          disabled={!current?.url}
          onClick={() => {
            if (!current?.url) return;
            try {
              downloadFile(
                obsidianDraftNote(
                  { ...current, key: current.job_key, url: current.url },
                  draft,
                ),
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
      <details>
        <summary>Continue a task with ChatGPT or Codex</summary>
        <p>
          Add only what this draft needs. These optional details go into Prepare
          for ChatGPT and Prepare for Codex downloads, not the plain job packet.
          They are not saved here.
        </p>
        <label className="field">
          What should the assistant draft next?
          <textarea
            value={nextTask}
            maxLength={2000}
            onChange={(e) => setNextTask(e.target.value)}
            placeholder="For example: revise the opening paragraph using the role requirements below."
          />
        </label>
        <button
          className="secondary"
          disabled={!current}
          onClick={() => {
            setResearch(
              JSON.stringify(
                {
                  notes,
                  sources: sources.map((source) => ({
                    name: source.name,
                    source_url: source.source_url,
                    notes: source.notes,
                    status: source.status,
                  })),
                },
                null,
                2,
              ),
            );
          }}
        >
          Use this job’s research
        </button>
        <label className="field">
          Research to share with the assistant
          <textarea
            value={research}
            onChange={(e) => setResearch(e.target.value)}
            placeholder="Choose the research above or paste relevant excerpts with their sources. Remove anything this task does not need."
          />
        </label>
        <p>
          Review and shorten the selection before sharing. Research is separate
          from verified candidate facts. Limit: 30,000 characters; longer text
          is rejected, never silently shortened.
        </p>
      </details>
      <div className="actions">
        <button
          className="secondary"
          disabled={!current}
          onClick={() => download()}
        >
          Download selected job packet
        </button>
        <button
          className="secondary"
          disabled={!current}
          onClick={() => void copy()}
        >
          Copy selected job packet
        </button>
        <button
          className="secondary"
          disabled={!current}
          onClick={() => download('chatgpt')}
        >
          Prepare for ChatGPT
        </button>
        <button
          className="secondary"
          disabled={!current}
          onClick={() => download('codex')}
        >
          Prepare for Codex
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
                const started = editorTarget();
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
      <p>
        For ChatGPT or Codex, enter verified facts, download the prepared
        prompt, and share it with that assistant. Save its JSON response as a
        .json file and load it here. Codex can also prepare a draft through the
        local command tool. Returned wording needs review; loading never accepts
        or sends it.
      </p>
      <label className="field">
        Paste complete relay.draft.v1 JSON
        <textarea
          aria-label="Paste complete relay.draft.v1 JSON"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder='{"schema":"relay.draft.v1","job":{"id":"…","key":"…","url":"…","version":1},"draft":"…"}'
        />
      </label>
      <div className="actions">
        <button
          className="secondary"
          disabled={!current || loading}
          onClick={loadPastedDraft}
        >
          Load draft for review
        </button>
      </div>
      {loading && <output>Reading selected files…</output>}
      {note && <output>{note}</output>}
    </details>
  );
}
