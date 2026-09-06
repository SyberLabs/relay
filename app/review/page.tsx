'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Copy,
  GitMerge,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  factUsage,
  openingGroups,
  samenessPairs,
  type DraftRow,
  type Fact,
} from '../../lib/profile';
type Trust = {
  cluster: string;
  state: string;
  reviewed: number;
  edit: number;
};
type Batch = {
  id: string;
  reason: string;
  opened: string;
  closed: string | null;
  size: number;
  rules_added: number;
};
type PendingRule = { rule: string; scope: string };
export default function Review() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]),
    [facts, setFacts] = useState<Fact[]>([]),
    [batches, setBatches] = useState<Batch[]>([]),
    [trust, setTrust] = useState<Record<string, Trust>>({}),
    [trigger, setTrigger] = useState<{ reason: string; ids: string[] } | null>(
      null,
    ),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [proposals, setProposals] = useState<Record<string, string[]>>({}),
    [basket, setBasket] = useState<PendingRule[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [signedOut, setSignedOut] = useState(false);
  const refresh = useCallback(async () => {
    const [d, p] = await Promise.all([
      fetch('/api/drafts'),
      fetch('/api/profile'),
    ]);
    if (d.status === 401 || p.status === 401) return setSignedOut(true);
    const draftData = (await d.json()) as {
      drafts: DraftRow[];
      batches: Batch[];
      trust: Record<string, Trust>;
      trigger: { reason: string; ids: string[] } | null;
      error?: string;
    };
    const profileData = (await p.json()) as { facts: Fact[]; error?: string };
    if (!d.ok) throw Error(draftData.error);
    if (!p.ok) throw Error(profileData.error);
    setDrafts(draftData.drafts);
    setBatches(draftData.batches);
    setTrust(draftData.trust);
    setTrigger(draftData.trigger);
    setFacts(profileData.facts);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e: Error) => setMessage(e.message));
  }, [refresh]);
  async function run(body: Record<string, unknown>, note: string) {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as { error?: string; proposals?: string[] };
      if (!r.ok) throw Error(data.error);
      await refresh();
      setMessage(note);
      return data;
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Unable to complete request.',
      );
    } finally {
      setBusy(false);
    }
  }
  function addRule(rule: string, scope = 'global') {
    if (basket.some((r) => r.rule === rule && r.scope === scope)) return;
    setBasket([...basket, { rule, scope }]);
    setMessage('Rule staged. It applies when you close this review.');
  }
  const open = batches.find((b) => !b.closed),
    batch = drafts.filter((d) => open && d.batch === open.id),
    pending = drafts.filter((d) => d.verdict === 'Logged'),
    groups = openingGroups(batch),
    sameness = samenessPairs(batch),
    usage = factUsage(batch, facts),
    unreviewed = batch.filter((d) => d.verdict === 'Logged');
  if (signedOut)
    return (
      <main className="productpage">
        <h1>Review</h1>
        <p className="lead">Sign in to open your review sessions.</p>
        {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
        <a
          className="primary"
          href="/signin-with-chatgpt?return_to=/review"
          target="_top"
        >
          Sign in with ChatGPT
        </a>
      </main>
    );
  return (
    <main className="productpage">
      <Link className="backlink" href="/">
        <ArrowLeft size={15} /> Workspace
      </Link>
      <p className="eyebrow">REVIEW · CALIBRATE THE WRITER</p>
      <h1>Correct the writer, not the letter.</h1>
      <p className="lead">
        A review session is worth running only if it changes the profile. Fix a
        habit once here and the next batch is written without it.
      </p>
      {message && (
        <div className="notice" aria-live="polite">
          {message}
        </div>
      )}
      <section className="stats">
        <div>
          <span>Logged, unreviewed</span>
          <strong>{pending.length.toString().padStart(2, '0')}</strong>
          <small>Written autonomously</small>
        </div>
        <div>
          <span>In this session</span>
          <strong>{batch.length.toString().padStart(2, '0')}</strong>
          <small>{open ? open.reason : 'No session open'}</small>
        </div>
        <div>
          <span>Rules staged</span>
          <strong>{basket.length.toString().padStart(2, '0')}</strong>
          <small>Applied on close</small>
        </div>
        <div className="stataccent">
          <ShieldCheck size={22} />
          <b>Claims are pre-checked.</b>
          <small>Uncited claims never reach this queue.</small>
        </div>
      </section>
      {!open && (
        <section className="replay">
          <GitMerge size={20} />
          <div>
            <b>
              {trigger
                ? `Review due: ${trigger.reason}.`
                : 'No review due yet.'}
            </b>
            <p>
              {trigger
                ? `${pending.length} drafts are waiting. Opening a session groups them so one decision can fix a repeated habit.`
                : 'Drafts accumulate until an unseen role type, style drift, low agent confidence, or a full batch makes review worthwhile.'}
            </p>
          </div>
          <button
            className="secondary"
            disabled={busy || !trigger}
            onClick={() =>
              run({ action: 'open-batch' }, 'Review session open.')
            }
          >
            Open review session
          </button>
        </section>
      )}
      {open && (
        <>
          {sameness.length > 0 && (
            <section className="report warn">
              <b>
                <Copy size={16} /> {sameness.length} near-identical pair
                {sameness.length > 1 ? 's' : ''} in this batch
              </b>
              <p>
                Drafts this similar mean the profile is generating one letter
                repeatedly. Vary the content, not just the voice.
              </p>
            </section>
          )}
          {groups.length > 0 && (
            <section className="import">
              <h2>
                <Layers size={18} /> Repeated habits
              </h2>
              <p>
                Each row is one decision covering several drafts. This is where
                a session earns its time.
              </p>
              {groups.map((g) => (
                <article className="factrow" key={g.phrase}>
                  <b>&ldquo;{g.phrase}…&rdquo;</b>
                  <span className="badge">{g.ids.length} drafts</span>
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => addRule(`Do not open with "${g.phrase}".`)}
                    >
                      Stop opening this way
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
          {usage.length > 0 && (
            <section className="import">
              <h2>Facts leaned on most</h2>
              <p>
                A claim repeated across drafts is worth re-reading once here
                rather than in every letter.
              </p>
              {usage.slice(0, 8).map((u) => (
                <article className="factrow" key={u.fact.id}>
                  <b>{u.fact.claim}</b>
                  <span className="badge">{u.count} drafts</span>
                </article>
              ))}
            </section>
          )}
          <section className="import">
            <h2>Drafts ({unreviewed.length} unreviewed)</h2>
            {batch.map((d) => (
              <article className="draftrow" key={d.id}>
                <div className="drafthead">
                  <span className="badge">{d.cluster}</span>
                  <span className="badge">{d.verdict}</span>
                  {d.confidence === 'low' && (
                    <span className="badge warnbadge">agent unsure</span>
                  )}
                  <small>profile v{d.profile_version}</small>
                </div>
                <pre>{d.corrected || d.body}</pre>
                <textarea
                  aria-label={`Correction for draft ${d.id}`}
                  value={edits[d.id] ?? ''}
                  onChange={(e) =>
                    setEdits({ ...edits, [d.id]: e.target.value })
                  }
                  placeholder="Rewrite it the way you would have written it. Your edit becomes the style signal."
                />
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy || !edits[d.id]?.trim()}
                    onClick={async () => {
                      const result = (await run(
                        {
                          action: 'correct',
                          id: d.id,
                          corrected: edits[d.id],
                        },
                        'Correction saved. Confirm which parts should always apply.',
                      )) as { proposals?: string[] } | undefined;
                      if (result?.proposals)
                        setProposals({
                          ...proposals,
                          [d.id]: result.proposals,
                        });
                    }}
                  >
                    Save correction
                  </button>
                  <button
                    className="textbutton"
                    disabled={busy || d.verdict !== 'Logged'}
                    onClick={() =>
                      run(
                        { action: 'accept', id: d.id },
                        'Accepted as written.',
                      )
                    }
                  >
                    <Check size={15} /> Fine as written
                  </button>
                </div>
                {proposals[d.id]?.length > 0 && (
                  <div className="proposals">
                    <b>
                      <Sparkles size={15} /> Always, or just here?
                    </b>
                    {proposals[d.id].map((p) => (
                      <div className="actions" key={p}>
                        <span>{p}</span>
                        <button
                          className="secondary"
                          onClick={() => addRule(p)}
                        >
                          Always
                        </button>
                        <button
                          className="secondary"
                          onClick={() => addRule(p, d.cluster)}
                        >
                          Only {d.cluster}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
          <section className="import">
            <h2>Close the session</h2>
            {basket.length === 0 ? (
              <p className="empty">
                No rules staged. Closing now marks these drafts reviewed but
                teaches the writer nothing — the next batch repeats the same
                habits.
              </p>
            ) : (
              basket.map((r) => (
                <article className="factrow" key={r.scope + r.rule}>
                  <b>{r.rule}</b>
                  <span className="badge">{r.scope}</span>
                  <div className="actions">
                    <button
                      className="textbutton"
                      onClick={() => setBasket(basket.filter((x) => x !== r))}
                    >
                      Drop
                    </button>
                  </div>
                </article>
              ))
            )}
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  await run(
                    { action: 'close-batch', id: open.id, rules: basket },
                    `Session closed. ${basket.length} rules now apply to new drafts.`,
                  );
                  setBasket([]);
                  setEdits({});
                  setProposals({});
                }}
              >
                Close review and apply {basket.length} rule
                {basket.length === 1 ? '' : 's'}
              </button>
            </div>
          </section>
        </>
      )}
      <section className="import">
        <h2>Cluster autonomy</h2>
        <p>
          Autonomy is earned per role type. A graduated cluster places its
          drafts into the workspace unattended; it still never accepts or sends
          one. A correction or an expired fact returns it to full review.
        </p>
        {Object.values(trust).length === 0 && (
          <p className="empty">No drafts logged yet.</p>
        )}
        {Object.values(trust).map((t) => (
          <article className="factrow" key={t.cluster}>
            <b>{t.cluster}</b>
            <span className={'badge ' + (t.state === 'Graduated' ? 'new' : '')}>
              {t.state}
            </span>
            <small>
              {t.reviewed} reviewed · {Math.round(t.edit * 100)}% median edit
            </small>
          </article>
        ))}
      </section>
      <footer>
        Relay / SyberLabs
        <span>Review changes the writer, not just the text.</span>
      </footer>
    </main>
  );
}
