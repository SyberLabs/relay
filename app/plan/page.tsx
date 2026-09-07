'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Target, TrendingUp } from 'lucide-react';
type Row = {
  id: string;
  job_key: string;
  name: string;
  company: string;
  status: string;
  cluster: string;
  u: number;
  p: number;
  tier: string;
  effort: number;
  evidence: number;
  band: [number, number];
  reason: string;
};
type Plan = {
  minutes: number;
  calibrated: number;
  spent: number;
  expected: number;
  naive: number;
  plan: Row[];
  rest: Row[];
  error?: string;
};
const pct = (n: number) => (n * 100).toFixed(1) + '%';
function Job({ row, rank }: { row: Row; rank?: number }) {
  return (
    <article className="planrow">
      <div className="planhead">
        {rank !== undefined && <span className="rank">{rank}</span>}
        <b>{row.name}</b>
        <span className={'badge tier-' + row.tier}>
          {row.tier === 'reach'
            ? 'Lower reply estimate'
            : row.tier === 'floor'
              ? 'Higher reply estimate'
              : 'Middle reply estimate'}
        </span>
        <span className="badge">{row.cluster}</span>
      </div>
      <dl className="planstats">
        <div>
          <dt>Preference score</dt>
          <dd className="num">{row.u.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Estimated reply rate</dt>
          <dd className="num">
            {pct(row.p)}
            <small>
              {row.evidence
                ? ` from ${row.evidence} sent`
                : ' prior, no evidence yet'}
            </small>
          </dd>
        </div>
        <div>
          <dt>Costs</dt>
          <dd className="num">{row.effort} min</dd>
        </div>
      </dl>
    </article>
  );
}
export default function PlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null),
    [message, setMessage] = useState(''),
    [signedOut, setSignedOut] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch('/api/plan');
    const data = (await r.json()) as Plan;
    if (r.status === 401) {
      setPlan(null);
      setSignedOut(true);
      return;
    }
    if (!r.ok) throw Error(data.error);
    setPlan(data);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e: Error) => setMessage(e.message));
  }, [refresh]);
  if (signedOut)
    return (
      <main className="productpage">
        <h1>This week</h1>
        <p className="lead">Sign in to see your plan.</p>
        {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
        <a
          className="primary"
          href="/signin-with-chatgpt?return_to=/plan"
          target="_top"
        >
          Sign in with ChatGPT
        </a>
      </main>
    );
  const lift = plan && plan.naive > 0 ? plan.expected / plan.naive - 1 : 0;
  return (
    <main className="productpage">
      <Link className="backlink" href="/">
        <ArrowLeft size={15} /> Workspace
      </Link>
      <Link className="backlink" href="/advanced">
        Advanced
      </Link>
      <h1>This week</h1>
      <p className="lead">
        Experimental planning from preference weights, estimated reply rates,
        posting age and your time budget. A reply is not an offer; these scores
        do not predict hiring outcomes.
      </p>
      {message && (
        <div className="notice" aria-live="polite">
          {message}
        </div>
      )}
      <section className="stats">
        <div>
          <span>Selected</span>
          <strong>
            {(plan?.plan.length ?? 0).toString().padStart(2, '0')}
          </strong>
          <small>Roles to consider</small>
        </div>
        <div>
          <span>Attention spent</span>
          <strong>{plan?.spent ?? 0}</strong>
          <small>of {plan?.minutes ?? 0} minutes</small>
        </div>
        <div>
          <span>Experimental plan score</span>
          <strong className="num">{(plan?.expected ?? 0).toFixed(3)}</strong>
          <small>Uses reply estimates, not offer probabilities</small>
        </div>
        <div className="stataccent">
          <TrendingUp size={22} />
          <b>
            {lift > 0.005
              ? `${(lift * 100).toFixed(0)}% higher model score`
              : 'Same model score as preference ranking'}
          </b>
          <small>Compared with preference ranking at the same budget</small>
        </div>
      </section>

      {plan && plan.calibrated < 12 && (
        <section className="replay">
          <Target size={20} />
          <div>
            <b>The value model is still thin.</b>
            <p>
              {plan.calibrated} comparisons recorded. Until there are around a
              dozen, roles are ranked mostly on reply estimates and time rather
              than on what you actually want.
            </p>
          </div>
          <Link className="secondary" href="/preferences">
            Answer a few
          </Link>
        </section>
      )}

      <section className="import">
        <h2>Suggested for consideration</h2>
        <p>
          Selected by added model score per estimated minute. Review each job
          yourself.
        </p>
        {!plan?.plan.length && (
          <p className="empty">
            Nothing selected. Either there are no open roles in the workspace,
            or every one costs more than the remaining budget.
          </p>
        )}
        {plan?.plan.map((row, i) => (
          <Job key={row.id} row={row} rank={i + 1} />
        ))}
      </section>

      {plan && plan.rest.length > 0 && (
        <section className="import">
          <h2>Considered, not selected</h2>
          <p>
            These added less model score per minute or did not fit the remaining
            time budget. This does not assess your qualifications.
          </p>
          {plan.rest.map((row) => (
            <Job key={row.id} row={row} />
          ))}
        </section>
      )}
      <footer>Relay / SyberLabs</footer>
    </main>
  );
}
