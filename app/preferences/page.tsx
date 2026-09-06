'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Timer } from 'lucide-react';
import type { Posting, Weights } from '../../lib/utility';
import {
  beginPageWork,
  createPageSession,
  pageWorkIsLive,
  readAuthorizedJson,
} from '../../lib/page-session';
type Pair = { a: Posting; b: Posting };
type State = {
  weights: Weights;
  answered: number;
  minutes: number;
  pool: number;
  target: number;
  pair: Pair | null;
  error?: string;
};
function band(min: number | null, max: number | null) {
  if (!min && !max) return 'Compensation not published';
  const money = (n: number) => '$' + Math.round(n / 1000) + 'k';
  return max && min ? `${money(min)} – ${money(max)}` : money((max ?? min)!);
}
function Card({
  posting,
  onPick,
  disabled,
}: {
  posting: Posting;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <button className="choicecard" disabled={disabled} onClick={onPick}>
      <b>{posting.name}</b>
      <dl>
        <div>
          <dt>Pay</dt>
          <dd>{band(posting.comp_min, posting.comp_max)}</dd>
        </div>
        <div>
          <dt>Working</dt>
          <dd>{posting.remote || 'not stated'}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{posting.level || 'not stated'}</dd>
        </div>
      </dl>
      <span className="pick">Rather have this</span>
    </button>
  );
}
export default function Preferences() {
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [minutes, setMinutes] = useState(120),
    [signedOut, setSignedOut] = useState(false);
  const sessionRef = useRef(createPageSession());
  const applyExpired = useCallback(() => {
    setState(null);
    setMinutes(120);
    setBusy(false);
    setMessage('');
    setSignedOut(true);
  }, []);
  const refresh = useCallback(async () => {
    if (sessionRef.current.expired) return;
    const started = beginPageWork(sessionRef.current);
    const r = await fetch('/api/preferences');
    const reply = await readAuthorizedJson<State>(
      sessionRef.current,
      started,
      r,
      'Unable to load preferences.',
    );
    if (reply.kind === 'expired') {
      applyExpired();
      return;
    }
    if (reply.kind === 'ignore') return;
    if (reply.kind === 'error') throw Error(reply.error);
    if (!pageWorkIsLive(sessionRef.current, started)) return;
    setState(reply.body);
    setMinutes(reply.body.minutes);
  }, [applyExpired]);
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e: Error) => {
        if (sessionRef.current.expired) return;
        setMessage(e.message);
      });
  }, [refresh]);
  async function post(body: Record<string, unknown>, note = '') {
    if (sessionRef.current.expired) return;
    const started = beginPageWork(sessionRef.current);
    setBusy(true);
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const reply = await readAuthorizedJson<{ error?: string }>(
        sessionRef.current,
        started,
        r,
        'Unable to save.',
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
      setMessage(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      if (pageWorkIsLive(sessionRef.current, started)) setBusy(false);
    }
  }
  if (signedOut)
    return (
      <main className="productpage">
        <h1>Preferences</h1>
        <p className="lead">Sign in to set what a job is worth to you.</p>
        {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
        <a
          className="primary"
          href="/signin-with-chatgpt?return_to=/preferences"
          target="_top"
        >
          Sign in with ChatGPT
        </a>
      </main>
    );
  const answered = state?.answered ?? 0,
    target = state?.target ?? 12,
    ready = answered >= target;
  return (
    <main className="productpage">
      <Link className="backlink" href="/">
        <ArrowLeft size={15} /> Workspace
      </Link>
      <h1>Preferences</h1>
      <p className="lead">
        Pick the job you would rather have. Those choices set the weights used
        to rank roles on This week.
      </p>
      {message && (
        <div className="notice" aria-live="polite">
          {message}
        </div>
      )}
      <section className="stats">
        <div>
          <span>Comparisons made</span>
          <strong>
            {answered.toString().padStart(2, '0')}
            <small className="of">/{target}</small>
          </strong>
          <small>
            {ready ? 'Enough to rank your pool' : 'A few more sharpens it'}
          </small>
        </div>
        <div>
          <span>Postings to draw from</span>
          <strong>{(state?.pool ?? 0).toString().padStart(2, '0')}</strong>
          <small>Held in your workspace</small>
        </div>
        <div>
          <span>Weekly attention</span>
          <strong>{minutes}</strong>
          <small>Minutes the plan is sized to</small>
        </div>
      </section>

      {state?.pair ? (
        <section className="import">
          <h2>Which of these would you rather have?</h2>
          <p>
            Assume you would get either one. Pick the job you would actually
            take — there is no wrong answer, only your answer.
          </p>
          <div className="choicepair">
            <Card
              posting={state.pair.a}
              disabled={busy}
              onPick={() =>
                post(
                  {
                    action: 'choose',
                    winner: state.pair!.a.job_key,
                    loser: state.pair!.b.job_key,
                  },
                  'Recorded. The value model refits after every answer.',
                )
              }
            />
            <span className="versus">or</span>
            <Card
              posting={state.pair.b}
              disabled={busy}
              onPick={() =>
                post(
                  {
                    action: 'choose',
                    winner: state.pair!.b.job_key,
                    loser: state.pair!.a.job_key,
                  },
                  'Recorded. The value model refits after every answer.',
                )
              }
            />
          </div>
        </section>
      ) : (
        <section className="import">
          <h2>No comparison to offer</h2>
          <p className="empty">
            {(state?.pool ?? 0) < 2
              ? 'Import or pull some postings first — comparisons are made over real jobs, not invented ones.'
              : 'Every informative pair in the current pool has been asked. Pull more postings to keep refining.'}
          </p>
        </section>
      )}

      <section className="import">
        <h2>What the choices imply</h2>
        <p>
          Weights are shares of one whole, so they read as relative pull. A
          negative weight means you have been trading that attribute away.
        </p>
        {answered === 0 && (
          <p className="empty">
            No comparisons yet, so every posting scores the same.
          </p>
        )}
        {answered > 0 &&
          state &&
          Object.entries(state.weights).map(([name, value]) => (
            <div className="weightrow" key={name}>
              <span>{name}</span>
              <div className="track">
                <div
                  className={'fill ' + (value < 0 ? 'neg' : '')}
                  style={{ width: Math.abs(value) * 100 + '%' }}
                />
              </div>
              <b>
                {value >= 0 ? '+' : ''}
                {value.toFixed(2)}
              </b>
            </div>
          ))}
        {answered > 0 && (
          <div className="actions">
            <button
              className="textbutton"
              disabled={busy}
              onClick={() =>
                post(
                  { action: 'reset' },
                  'Choices cleared. The model refits from nothing.',
                )
              }
            >
              <RotateCcw size={14} /> Start over
            </button>
          </div>
        )}
      </section>

      <section className="import">
        <h2>
          <Timer size={18} /> Weekly attention budget
        </h2>
        <p>Minutes available for applications this week.</p>
        <div className="actions">
          <input
            aria-label="Minutes per week"
            className="grow"
            type="number"
            min={15}
            max={2400}
            step={15}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              post({ action: 'minutes', minutes }, 'Budget saved.')
            }
          >
            Save budget
          </button>
        </div>
      </section>
      <footer>Relay / SyberLabs</footer>
    </main>
  );
}
