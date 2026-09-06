'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  createPageSession,
  postJson,
  runPageMutation,
  runPageSiblingReads,
} from '../../lib/page-session';
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
  const sessionRef = useRef(createPageSession());
  const applyExpired = useCallback(() => {
    setDrafts([]);
    setFacts([]);
    setBatches([]);
    setTrust({});
    setTrigger(null);
    setEdits({});
    setProposals({});
    setBasket([]);
    setBusy(false);
    setMessage('');
    setSignedOut(true);
  }, []);
  const refresh = useCallback(async () => {
    await runPageSiblingReads<
      {
        drafts: DraftRow[];
        batches: Batch[];
        trust: Record<string, Trust>;
        trigger: { reason: string; ids: string[] } | null;
        error?: string;
      },
      { facts: Fact[]; error?: string }
    >(
      {
        session: sessionRef.current,
        onExpired: applyExpired,
        setBusy,
        setMessage,
      },
      [() => fetch('/api/drafts'), () => fetch('/api/profile')],
      ['Unable to load drafts.', 'Unable to load profile.'],
      (draftBody, profileBody) => {
        setDrafts(draftBody.drafts);
        setBatches(draftBody.batches);
        setTrust(draftBody.trust);
        setTrigger(draftBody.trigger);
        setFacts(profileBody.facts);
      },
    );
  }, [applyExpired]);
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e: Error) => {
        if (sessionRef.current.expired) return;
        setMessage(e.message);
      });
  }, [refresh]);
  async function run(body: Record<string, unknown>, note: string) {
    return runPageMutation<{ error?: string; proposals?: string[] }>(
      {
        session: sessionRef.current,
        onExpired: applyExpired,
        setBusy,
        setMessage,
      },
      () => postJson('/api/drafts', body),
      'Unable to complete request.',
      { clearMessage: true, refresh, succeed: () => setMessage(note) },
    );
  }
  async function saveCorrection(id: string) {
    if (sessionRef.current.expired) return;
    const result = await run(
      {
        action: 'correct',
        id,
        corrected: edits[id],
      },
      'Correction saved. Confirm which parts should always apply.',
    );
    if (sessionRef.current.expired) return;
    if (result?.proposals)
      setProposals({
        ...proposals,
        [id]: result.proposals,
      });
  }
  function addRule(rule: string, scope = 'global') {
    if (sessionRef.current.expired) return;
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
  async function closeSession() {
    if (sessionRef.current.expired || !open) return;
    await run(
      { action: 'close-batch', id: open.id, rules: basket },
      `Session closed. ${basket.length} rules now apply to new drafts.`,
    );
    if (sessionRef.current.expired) return;
    setBasket([]);
    setEdits({});
    setProposals({});
  }
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
                    onClick={() => saveCorrection(d.id)}
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
                onClick={() => closeSession()}
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
