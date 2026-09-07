'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRelayTools } from '../agent-tools';
import { inspectSummaryMarkup, useInspectSnapshot } from '../inspect';
import { inspectOperativeStatus } from '../../lib/inspect-view';

const TOOL_STATUS_COPY = {
  checking: 'Checking browser assistant tools…',
  unavailable:
    'This browser does not provide WebMCP tools. Use a compatible assistant browser.',
  registered: 'Relay tools registered in this tab.',
  failed: 'Relay tools could not register in this tab. Reload to try again.',
} as const;

function jobFromSearch() {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('job') || undefined;
}

function verbTranscript(name: string, result: unknown) {
  let text = name;
  try {
    text += `\n${JSON.stringify(result, null, 2)}`;
  } catch {
    text += '\nUnable to show result.';
  }
  return text.length > 4000 ? `${text.slice(0, 3999)}…` : text;
}

export default function ApplyOverlay() {
  const [jobId, setJobId] = useState<string | undefined>();
  const [lastVerb, setLastVerb] = useState('');
  useEffect(() => {
    // Sites search is only available after mount; setState is deferred one tick.
    void Promise.resolve().then(() => setJobId(jobFromSearch()));
  }, []);
  const inspect = useInspectSnapshot(jobId);
  const onVerb = useCallback((name: string, result: unknown) => {
    setLastVerb(verbTranscript(name, result));
  }, []);
  const toolStatus = useRelayTools(inspect.load, onVerb);
  const status = inspectOperativeStatus(inspect.view);
  const returnTo = jobId
    ? `/apply?job=${encodeURIComponent(jobId)}`
    : '/apply';

  if (inspect.signedOut)
    return (
      <main className="apply-overlay">
        <p className="brand">
          <span className="mark">r</span>relay
        </p>
        <h1>Apply overlay</h1>
        <p>Sign in to open this job’s Inspect summary.</p>
        {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
        <a
          className="primary"
          href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}
          target="_top"
        >
          Sign in with ChatGPT
        </a>
      </main>
    );

  return (
    <main className="apply-overlay">
      <p className="brand">
        <span className="mark">r</span>relay
      </p>
      <h1>Inspect</h1>
      <p>Accept lives on the human workspace, not here.</p>
      {!jobId ? (
        <p className="muted">Open this overlay with a job query.</p>
      ) : (
        inspectSummaryMarkup(inspect.view)
      )}
      {status ? <p>Operative status: {status}</p> : null}
      <output aria-label="Browser assistant tools">
        {TOOL_STATUS_COPY[toolStatus]}
      </output>
      <output aria-label="Last verb result">
        {lastVerb || 'No verb result yet.'}
      </output>
    </main>
  );
}
