'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Receipt } from 'lucide-react';
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
type Application = {
  id: string;
  name: string;
  status: string;
  version: number;
  receipt: string | null;
  accepted_draft: string | null;
};
type Data = {
  outcomes: Outcome[];
  applications: Application[];
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
    // A sibling fetch or JSON body must never delay clearing an expired session.
    const read = async <T extends { error?: string }>(
      url: string,
      fallback: string,
    ) => {
      const response = await fetch(url);
      const reply = await readAuthorizedJson<T>(
        sessionRef.current,
        started,
        response,
        fallback,
      );
      if (reply.kind === 'expired') applyExpired();
      return reply;
    };
    const [outcomesReply, workspaceReply] = await Promise.all([
      read<Data>('/api/outcomes', 'Unable to load outcomes.'),
      read<{ jobs?: unknown; error?: string }>(
        '/api/workspace',
        'Unable to load jobs.',
      ),
    ]);
    if (
      outcomesReply.kind === 'expired' ||
      outcomesReply.kind === 'ignore' ||
      workspaceReply.kind === 'expired' ||
      workspaceReply.kind === 'ignore'
    )
      return;
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
    data?.applications.filter((p) => p.status !== 'Ready' && !p.receipt)
      .length ?? 0;
  return (
    <ProductShell current="track">
      <Link className="backlink" href="/">
        <ArrowLeft size={15} /> Runtime
      </Link>
      <h1>Tracker</h1>
      <p className="lead">
        Scan every saved job, then record what happened after you applied and
        the claims that submission committed you to.
      </p>
      {message && (
        <div className="notice" aria-live="polite">
          {message}
        </div>
      )}
      <TrackJobSheet
        filter={filter}
        jobs={jobs}
        loaded={data !== null}
        onFilter={chooseSheetFilter}
      />

      {unreceipted > 0 && (
        <section className="report warn">
          <b>
            {unreceipted} application
            {unreceipted > 1 ? 's' : ''} without a receipt
          </b>
          <p>
            These arrived through an import that asserted a submission without
            proof. They stay visible so you can add a receipt or correct the
            record.
          </p>
        </section>
      )}

      <section className="import">
        <h2>Live applications</h2>
        {!data?.applications.length && (
          <p className="empty">
            Nothing submitted yet. Accept an exact draft in Runtime, then
            record the submission with its receipt.
          </p>
        )}
        {data?.applications.map((job) => (
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
            {job.accepted_draft && (
              <div className="claimrow">
                <b>Exact wording accepted in Relay</b>
                <p>{job.accepted_draft}</p>
                <small>
                  This records what you accepted here; it does not prove what
                  the employer received.
                </small>
              </div>
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
