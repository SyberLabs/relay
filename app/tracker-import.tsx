'use client';
import { useRef, useState } from 'react';
import {
  readTrackerCsv,
  suggestTrackerMapping,
  trackerRows,
  type TrackerCsv,
  type TrackerMapping,
} from '../lib/tracker-csv';
import type { SourceRow } from '../lib/domain';
import {
  beginTrackerSubmit,
  completeTrackerSubmit,
  createTrackerSubmitGate,
  trackerSubmitIsCurrent,
} from '../lib/tracker-submit';

const fields = [
  ['company', 'Company'],
  ['role', 'Role'],
  ['url', 'Employer posting URL'],
  ['status', 'Source status (optional)'],
  ['notes', 'Research notes (optional)'],
] as const;
type Preview = { rows: SourceRow[]; kinds: string[] };

export function TrackerImport({
  onImported,
  onUnauthorized,
}: {
  onImported: () => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [csv, setCsv] = useState<TrackerCsv | null>(null);
  const [mapping, setMapping] = useState<TrackerMapping>({
    company: '',
    role: '',
    url: '',
    status: '',
    notes: '',
  });
  const [source, setSource] = useState('Simplify');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const reading = useRef(0);
  const submitGate = useRef(createTrackerSubmitGate());

  async function submit(action: 'preview' | 'import') {
    if (!csv) return;
    const started = beginTrackerSubmit(submitGate.current, action);
    if (started == null) return;
    setBusy(true);
    setMessage('');
    try {
      const rows =
        action === 'import' ? preview?.rows : trackerRows(csv, mapping, source);
      if (!rows) throw Error('Preview the selected columns first.');
      if (action === 'preview') setPreview(null);
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rows }),
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      const result = (await response.json()) as {
        error?: string;
        items: { kind: string }[];
      };
      if (!trackerSubmitIsCurrent(submitGate.current, started)) return;
      if (!response.ok)
        throw Error(result.error || 'Unable to import research.');
      if (action === 'preview') {
        setPreview({
          rows,
          kinds: result.items.map((item: { kind: string }) => item.kind),
        });
        setMessage('Check every record below. Nothing has been saved.');
      } else {
        setPreview(null);
        setCsv(null);
        setMessage(
          `Imported ${rows.length} research records. Existing application status and draft approval were preserved.`,
        );
        try {
          await onImported();
        } catch {
          if (!trackerSubmitIsCurrent(submitGate.current, started)) return;
          setMessage(
            'Research was imported, but the workspace could not refresh. Reload the page to see it.',
          );
        }
      }
    } catch (error) {
      if (!trackerSubmitIsCurrent(submitGate.current, started)) return;
      setMessage(
        error instanceof Error ? error.message : 'Unable to read the tracker.',
      );
    } finally {
      if (completeTrackerSubmit(submitGate.current, started)) setBusy(false);
      else setBusy(submitGate.current.pending != null);
    }
  }

  return (
    <div className="import-pane">
      <h3>Import a tracker CSV</h3>
      <p>
        Bring selected opportunities from a Simplify export or another tracker.
        Match its columns, then review the records before saving. New jobs enter
        the review queue; existing status and accepted drafts stay in Relay.
      </p>
      <p>
        Source statuses, including offers and rejections, are kept as research
        only. This does not synchronize your application pipeline. Choose up to
        200 rows with employer posting URLs; add missing URLs to your file
        first.
      </p>
      <fieldset disabled={busy} className="tracker-fields">
        <label className="field">
          Source tracker
          <input
            value={source}
            maxLength={100}
            onChange={(e) => {
              setSource(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <label className="field">
          Choose tracker CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              input.value = '';
              if (!file) return;
              const request = ++reading.current;
              setPreview(null);
              setCsv(null);
              setMessage('Reading selected file…');
              try {
                if (file.size > 2000000)
                  throw Error('Choose a CSV smaller than 2 MB.');
                const text = await file.text();
                if (request !== reading.current) return;
                const parsed = readTrackerCsv(text);
                setCsv(parsed);
                setMapping(suggestTrackerMapping(parsed.headers));
                setMessage(
                  `Read ${parsed.records.length} rows locally. Confirm the column choices. Only mapped fields are sent when you preview.`,
                );
              } catch (error) {
                if (request === reading.current)
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : 'Unable to read CSV.',
                  );
              }
            }}
          />
        </label>
        {csv && (
          <>
            <div className="tracker-columns">
              {fields.map(([key, label]) => (
                <label className="field" key={key}>
                  {label}
                  <select
                    value={mapping[key]}
                    onChange={(e) => {
                      setMapping({ ...mapping, [key]: e.target.value });
                      setPreview(null);
                    }}
                  >
                    <option value="">
                      {key === 'status' || key === 'notes'
                        ? 'Do not import'
                        : 'Choose column'}
                    </option>
                    {csv.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p>
              Omitted columns:{' '}
              {csv.headers
                .filter((h) => !Object.values(mapping).includes(h))
                .join(', ') || 'none'}
              . Keep your original export for all other data.
            </p>
          </>
        )}
      </fieldset>
      {message && <output>{message}</output>}
      {preview && (
        <>
          <h3>Review {preview.rows.length} records</h3>
          <p>
            These are the exact research fields that will be saved. Existing
            matches may change before import; Relay rechecks them when saving.
          </p>
          <div className="tracker-preview">
            {preview.rows.map((row, index) => (
              <article className="source" key={index}>
                <b>{row.Name}</b>{' '}
                <span className="badge">{preview.kinds[index]}</span>
                <p>{row.Job}</p>
                <pre>{row.Notes}</pre>
              </article>
            ))}
          </div>
        </>
      )}
      {(csv || preview) && (
        <div className="import-dock-actions">
          {csv && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void submit('preview')}
            >
              Preview tracker records
            </button>
          )}
          {preview && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void submit('import')}
            >
              Import {preview.rows.length} research records
            </button>
          )}
        </div>
      )}
    </div>
  );
}
