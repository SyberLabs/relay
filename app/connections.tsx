'use client';
import { useState } from 'react';
import Link from 'next/link';
import { jobKey } from '../lib/domain';

export function Connections({
  current,
  draft,
  onDraft,
  onImport,
  openImport,
}: {
  current?: {
    id: string;
    job_key: string;
    name: string;
    url: string;
    version: number;
    status: string;
  };
  draft: string;
  onDraft: (value: string) => void;
  onImport: (value: string) => void;
  openImport: () => void;
}) {
  const [facts, setFacts] = useState('');
  const [note, setNote] = useState('');
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
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relay-packet.json';
    a.click();
    URL.revokeObjectURL(url);
    setNote(
      'Packet downloaded. It includes only this job, the visible draft, and the facts you supplied.',
    );
  }
  return (
    <details className="import">
      <summary>
        <b>Connect Grok Bot, Notion & Claude</b>
      </summary>
      <p>
        Bring research from Notion or Grok Bot, and review a draft prepared by
        Claude. These are file handoffs through the Relay command tool; accounts
        are not connected automatically.
      </p>
      <p>
        <Link href="/about">About Relay and integration setup ↗</Link>
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
            accept="application/json,.json"
            onChange={async (e) => {
              try {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2000000)
                  throw Error('Choose a file smaller than 2 MB.');
                const value = JSON.parse(await file.text());
                if (Array.isArray(value)) {
                  onImport(JSON.stringify(value, null, 2));
                  openImport();
                  setNote(
                    'Research loaded into the import form. Preview matches before importing.',
                  );
                } else {
                  if (
                    value.schema !== 'relay.draft.v1' ||
                    typeof value.draft !== 'string' ||
                    value.draft.length > 20000
                  )
                    throw Error('Choose a Relay draft or a research array.');
                  if (
                    !current ||
                    value.job?.key !== current.job_key ||
                    value.job?.version !== current.version ||
                    jobKey(value.job.url, '') !== current.job_key
                  )
                    throw Error(
                      'Select the matching job. If it has changed, download a new packet.',
                    );
                  onDraft(value.draft);
                  setNote(
                    'Draft loaded for review. Check its claims, then save it. Nothing has been sent.',
                  );
                }
              } catch (error) {
                setNote(
                  error instanceof Error
                    ? error.message
                    : 'Unable to read file.',
                );
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {note && <output>{note}</output>}
    </details>
  );
}
