'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  agentModeCopy,
  agentParkCopy,
  type AgentSessionView,
} from '../lib/agent-runtime-view';
import type { AgentRuntimeMode } from '../lib/agent-runtime-admission';

type Reply = {
  viewer?: string;
  mode?: AgentRuntimeMode;
  session?: AgentSessionView | null;
  error?: string;
};

export function AgentSessionPanel({
  jobId,
  jobName,
  onInspect,
}: {
  jobId: string;
  jobName: string;
  onInspect: () => void;
}) {
  const [mode, setMode] = useState<AgentRuntimeMode>('off');
  const [session, setSession] = useState<AgentSessionView | null>(null);
  const [viewer, setViewer] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/agents?job=${encodeURIComponent(jobId)}`,
    );
    const data = (await response.json()) as Reply;
    if (!response.ok) {
      setError(data.error || 'Agent session is unavailable.');
      return;
    }
    setError('');
    setMode(data.mode || 'off');
    setSession(data.session ?? null);
    if (data.viewer) setViewer(data.viewer);
  }, [jobId]);
  const poll =
    Boolean(jobId) && (mode !== 'off' || Boolean(session?.session_id));
  useEffect(() => {
    if (!jobId) return;
    void Promise.resolve().then(() => load());
  }, [jobId, load]);
  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => void load(), 3000);
    function onVisibility() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, poll]);
  async function mutate(body: Record<string, unknown>) {
    if (!viewer) return;
    setBusy(true);
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, viewer, job: jobId }),
      });
      const data = (await response.json()) as Reply;
      if (!response.ok) {
        setError(data.error || 'Agent session is unavailable.');
        return;
      }
      setError('');
      setMode(data.mode || mode);
      setSession(data.session ?? null);
      if (body.action === 'answer') setAnswer('');
    } finally {
      setBusy(false);
    }
  }
  if (mode === 'off' && !session) return null;
  const copy = agentParkCopy(session, jobName);
  const canWrite = mode !== 'off';
  const canStart =
    canWrite &&
    (!session || session.status === 'cancelled' || session.status === 'failed');
  return (
    <section className="agent-session" aria-label="Agent session">
      <h3>Cognitive runtime</h3>
      <p className="muted">{agentModeCopy(mode)}</p>
      {error ? <p className="notice">{error}</p> : null}
      {copy.title ? <p>{copy.title}</p> : null}
      {copy.detail ? <p className="muted">{copy.detail}</p> : null}
      {copy.action === 'answer' && canWrite ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutate({ action: 'answer', answer, remember: false });
          }}
        >
          <label className="field">
            Your answer
            <input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={20000}
            />
          </label>
          <button
            className="btn"
            disabled={busy || !answer.trim()}
            type="submit"
          >
            Return answer to agent
          </button>
        </form>
      ) : null}
      {copy.action === 'authorize' ? (
        <div className="agent-actions">
          <button className="secondary" onClick={onInspect} type="button">
            Inspect
          </button>
          <p className="muted">
            Accept & send stays on Inspect. It is not an agent tool.
          </p>
          {canWrite && session?.authorized ? (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void mutate({ action: 'continue' })}
              type="button"
            >
              Tell the agent it may continue
            </button>
          ) : null}
        </div>
      ) : null}
      {copy.action === 'working' && canWrite ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void mutate({ action: 'sync' })}
          type="button"
        >
          Refresh runtime
        </button>
      ) : null}
      {canStart ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void mutate({ action: 'start' })}
          type="button"
        >
          Start a runtime session
        </button>
      ) : null}
      {canWrite && session && session.status !== 'cancelled' ? (
        <button
          className="textbtn"
          disabled={busy}
          onClick={() => void mutate({ action: 'cancel' })}
          type="button"
        >
          Cancel agent turn
        </button>
      ) : null}
    </section>
  );
}
