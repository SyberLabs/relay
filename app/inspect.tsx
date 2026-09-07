import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import type { WorkspaceSession } from '../lib/workspace-refresh';

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

export function inspectSummaryMarkup(view: InspectSnapshot | null): ReactNode {
  const host = destinationHost(view?.destination ?? null);
  const blocked = view?.fields.filter((field) => field.unknown) ?? [];
  return (
    <>
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
    </>
  );
}

export function inspectMarkup({
  view,
  busy,
  error,
  onAccept,
  onAnswer,
  onAnswerChange,
}: {
  view: InspectSnapshot | null;
  busy: boolean;
  error: string;
  onAccept: () => void;
  onAnswer: (label: string, value: string) => void;
  onAnswerChange: (label: string) => void;
}): ReactNode {
  const blocked = view?.fields.filter((field) => field.unknown) ?? [];
  return (
    <div className="import">
      <h3>Inspect</h3>
      <p>
        Accept sends this application via the waiting operative; not draft
        Ready.
      </p>
      {inspectSummaryMarkup(view)}
      {blocked.map((field) => (
        <form
          key={field.label}
          onSubmit={(event) => {
            event.preventDefault();
            const raw = new FormData(event.currentTarget).get('value');
            onAnswer(field.label, typeof raw === 'string' ? raw : '');
          }}
        >
          <label>
            {field.label}
            <input
              name="value"
              type="text"
              maxLength={20000}
              autoComplete="off"
              disabled={busy}
              onChange={() => onAnswerChange(field.label)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Save answer
          </button>
        </form>
      ))}
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

type InspectSession = {
  sessionRef: { current: WorkspaceSession };
  onUnauthorized: () => void;
};

export function useInspectSnapshot(
  jobId: string | undefined,
  session?: InspectSession,
) {
  const [view, setView] = useState<InspectSnapshot | null>(null);
  const [viewer, setViewer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [renderedJob, setRenderedJob] = useState(jobId);
  const gateRef = useRef(createInspectPollGate());
  const inflightRef = useRef<AbortController | null>(null);
  // Poll generations change every refresh. Mutation generations change only
  // when the selected job or authenticated session changes.
  const contextRef = useRef({
    jobId,
    session,
    generation: 0,
    viewer: '',
    expired: false,
    pending: false,
    answerRevisions: new Map<string, string | null>(),
  });
  // Rendering a newly selected job must never expose the previous snapshot.
  if (renderedJob !== jobId) {
    setRenderedJob(jobId);
    setView(null);
    setViewer('');
    setBusy(false);
    setError('');
    setSignedOut(false);
  }
  // Commit the callback gate before pending promise continuations can run.
  // Session refs are read only in effects and callbacks, never during render.
  useLayoutEffect(() => {
    const context = contextRef.current;
    if (context.jobId !== jobId) {
      context.jobId = jobId;
      context.generation += 1;
      context.viewer = '';
      context.expired = false;
      context.pending = false;
      context.answerRevisions.clear();
      selectInspectJob(gateRef.current, jobId);
    }
    context.session = session;
  });

  const expire = useCallback(() => {
    const current = contextRef.current;
    current.generation += 1;
    current.viewer = '';
    current.expired = true;
    current.pending = false;
    current.answerRevisions.clear();
    selectInspectJob(gateRef.current, current.jobId);
    inflightRef.current?.abort();
    setView(null);
    setViewer('');
    setBusy(false);
    setError('');
    setSignedOut(true);
    current.session?.onUnauthorized();
  }, []);

  const load = useCallback(async () => {
    const context = contextRef.current;
    const job = context.jobId;
    if (!job || context.expired) return;
    inflightRef.current?.abort();
    const controller = new AbortController();
    inflightRef.current = controller;
    const started = {
      jobId: job,
      generation: beginInspectPoll(gateRef.current),
    };
    const generation = context.generation;
    const workspace = context.session?.sessionRef.current;
    const epoch = workspace?.gate.epoch;
    const owner = workspace?.viewer;
    const live = () =>
      generation === contextRef.current.generation &&
      started.generation === gateRef.current.generation &&
      job === contextRef.current.jobId &&
      epoch === context.session?.sessionRef.current.gate.epoch &&
      owner === context.session?.sessionRef.current.viewer;
    const clear = () => {
      setView(null);
      setViewer('');
      contextRef.current.viewer = '';
      contextRef.current.generation += 1;
      contextRef.current.pending = false;
      setBusy(false);
    };
    try {
      const r = await fetch(
        `/api/applications?job=${encodeURIComponent(job)}`,
        { signal: controller.signal },
      );
      if (!live()) return;
      if (r.status === 401) {
        expire();
        return;
      }
      let data: unknown;
      try {
        data = await r.json();
      } catch {
        if (live()) clear();
        return;
      }
      if (!live()) return;
      const outcome = applyInspectPoll(gateRef.current, started, {
        ok: r.ok,
        data,
      });
      if (outcome.type === 'ignore') return;
      if (outcome.type === 'clear' || !outcome.viewer) {
        clear();
        return;
      }
      const expectedViewer = context.session?.sessionRef.current.viewer;
      if (expectedViewer && outcome.viewer !== expectedViewer) {
        expire();
        return;
      }
      if (
        contextRef.current.viewer &&
        contextRef.current.viewer !== outcome.viewer
      ) {
        contextRef.current.generation += 1;
        contextRef.current.pending = false;
        contextRef.current.answerRevisions.clear();
        setBusy(false);
        setError('');
      }
      contextRef.current.viewer = outcome.viewer;
      setSignedOut(false);
      setViewer(outcome.viewer);
      setView(outcome.view);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (live()) clear();
    }
  }, [expire]);

  useEffect(() => {
    selectInspectJob(gateRef.current, jobId);
    if (!jobId) return;
    void Promise.resolve().then(() => load());
    const context = contextRef.current;
    const timer = window.setInterval(() => void load(), 3000);
    function onVisibility() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      context.generation += 1;
      inflightRef.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [jobId, load]);

  async function mutate(body: Record<string, unknown>, failure: string) {
    const current = contextRef.current;
    if (
      !jobId ||
      current.jobId !== jobId ||
      current.viewer !== viewer ||
      !viewer ||
      current.expired ||
      current.pending
    )
      return;
    const generation = current.generation;
    const workspace = current.session?.sessionRef.current;
    const epoch = workspace?.gate.epoch;
    const owner = workspace?.viewer;
    if (workspace && owner !== viewer) return;
    const live = () =>
      generation === contextRef.current.generation &&
      jobId === contextRef.current.jobId &&
      viewer === contextRef.current.viewer &&
      !contextRef.current.expired &&
      epoch === current.session?.sessionRef.current.gate.epoch &&
      owner === current.session?.sessionRef.current.viewer;
    current.pending = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, viewer }),
      });
      if (!live()) return;
      if (r.status === 401) {
        expire();
        return;
      }
      const data = (await r.json()) as { error?: string; viewer?: string };
      if (!live()) return;
      if (data.viewer && data.viewer !== viewer) {
        expire();
        return;
      }
      if (!r.ok) throw Error(data.error || failure);
      await load();
      if (live() && body.action === 'answer' && typeof body.label === 'string')
        contextRef.current.answerRevisions.delete(body.label);
    } catch (e) {
      if (!live()) return;
      setError(e instanceof Error ? e.message : failure);
    } finally {
      if (live()) {
        contextRef.current.pending = false;
        setBusy(false);
      }
    }
  }

  return {
    view: view?.job_id === jobId ? view : null,
    viewer,
    busy,
    error,
    signedOut,
    load,
    mutate,
    rememberAnswerRevision: (label: string, revision: string | null) => {
      const revisions = contextRef.current.answerRevisions;
      if (!revisions.has(label)) revisions.set(label, revision);
    },
    answerRevision: (label: string, revision: string | null) => {
      const revisions = contextRef.current.answerRevisions;
      return revisions.has(label) ? revisions.get(label) : revision;
    },
  };
}

export function useInspect(
  jobId: string | undefined,
  session?: InspectSession,
) {
  const inspect = useInspectSnapshot(jobId, session);
  const shown = inspect.view;

  return inspectMarkup({
    view: shown,
    busy: inspect.busy,
    error: inspect.error,
    onAccept: () => {
      if (!shown?.operation_id || !shown.digest || !shown.accept_enabled)
        return;
      void inspect.mutate(
        {
          action: 'approve',
          id: shown.operation_id,
          digest: shown.digest,
        },
        'Unable to accept this application.',
      );
    },
    onAnswerChange: (label) => {
      if (shown)
        inspect.rememberAnswerRevision(label, shown.preparation_revision);
    },
    onAnswer: (label, value) => {
      if (!shown || shown.job_id !== jobId) return;
      void inspect.mutate(
        {
          action: 'answer',
          job: jobId,
          preparation_revision: inspect.answerRevision(
            label,
            shown.preparation_revision,
          ),
          label,
          value,
        },
        'Unable to save this answer.',
      );
    },
  });
}
