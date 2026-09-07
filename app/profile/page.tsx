'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  beginPageWork,
  createPageSession,
  pageWorkIsLive,
  readAuthorizedJson,
} from '../../lib/page-session';
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react';
import { ProductShell } from '../shell';
type Fact = {
  id: string;
  claim: string;
  evidence: string;
  tag: string;
  status: string;
  verified: string | null;
  expires: string | null;
};
type Rule = { id: string; rule: string; scope: string };
type Candidate = { claim: string; evidence: string; tag: string };
export default function Profile() {
  const [facts, setFacts] = useState<Fact[]>([]),
    [rules, setRules] = useState<Rule[]>([]),
    [version, setVersion] = useState(1),
    [usable, setUsable] = useState(0),
    [resume, setResume] = useState(''),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [chosen, setChosen] = useState<Set<number>>(new Set()),
    [expiry, setExpiry] = useState<Record<string, string>>({}),
    [rule, setRule] = useState(''),
    [scope, setScope] = useState('global'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [signedOut, setSignedOut] = useState(false);
  const sessionRef = useRef(createPageSession());
  const applyExpired = useCallback(() => {
    setFacts([]);
    setRules([]);
    setVersion(1);
    setUsable(0);
    setResume('');
    setCandidates([]);
    setChosen(new Set());
    setExpiry({});
    setRule('');
    setScope('global');
    setBusy(false);
    setMessage('');
    setSignedOut(true);
  }, []);
  const refresh = useCallback(async () => {
    if (sessionRef.current.expired) return;
    const started = beginPageWork(sessionRef.current);
    const r = await fetch('/api/profile');
    const reply = await readAuthorizedJson<{
      facts: Fact[];
      rules: Rule[];
      version: number;
      usable: number;
      error?: string;
    }>(sessionRef.current, started, r, 'Unable to load profile.');
    if (reply.kind === 'expired') {
      applyExpired();
      return;
    }
    if (reply.kind === 'ignore') return;
    if (reply.kind === 'error') throw Error(reply.error);
    if (!pageWorkIsLive(sessionRef.current, started)) return;
    setFacts(reply.body.facts);
    setRules(reply.body.rules);
    setVersion(reply.body.version);
    setUsable(reply.body.usable);
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
    if (sessionRef.current.expired) return;
    const started = beginPageWork(sessionRef.current);
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const reply = await readAuthorizedJson<{ error?: string }>(
        sessionRef.current,
        started,
        r,
        'Unable to complete request.',
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
      return reply.body;
    } catch (e) {
      if (!pageWorkIsLive(sessionRef.current, started)) return;
      setMessage(
        e instanceof Error ? e.message : 'Unable to complete request.',
      );
    } finally {
      if (pageWorkIsLive(sessionRef.current, started)) setBusy(false);
    }
  }
  async function extract() {
    if (sessionRef.current.expired) return;
    const started = beginPageWork(sessionRef.current);
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract', text: resume }),
      });
      const reply = await readAuthorizedJson<{
        candidates?: Candidate[];
        error?: string;
      }>(sessionRef.current, started, r, 'Unable to read resume.');
      if (reply.kind === 'expired') {
        applyExpired();
        return;
      }
      if (reply.kind === 'ignore') return;
      if (reply.kind === 'error') throw Error(reply.error);
      if (!pageWorkIsLive(sessionRef.current, started)) return;
      const next = reply.body.candidates!;
      setCandidates(next);
      setChosen(new Set(next.map((_, i) => i)));
      setMessage(
        `${next.length} candidate facts found. Add the lines you want to keep, then confirm each one.`,
      );
    } catch (e) {
      if (!pageWorkIsLive(sessionRef.current, started)) return;
      setMessage(e instanceof Error ? e.message : 'Unable to read resume.');
    } finally {
      if (pageWorkIsLive(sessionRef.current, started)) setBusy(false);
    }
  }
  const proposed = facts.filter((f) => f.status === 'Proposed'),
    verified = facts.filter((f) => f.status === 'Verified');
  if (signedOut)
    return (
      <ProductShell current="profile">
        <h1>Your profile</h1>
        <p className="lead">Sign in to load your fact ledger and style card.</p>
        {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
        <a
          className="primary"
          href="/signin-with-chatgpt?return_to=/profile"
          target="_top"
        >
          Sign in with ChatGPT
        </a>
      </ProductShell>
    );
  return (
    <ProductShell current="profile">
      <Link className="backlink" href="/">
        <ArrowLeft size={15} /> Workspace
      </Link>
      <h1>Your profile</h1>
      <p className="lead">
        Save candidate facts for reuse and confirm their accuracy yourself.
        Relay records your confirmation; it does not independently verify facts.
      </p>
      <section className="stats">
        <div>
          <span>Confirmed and unexpired</span>
          <strong>{usable.toString().padStart(2, '0')}</strong>
          <small>Available for agent citations</small>
        </div>
        <div>
          <span>Awaiting your check</span>
          <strong>{proposed.length.toString().padStart(2, '0')}</strong>
          <small>Extracted, not yet usable</small>
        </div>
        <div>
          <span>Style rules</span>
          <strong>{rules.length.toString().padStart(2, '0')}</strong>
          <small>Learned from review</small>
        </div>
        <div>
          <span>Profile version</span>
          <strong>{version.toString().padStart(2, '0')}</strong>
          <small>Recorded on agent draft logs</small>
        </div>
      </section>
      {message && (
        <div className="notice" aria-live="polite">
          {message}
        </div>
      )}
      <section className="import">
        <h2>
          <FileText size={18} /> Seed the ledger from a resume
        </h2>
        <p>
          Extraction proposes candidate lines only. Check each line before
          saving it to your ledger.
        </p>
        <textarea
          aria-label="Resume text"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder="Paste your resume text, including the experience and education sections…"
        />
        <div className="actions">
          <button
            className="secondary"
            disabled={busy || !resume.trim()}
            onClick={extract}
          >
            Extract candidate facts
          </button>
          {candidates.length > 0 && (
            <button
              className="primary"
              disabled={busy || !chosen.size}
              onClick={async () => {
                await run(
                  {
                    action: 'propose',
                    facts: candidates.filter((_, i) => chosen.has(i)),
                  },
                  `${chosen.size} facts added. Confirm each one before the agent can cite it.`,
                );
                if (sessionRef.current.expired) return;
                setCandidates([]);
                setResume('');
              }}
            >
              Add {chosen.size} to ledger
            </button>
          )}
        </div>
        {candidates.map((c, i) => (
          <label className="checkrow" key={i}>
            <input
              type="checkbox"
              checked={chosen.has(i)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(i);
                else next.delete(i);
                setChosen(next);
              }}
            />
            <span>
              {c.claim}
              <small>
                {c.tag} · {c.evidence}
              </small>
            </span>
          </label>
        ))}
      </section>
      {proposed.length > 0 && (
        <section className="import">
          <h2>
            <CircleAlert size={18} /> Confirm before use ({proposed.length})
          </h2>
          <p>
            Check the wording and evidence before confirming. Agent draft logs
            require confirmed, unexpired citations. Add an expiry for a current
            title or a headcount.
          </p>
          {proposed.map((f) => (
            <article className="factrow" key={f.id}>
              <b>{f.claim}</b>
              <span className="badge">{f.tag}</span>
              <small>{f.evidence}</small>
              <div className="actions">
                <input
                  aria-label={`Expiry for ${f.claim}`}
                  type="date"
                  value={expiry[f.id] || ''}
                  onChange={(e) =>
                    setExpiry({ ...expiry, [f.id]: e.target.value })
                  }
                />
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(
                      {
                        action: 'verify',
                        id: f.id,
                        expires: expiry[f.id] || null,
                      },
                      'Confirmed by you. The agent may now cite this fact.',
                    )
                  }
                >
                  <BadgeCheck size={15} /> Confirm fact
                </button>
                <button
                  className="textbutton"
                  disabled={busy}
                  onClick={() =>
                    run({ action: 'retire', id: f.id }, 'Fact retired.')
                  }
                >
                  Discard
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      <section className="import">
        <h2>
          <BadgeCheck size={18} /> Confirmed by you ({verified.length})
        </h2>
        {verified.length === 0 && (
          <p className="empty">
            No confirmed facts yet. Add candidate facts above, then check their
            wording and evidence.
          </p>
        )}
        {verified.map((f) => (
          <article className="factrow" key={f.id}>
            <b>{f.claim}</b>
            <span className="badge">{f.tag}</span>
            <small>
              {f.evidence}
              {f.expires
                ? ` · expires ${new Date(f.expires).toLocaleDateString()}`
                : ' · no expiry'}
            </small>
            <div className="actions">
              <button
                className="textbutton"
                disabled={busy}
                onClick={() =>
                  run(
                    { action: 'retire', id: f.id },
                    'Fact retired. New agent draft logs cannot cite it.',
                  )
                }
              >
                <Trash2 size={14} /> Retire
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="import">
        <h2>Style card ({rules.length})</h2>
        <p>
          Rules are usually added during a review session rather than typed
          here. Scope a rule to a role cluster when it should not apply to every
          application.
        </p>
        {rules.map((r) => (
          <article className="factrow" key={r.id}>
            <b>{r.rule}</b>
            <span className="badge">{r.scope}</span>
            <div className="actions">
              <button
                className="textbutton"
                disabled={busy}
                onClick={() =>
                  run({ action: 'rule-remove', id: r.id }, 'Rule removed.')
                }
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </article>
        ))}
        <div className="actions">
          <input
            aria-label="New style rule"
            className="grow"
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            placeholder="Keep the opening paragraph under two sentences."
          />
          <input
            aria-label="Rule scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="global"
          />
          <button
            className="secondary"
            disabled={busy || !rule.trim()}
            onClick={async () => {
              await run(
                { action: 'rule-add', rule, scope: scope || 'global' },
                'Rule added to the style card.',
              );
              if (sessionRef.current.expired) return;
              setRule('');
            }}
          >
            <Plus size={15} /> Add rule
          </button>
        </div>
      </section>
      <footer>Relay / SyberLabs</footer>
    </ProductShell>
  );
}
