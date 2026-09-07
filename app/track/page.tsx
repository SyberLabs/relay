'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageSquareQuote,
  Receipt,
  ShieldAlert,
} from 'lucide-react';
import {
  beginPageWork,
  createPageSession,
  pageWorkIsLive,
  readAuthorizedJson,
} from '../../lib/page-session';
import { ProductShell } from '../shell';
import { queueFromSearch, queueHref, type QueueFilter } from '../../lib/nav';
import { asSheetJobs, type SheetJob } from '../../lib/runtime';
import { TrackJobSheet } from './jobs';
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
    [jobs, setJobs] = useState<SheetJob[]>([]),
    [filter, setFilter] = useState<QueueFilter>(() =>
      typeof window === 'undefined'
        ? 'All'
        : queueFromSearch(window.location.search, 'All'),
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [receipts, setReceipts] = useState<Record<string, string>>({}),
    [signedOut, setSignedOut] = useState(false);
  const sessionRef = useRef(createPageSession());
  const applyExpired = useCallback(() => {
    setData(null);
    setJobs([]);
    setReceipts({});
    setBusy(false);
    setMessage('');
    setSignedOut(true);
  }, []);
  const refresh = useCallback(async () => {
    if (sessionRef.current.expired) return;
    const started = beginPageWork(sessionRef.current);
    const [outcomesResponse, workspaceResponse] = await Promise.all([
      fetch('/api/outcomes'),
      fetch('/api/workspace'),
    ]);
    const outcomesReply = await readAuthorizedJson<Data>(
      sessionRef.current,
      started,
      outcomesResponse,
      'Unable to load outcomes.',
    );
    if (outcomesReply.kind === 'expired') {
      applyExpired();
      return;
    }
    if (outcomesReply.kind === 'ignore') return;
    const workspaceReply = await readAuthorizedJson<{
      jobs?: unknown;
      error?: string;
    }>(sessionRef.current, started, workspaceResponse, 'Unable to load jobs.');
    if (workspaceReply.kind === 'expired') {
      applyExpired();
      return;
    }
    if (workspaceReply.kind === 'ignore') return;
    if (outcomesReply.kind === 'error') throw Error(outcomesReply.error);
    if (workspaceReply.kind === 'error') throw Error(workspaceReply.error);
    if (!pageWorkIsLive(sessionRef.current, started)) return;
    setData(outcomesReply.body);
    setJobs(asSheetJobs(workspaceReply.body.jobs));
  }, [applyExpired]);
  function chooseSheetFilter(value: QueueFilter) {
    const next = value === filter && value !== 'All' ? 'All' : value;
    setFilter(next);
    window.history.replaceState(null, '', queueHref(next));
  }
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e: Error) => {
        if (sessionRef.current.expired) return;
        setMessage(e.message);
      });
  }, [refresh]);
  async function record(body: Record<string, unknown>, note: string) {
    if (sessionRef.current.expired) return;
    const started = beginPageWork(sessionRef.current);
    setBusy(true);
    try {
      const r = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record', ...body }),
      });
      const reply = await readAuthorizedJson<{ error?: string }>(
        sessionRef.current,
        started,
        r,
        'Unable to record.',
      );
      if (reply.kind === 'expired') {
        applyExpired();
        return;
      }
      if (reply.kind === 'ignore') return;
      if (reply.kind === 'error') throw Error(reply.error);
      if (!pageWorkIsLive(sessionRef.current, started)) return;
      await refresh();
      if (!pageWorkIsLive(sessionRef.current, started)) return;
      setMessage(note);
    } catch (e) {
      if (!pageWorkIsLive(sessionRef.current, started)) return;
      setMessage(e instanceof Error ? e.message : 'Unable to record.');
    } finally {
      if (pageWorkIsLive(sessionRef.current, started)) setBusy(false);
    }
  }
  if (signedOut)
    return (
      <ProductShell current="track">
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
      </ProductShell>
    );
  const unreceipted =
    data?.prep.filter((p) => p.status !== 'Ready' && !p.receipt).length ?? 0;
  return (
    <ProductShell current="track">
      <Link className="backlink" href="/">
        <ArrowLeft size={15} /> Workspace
      </Link>
      <h1>Track</h1>
      <p className="lead">
        Scan every saved job, then record what happened after you applied and
        the claims that submission committed you to.
      </p>
      {message && (
        <div className="notice" aria-live="polite">
          {message}
        </div>
      )}
      <TrackJobSheet filter={filter} jobs={jobs} onFilter={chooseSheetFilter} />

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
              {job.status === 'Ready' ? (
                <>
                  <input
                    aria-label="Submission receipt"
                    className="grow"
                    disabled={busy}
                    placeholder="Confirmation URL, reference, or email subject"
                    value={receipts[job.id] ?? ''}
                    onChange={(e) =>
                      setReceipts((current) => ({
                        ...current,
                        [job.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    className="primary"
                    disabled={
                      busy || (receipts[job.id] ?? '').trim().length < 4
                    }
                    onClick={() =>
                      record(
                        {
                          id: job.id,
                          version: job.version,
                          kind: 'submitted',
                          receipt: receipts[job.id] ?? '',
                        },
                        'Recorded the submission.',
                      )
                    }
                  >
                    Record submission
                  </button>
                </>
              ) : (
                laterKinds.map((kind) => (
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
                ))
              )}
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
      <footer>Relay / SyberLabs</footer>
    </ProductShell>
  );
}
