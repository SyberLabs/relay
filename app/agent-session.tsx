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
  useEffect(() => {
    if (!jobId) return;
    void Promise.resolve().then(() => load());
    const timer = window.setInterval(() => void load(), 3000);
    function onVisibility() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [jobId, load]);
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
  return (
    <section className="agent-session" aria-label="Agent session">
      <h3>Cognitive runtime</h3>
      <p className="muted">{agentModeCopy(mode)}</p>
      {error ? <p className="notice">{error}</p> : null}
      {copy.title ? <p>{copy.title}</p> : null}
      {copy.detail ? <p className="muted">{copy.detail}</p> : null}
      {copy.action === 'answer' ? (
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
          {session?.authorized ? (
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
      {mode !== 'off' && !session ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void mutate({ action: 'start' })}
          type="button"
        >
          Start a runtime session
        </button>
      ) : null}
    </section>
  );
}
