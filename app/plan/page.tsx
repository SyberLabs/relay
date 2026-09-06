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
        <span className={'badge tier-' + row.tier}>{row.tier}</span>
        <span className="badge">{row.cluster}</span>
      </div>
      <p className="why">{row.reason}</p>
      <dl className="planstats">
        <div>
          <dt>Value</dt>
          <dd className="num">{row.u.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Reply odds</dt>
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
    if (r.status === 401) return setSignedOut(true);
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
      <p className="eyebrow">THIS WEEK · WHAT TO ACTUALLY APPLY TO</p>
      <h1>A plan sized to your week, not a queue.</h1>
      <p className="lead">
        You accept one job, so this maximises the expected value of the best
        offer you receive rather than the total across applications. That is why
        a long shot can outrank a safer role you already have covered.
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
          <small>Applications this week</small>
        </div>
        <div>
          <span>Attention spent</span>
          <strong>{plan?.spent ?? 0}</strong>
          <small>of {plan?.minutes ?? 0} minutes</small>
        </div>
        <div>
          <span>Expected best offer</span>
          <strong className="num">{(plan?.expected ?? 0).toFixed(3)}</strong>
          <small>On the normalised value scale</small>
        </div>
        <div className="stataccent">
          <TrendingUp size={22} />
          <b>
            {lift > 0.005
              ? `${(lift * 100).toFixed(0)}% above ranking by value`
              : 'Matches a plain value ranking here'}
          </b>
          <small>Same budget, portfolio instead of top-N</small>
        </div>
      </section>

      {plan && plan.calibrated < 12 && (
        <section className="replay">
          <Target size={20} />
          <div>
            <b>The value model is still thin.</b>
            <p>
              {plan.calibrated} comparisons recorded. Until there are around a
              dozen, roles are ranked mostly on odds and cost rather than on
              what you actually want.
            </p>
          </div>
          <Link className="secondary" href="/preferences">
            Answer a few
          </Link>
        </section>
      )}

      <section className="import">
        <h2>Apply to these</h2>
        <p>
          Chosen by marginal gain per minute. Each row says why it earned the
          place, so a wrong call is arguable rather than opaque.
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
            These lost on gain per minute this week — usually because something
            already chosen covers the same outcome, or the cost is too high for
            what it adds.
          </p>
          {plan.rest.map((row) => (
            <Job key={row.id} row={row} />
          ))}
        </section>
      )}
      <footer>
        Relay / SyberLabs
        <span>Selection is the largest lever. This is it.</span>
      </footer>
    </main>
  );
}
