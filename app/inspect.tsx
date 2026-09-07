import { useCallback, useEffect, useState, type ReactNode } from 'react';

// Vinext hydrates a nested Inspect component as a second Accept button.
// Workspace calls useInspect so this markup stays in the existing client tree.

type InspectField = {
  label: string;
  filled: boolean;
  unknown: boolean;
  value?: string;
};
type InspectSnapshot = {
  job_id: string;
  destination: string | null;
  fields: InspectField[];
  files: { name: string; sha256: string }[];
  ready: boolean;
  armed: boolean;
  operation_id: string | null;
  digest: string | null;
  state: string | null;
  accept_enabled: boolean;
  viewer?: string;
};

function destinationHost(destination: string | null) {
  if (!destination) return null;
  try {
    return new URL(destination).host;
  } catch {
    return null;
  }
}

function fieldMark(field: InspectField) {
  if (field.unknown) return 'unknown';
  if (field.filled) return 'filled';
  return 'empty';
}

export function inspectMarkup({
  view,
  busy,
  error,
  onAccept,
}: {
  view: InspectSnapshot | null;
  busy: boolean;
  error: string;
  onAccept: () => void;
}): ReactNode {
  const host = destinationHost(view?.destination ?? null);
  const blocked = view?.fields.filter((field) => field.unknown) ?? [];
  const waiting = view?.state === 'authorized' || view?.state === 'executing';
  return (
    <div className="import">
      <h3>Inspect</h3>
      <p>
        Accept sends this application via the waiting operative; not draft
        Ready.
      </p>
      {host && (
        <p>
          Destination host: <strong>{host}</strong>
        </p>
      )}
      {view?.fields.length ? (
        <ul>
          {view.fields.map((field) => (
            <li key={field.label}>
              {field.label} <span className="badge">{fieldMark(field)}</span>
              {field.filled && !field.unknown && field.value ? (
                <small className="muted">{field.value}</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No application fields yet.</p>
      )}
      {view?.files.length ? (
        <ul>
          {view.files.map((file) => (
            <li key={`${file.name}:${file.sha256}`}>{file.name}</li>
          ))}
        </ul>
      ) : null}
      {blocked.length > 0 && (
        <>
          <h4>Blocked</h4>
          <ul>
            {blocked.map((field) => (
              <li key={field.label}>{field.label}</li>
            ))}
          </ul>
        </>
      )}
      {view?.ready && !view.armed && <p>Operative is not on the page.</p>}
      {waiting && <p>Accepted — waiting for the operative to send.</p>}
      <div className="actions">
        <button
          className="primary"
          type="button"
          disabled={busy || !view?.accept_enabled}
          onClick={onAccept}
        >
          Accept and send
        </button>
      </div>
      {error ? <output>{error}</output> : null}
    </div>
  );
}

export function useInspect(jobId: string | undefined) {
  const [view, setView] = useState<InspectSnapshot | null>(null);
  const [viewer, setViewer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!jobId) return;
      const r = await fetch(
        `/api/applications?job=${encodeURIComponent(jobId)}`,
        { signal },
      );
      const data = (await r.json()) as InspectSnapshot;
      if (signal?.aborted) return;
      if (data.viewer) setViewer(data.viewer);
      if (typeof data.job_id === 'string') setView(data);
    },
    [jobId],
  );

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => load(controller.signal))
      .catch(() => {});
    const timer = window.setInterval(() => {
      void load(controller.signal).catch(() => {});
    }, 1000);
    function onVisibility() {
      if (document.visibilityState === 'visible')
        void load(controller.signal).catch(() => {});
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [jobId, load]);

  async function approve() {
    if (!view?.operation_id || !view.digest || !viewer) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          viewer,
          id: view.operation_id,
          digest: view.digest,
        }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok)
        throw Error(data.error || 'Unable to accept this application.');
      await load();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(
        e instanceof Error ? e.message : 'Unable to accept this application.',
      );
    } finally {
      setBusy(false);
    }
  }

  return inspectMarkup({
    view,
    busy,
    error,
    onAccept: () => void approve(),
  });
}
