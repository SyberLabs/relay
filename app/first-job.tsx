'use client';
import { useRef, useState } from 'react';
import type { SourceRow } from '../lib/domain';
import {
  existingJobForUrl,
  firstJobErrors,
  firstJobRow,
  joinExistingJobNotice,
  type FirstJobErrors,
  type FirstJobRecord,
} from '../lib/first-job';

const emptyErrors: FirstJobErrors = {};

export function FirstJob({
  jobs,
  busy,
  onCancel,
  onSave,
}: {
  jobs: FirstJobRecord[];
  busy: boolean;
  onCancel: () => void;
  onSave: (row: SourceRow) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FirstJobErrors>(emptyErrors);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const match = existingJobForUrl(jobs, url);
  const blocked = busy || saving;

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (busy || pending.current) return;
    const fields = { title, url, notes };
    const next = firstJobErrors(fields);
    setErrors(next);
    if (next.title || next.url || next.notes) return;
    pending.current = true;
    setSaving(true);
    try {
      await onSave(firstJobRow(fields));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="import">
      <h2>Add a job</h2>
      <p>
        Enter the role title and posting URL. Optional notes are saved as
        research. Company, compensation and fit are not required.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          Role title
          <input
            aria-invalid={!!errors.title}
            aria-label="Role title"
            aria-describedby={
              errors.title ? 'first-job-title-error' : undefined
            }
            name="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErrors((current) => ({ ...current, title: undefined }));
            }}
          />
        </label>
        {errors.title && (
          <p className="muted" id="first-job-title-error" role="alert">
            {errors.title}
          </p>
        )}
        <label className="field">
          Posting URL
          <input
            aria-invalid={!!errors.url}
            aria-label="Posting URL"
            aria-describedby={errors.url ? 'first-job-url-error' : undefined}
            inputMode="url"
            name="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setErrors((current) => ({ ...current, url: undefined }));
            }}
          />
        </label>
        {errors.url && (
          <p className="muted" id="first-job-url-error" role="alert">
            {errors.url}
          </p>
        )}
        {match && <div className="notice">{joinExistingJobNotice(match)}</div>}
        <label className="field">
          Research notes
          <textarea
            aria-invalid={!!errors.notes}
            aria-label="Research notes"
            aria-describedby={
              errors.notes ? 'first-job-notes-error' : undefined
            }
            name="notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setErrors((current) => ({ ...current, notes: undefined }));
            }}
          />
        </label>
        {errors.notes && (
          <p className="muted" id="first-job-notes-error" role="alert">
            {errors.notes}
          </p>
        )}
        <small className="muted">
          Role title up to 500 characters. Research notes up to 20,000
          characters. Notes are kept as written.
        </small>
        <div className="actions">
          <button className="primary" disabled={blocked} type="submit">
            Save job
          </button>
          <button
            className="textbutton"
            disabled={blocked}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
