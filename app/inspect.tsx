import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  applyInspectPoll,
  beginInspectPoll,
  createInspectPollGate,
  inspectShowsAuthorizedWaiting,
  inspectShowsReadyNotArmed,
  selectInspectJob,
  type InspectSnapshot,
} from '../lib/inspect-view';

// Vinext hydrates a nested Inspect component as a second Accept button.
// Workspace calls useInspect so this markup stays in the existing client tree.

function destinationHost(destination: string | null) {
  if (!destination) return null;
  try {
    return new URL(destination).host;
  } catch {
    return null;
  }
}

function fieldMark(field: InspectSnapshot['fields'][number]) {
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
      {inspectShowsReadyNotArmed(view) && <p>Operative is not on the page.</p>}
      {inspectShowsAuthorizedWaiting(view) && (
        <p>Accepted — waiting for the operative to send.</p>
      )}
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
  const gateRef = useRef(createInspectPollGate());
  const inflightRef = useRef<AbortController | null>(null);
  const selectedRef = useRef(jobId);
  if (selectedRef.current !== jobId) {
    selectedRef.current = jobId;
    selectInspectJob(gateRef.current, jobId);
    setView(null);
    setBusy(false);
    setError('');
  }

  const load = useCallback(async () => {
    const job = gateRef.current.jobId;
    if (!job) return;
    inflightRef.current?.abort();
    const controller = new AbortController();
    inflightRef.current = controller;
    const started = {
      jobId: job,
      generation: beginInspectPoll(gateRef.current),
    };
    try {
      const r = await fetch(
        `/api/applications?job=${encodeURIComponent(job)}`,
        { signal: controller.signal },
      );
      let data: unknown;
      try {
        data = await r.json();
      } catch {
        const outcome = applyInspectPoll(gateRef.current, started, {
          ok: false,
        });
        if (outcome.type === 'clear') setView(null);
        return;
      }
      const outcome = applyInspectPoll(gateRef.current, started, {
        ok: r.ok,
        data,
      });
      if (outcome.type === 'ignore') return;
      if (outcome.type === 'clear') {
        setView(null);
        return;
      }
      if (outcome.viewer) setViewer(outcome.viewer);
      setView(outcome.view);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const outcome = applyInspectPoll(gateRef.current, started, { ok: false });
      if (outcome.type === 'clear') setView(null);
    }
  }, []);

  useEffect(() => {
    if (gateRef.current.jobId !== jobId)
      selectInspectJob(gateRef.current, jobId);
    if (!jobId) return;
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 1000);
    function onVisibility() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      inflightRef.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [jobId, load]);

  const shown = view?.job_id === jobId ? view : null;

  async function approve() {
    if (!shown?.operation_id || !shown.digest || !viewer) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          viewer,
          id: shown.operation_id,
          digest: shown.digest,
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
    view: shown,
    busy,
    error,
    onAccept: () => void approve(),
  });
}
