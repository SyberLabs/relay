'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageSquareQuote,
  Receipt,
  ShieldAlert,
} from 'lucide-react';
type Outcome = {
  id: string;
  job_id: string;
  kind: string;
  detail: string;
  receipt: string | null;
  occurred: string;
};
type Prep = {
  id: string;
  name: string;
  status: string;
  version: number;
  receipt: string | null;
  claims: { id: string; claim: string; evidence: string }[];
};
type Rate = {
  mean: number;
  low: number;
  high: number;
  sent: number;
  responses: number;
};
type Data = {
  outcomes: Outcome[];
  prep: Prep[];
  rates: Record<string, Rate>;
  error?: string;
};
const laterKinds = [
  'response',
  'screen',
  'onsite',
  'offer',
  'accepted',
  'rejected',
  'ghosted',
  'withdrawn',
];
export default function Track() {
  const [data, setData] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [signedOut, setSignedOut] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch('/api/outcomes');
    const body = (await r.json()) as Data;
    if (r.status === 401) {
      setData(null);
      setSignedOut(true);
      return;
    }
    if (!r.ok) throw Error(body.error);
    setData(body);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e: Error) => setMessage(e.message));
  }, [refresh]);
  async function record(body: Record<string, unknown>, note: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record', ...body }),
      });
      const result = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(result.error);
      await refresh();
      setMessage(note);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to record.');
    } finally {
      setBusy(false);
    }
  }
  if (signedOut)
    return (
      <main className="productpage">
        <h1>Track</h1>
        <p className="lead">Sign in to see your live applications.</p>
        {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
        <a
          className="primary"
          href="/signin-with-chatgpt?return_to=/track"
          target="_top"
        >
          Sign in with ChatGPT
        </a>
      </main>
    );
  const unreceipted = data?.prep.filter((p) => !p.receipt).length ?? 0;
  return (
    <main className="productpage">
      <Link className="backlink" href="/">
        <ArrowLeft size={15} /> Workspace
      </Link>
      <p className="eyebrow">
        TRACK · WHAT CAME BACK, AND WHAT YOU MUST DEFEND
      </p>
      <h1>Close the loop, and know what you claimed.</h1>
      <p className="lead">
        Every application commits you to defending specific claims. Because each
        one had to cite a verified fact, the preparation sheet already exists —
        it is the citation list, not a separate document.
      </p>
      {message && (
        <div className="notice" aria-live="polite">
          {message}
        </div>
      )}

      {data && Object.keys(data.rates).length > 0 && (
        <section className="import">
          <h2>Reply rates by role type</h2>
          <p>
            Descriptive only. Samples are small, the market moves, and a job
            search cannot be run as an experiment — so these say what happened,
            never what caused it.
          </p>
          {Object.entries(data.rates).map(([cluster, r]) => (
            <article className="factrow" key={cluster}>
              <b>{cluster}</b>
              <span className="badge">
                {(r.mean * 100).toFixed(0)}% · {(r.low * 100).toFixed(0)}–
                {(r.high * 100).toFixed(0)}%
              </span>
              <small>
                {r.responses} replies from {r.sent} receipted submissions
                {r.sent < 10 ? ' · too few to read much into' : ''}
              </small>
            </article>
          ))}
        </section>
      )}

      {unreceipted > 0 && (
        <section className="report warn">
          <b>
            <ShieldAlert size={16} /> {unreceipted} application
            {unreceipted > 1 ? 's' : ''} without a receipt
          </b>
          <p>
            These arrived through an import that asserted a submission without
            proof. They stay visible, but they are excluded from the reply rates
            above — counting a send that may never have happened would corrupt
            every estimate built on it.
          </p>
        </section>
      )}

      <section className="import">
        <h2>Live applications</h2>
        {!data?.prep.length && (
          <p className="empty">
            Nothing submitted yet. Accept an exact draft in the workspace, then
            record the submission with its receipt.
          </p>
        )}
        {data?.prep.map((job) => (
          <article className="draftrow" key={job.id}>
            <div className="drafthead">
              <b>{job.name}</b>
              <span className="badge">{job.status}</span>
              {job.receipt ? (
                <span className="badge">
                  <Receipt size={12} /> receipted
                </span>
              ) : (
                <span className="badge warnbadge">no receipt</span>
              )}
            </div>
            {job.claims.length > 0 ? (
              <>
                <p className="why">
                  <MessageSquareQuote size={14} /> Be ready to defend, in these
                  words:
                </p>
                {job.claims.map((c) => (
                  <div className="claimrow" key={c.id}>
                    <b>{c.claim}</b>
                    <small>{c.evidence || 'no evidence recorded'}</small>
                  </div>
                ))}
              </>
            ) : (
              <p className="why">
                No cited claims on the logged draft — nothing here commits you
                to a specific figure.
              </p>
            )}
            <div className="actions">
              {laterKinds.map((kind) => (
                <button
                  className="secondary"
                  disabled={busy}
                  key={kind}
                  onClick={() =>
                    record(
                      { id: job.id, version: job.version, kind },
                      `Recorded: ${kind}.`,
                    )
                  }
                >
                  {kind}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      {data && data.outcomes.length > 0 && (
        <section className="import">
          <h2>History</h2>
          {data.outcomes
            .slice()
            .reverse()
            .map((o) => (
              <article className="factrow" key={o.id}>
                <b>{o.kind}</b>
                <span className="badge">
                  {new Date(o.occurred).toLocaleDateString()}
                </span>
                <small>
                  {o.receipt ? `receipt: ${o.receipt}` : 'no receipt recorded'}
                </small>
              </article>
            ))}
        </section>
      )}
      <footer>
        Relay / SyberLabs<span>Outcomes are what make the estimates real.</span>
      </footer>
    </main>
  );
}
