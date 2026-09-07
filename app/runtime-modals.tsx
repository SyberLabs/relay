'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ApplicationPolicy } from '../lib/application-automation';
import type { Gate } from '../lib/fit';
import { whyPicked } from '../lib/runtime';
import type { RelayToolStatus } from './agent-tools';
import type { WorkspaceSession } from '../lib/workspace-refresh';
import {
  emptyRuntimeModalPrivate,
  postRuntimeModalProfile,
  readRuntimeModalProfile,
  settleRuntimeModalProfileRead,
  type RuntimeModalProfile,
} from '../lib/runtime-modal-session';

export type RuntimeModal =
  | 'profile'
  | 'resume'
  | 'style'
  | 'tools'
  | 'inspect'
  | 'blocked'
  | null;

function ToolsPanel({
  toolStatus,
  policy,
  jobs,
  busy,
  onSaveLimits,
  onClose,
}: {
  toolStatus: RelayToolStatus;
  policy: ApplicationPolicy | null;
  jobs: { id: string; name: string; status: string }[];
  busy: boolean;
  onSaveLimits: (input: {
    maximum: number;
    review: string;
    enabled: boolean;
  }) => boolean | void | Promise<boolean | void>;
  onClose: () => void;
}) {
  const [maximum, setMaximum] = useState(policy?.maximum || 8);
  const [review, setReview] = useState(policy?.review || 'all');
  const [enabled, setEnabled] = useState(Boolean(policy?.enabled));
  return (
    <>
      <div className="sect">
        <h4>Connected work</h4>
        <div className="map">
          <div className="row">
            <span className="f">Simplify</span>
            <span className="v">Tracker CSV import. No account sync.</span>
            <span className="c">import</span>
          </div>
          <div className="row">
            <span className="f">Notion</span>
            <span className="v">
              Local CLI research import with your credentials.
            </span>
            <span className="c">cli</span>
          </div>
          <div className="row">
            <span className="f">Obsidian</span>
            <span className="v">
              Notes and version-bound draft files from your vault.
            </span>
            <span className="c">files</span>
          </div>
          <div className="row">
            <span className="f">WebMCP</span>
            <span className="v">
              {
                {
                  checking: 'Checking this browser…',
                  unavailable: 'This browser does not register tools',
                  registered: 'Tools registered in this tab',
                  failed: 'Registration failed in this tab',
                }[toolStatus]
              }
            </span>
            <span className={'c' + (toolStatus === 'registered' ? '' : ' low')}>
              {toolStatus}
            </span>
          </div>
        </div>
      </div>
      <div className="sect">
        <h4>Application limits</h4>
        <p className="hint">
          Autopilot uses this policy. It never sends an employer form from
          Relay. Agents still need a one-time permit. Review every application
          requires a human approval before begin. Automatic standard-field
          permission can authorize ordinary contact fields without that review.
        </p>
        <label className="field">
          Applications per policy
          <input
            aria-label="Applications per day"
            type="number"
            min={1}
            max={100}
            value={maximum}
            onChange={(e) => setMaximum(Number(e.target.value))}
          />
        </label>
        <label className="field">
          Approval setting
          <select
            aria-label="Approval setting"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          >
            <option value="all">Review every application</option>
            <option value="sensitive">
              Automatic for standard contact fields; review other questions
            </option>
          </select>
        </label>
        <label className="check">
          <input
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            type="checkbox"
          />
          Enable application execution for {jobs.length} saved job
          {jobs.length === 1 ? '' : 's'}
        </label>
        <button
          className="btn btn-sm btn-clear"
          disabled={busy}
          onClick={() => {
            void Promise.resolve(
              onSaveLimits({ maximum, review, enabled }),
            ).then((ok) => {
              if (ok) onClose();
            });
          }}
          type="button"
        >
          Save limits
        </button>
      </div>
    </>
  );
}

export function RuntimeModals({
  which,
  onClose,
  job,
  sources,
  fit,
  draft,
  onAccept,
  onSkip,
  onEdit,
  blockedQuestion,
  blockedNote,
  blockedAnswer,
  onBlockedAnswer,
  onBlockedSubmit,
  onBlockedDrop,
  remember,
  onRemember,
  toolStatus,
  policy,
  jobs,
  onSaveLimits,
  busy,
  acceptDisabled,
  sessionRef,
  onUnauthorized,
  onNavigate,
}: {
  which: RuntimeModal;
  onClose: () => void;
  job?: { name: string; status: string } | null;
  sources: { notes: string }[];
  fit: { gates: Gate[]; reason: string } | null;
  draft: string;
  onAccept: () => void;
  onSkip: () => void;
  onEdit: () => void;
  blockedQuestion: string;
  blockedNote: string;
  blockedAnswer: string;
  onBlockedAnswer: (value: string) => void;
  onBlockedSubmit: () => void;
  onBlockedDrop: () => void;
  remember: boolean;
  onRemember: (value: boolean) => void;
  toolStatus: RelayToolStatus;
  policy: ApplicationPolicy | null;
  jobs: { id: string; name: string; status: string }[];
  onSaveLimits: (input: {
    maximum: number;
    review: string;
    enabled: boolean;
  }) => boolean | void | Promise<boolean | void>;
  busy: boolean;
  acceptDisabled?: boolean;
  sessionRef: { current: WorkspaceSession };
  onUnauthorized: () => void;
  onNavigate: (event: { preventDefault: () => void }) => void;
}) {
  useEffect(() => {
    if (!which) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const node = document.querySelector<HTMLElement>(
      '.modal input, .modal textarea, .modal button.btn, .modal .x',
    );
    node?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [which, onClose]);
  if (!which) return null;
  return (
    <RuntimeModalDialog
      key={which}
      {...{
        which,
        onClose,
        job,
        sources,
        fit,
        draft,
        onAccept,
        onSkip,
        onEdit,
        blockedQuestion,
        blockedNote,
        blockedAnswer,
        onBlockedAnswer,
        onBlockedSubmit,
        onBlockedDrop,
        remember,
        onRemember,
        toolStatus,
        policy,
        jobs,
        onSaveLimits,
        busy,
        acceptDisabled,
        sessionRef,
        onUnauthorized,
        onNavigate,
      }}
    />
  );
}

function RuntimeModalDialog({
  which,
  onClose,
  job,
  sources,
  fit,
  draft,
  onAccept,
  onSkip,
  onEdit,
  blockedQuestion,
  blockedNote,
  blockedAnswer,
  onBlockedAnswer,
  onBlockedSubmit,
  onBlockedDrop,
  remember,
  onRemember,
  toolStatus,
  policy,
  jobs,
  onSaveLimits,
  busy,
  acceptDisabled,
  sessionRef,
  onUnauthorized,
  onNavigate,
}: {
  which: Exclude<RuntimeModal, null>;
  onClose: () => void;
  job?: { name: string; status: string } | null;
  sources: { notes: string }[];
  fit: { gates: Gate[]; reason: string } | null;
  draft: string;
  onAccept: () => void;
  onSkip: () => void;
  onEdit: () => void;
  blockedQuestion: string;
  blockedNote: string;
  blockedAnswer: string;
  onBlockedAnswer: (value: string) => void;
  onBlockedSubmit: () => void;
  onBlockedDrop: () => void;
  remember: boolean;
  onRemember: (value: boolean) => void;
  toolStatus: RelayToolStatus;
  policy: ApplicationPolicy | null;
  jobs: { id: string; name: string; status: string }[];
  onSaveLimits: (input: {
    maximum: number;
    review: string;
    enabled: boolean;
  }) => boolean | void | Promise<boolean | void>;
  busy: boolean;
  acceptDisabled?: boolean;
  sessionRef: { current: WorkspaceSession };
  onUnauthorized: () => void;
  onNavigate: (event: { preventDefault: () => void }) => void;
}) {
  const [profile, setProfile] = useState<RuntimeModalProfile | null>(null);
  const [resume, setResume] = useState('');
  const [candidates, setCandidates] = useState<
    { claim: string; evidence: string; tag: string }[]
  >([]);
  const [rule, setRule] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (which === 'inspect' || which === 'blocked' || which === 'tools') return;
    let cancelled = false;
    void readRuntimeModalProfile(sessionRef.current).then((outcome) => {
      const next = settleRuntimeModalProfileRead(
        outcome,
        cancelled,
        onUnauthorized,
      );
      if (next.type === 'stop') return;
      if (next.type === 'error') {
        setNote(next.error);
        return;
      }
      if (next.switched) {
        setResume('');
        setCandidates([]);
        setRule('');
        setNote('');
      }
      setProfile(next.body);
    });
    return () => {
      cancelled = true;
    };
  }, [which, onUnauthorized, sessionRef]);
  const verified = profile?.facts?.filter((f) => f.status === 'Verified') ?? [];
  const proposed = profile?.facts?.filter((f) => f.status === 'Proposed') ?? [];
  function clearPrivate() {
    const empty = emptyRuntimeModalPrivate();
    setProfile(empty.profile);
    setResume(empty.resume);
    setCandidates(empty.candidates);
    setRule(empty.rule);
    setNote(empty.note);
  }
  async function extract() {
    setNote('');
    const outcome = await postRuntimeModalProfile<{
      candidates?: { claim: string; evidence: string; tag: string }[];
      error?: string;
    }>(sessionRef.current, { action: 'extract', text: resume });
    if (outcome.type === 'expire') {
      clearPrivate();
      onUnauthorized();
      return;
    }
    if (outcome.type === 'skip' || outcome.type === 'ignore') return;
    if (outcome.type === 'error') {
      setNote(outcome.error || 'Unable to read resume.');
      return;
    }
    if (outcome.switched) {
      setResume('');
      setCandidates([]);
      setRule('');
      setNote('');
    }
    setCandidates(outcome.body.candidates || []);
    setNote(
      `${outcome.body.candidates?.length ?? 0} candidate facts found. Confirm them on Your facts before agents can cite them.`,
    );
  }
  async function propose() {
    const outcome = await postRuntimeModalProfile<{ error?: string }>(
      sessionRef.current,
      { action: 'propose', facts: candidates },
    );
    if (outcome.type === 'expire') {
      clearPrivate();
      onUnauthorized();
      return;
    }
    if (outcome.type === 'skip' || outcome.type === 'ignore') return;
    if (outcome.type === 'error') {
      setNote(outcome.error || 'Unable to add facts.');
      return;
    }
    setCandidates([]);
    setResume('');
    setNote('Facts added as proposed. Confirm each one on Your facts.');
  }
  async function addRule() {
    const text = rule.trim();
    if (!text) return;
    const outcome = await postRuntimeModalProfile<{ error?: string }>(
      sessionRef.current,
      { action: 'rule-add', rule: text, scope: 'global' },
    );
    if (outcome.type === 'expire') {
      clearPrivate();
      onUnauthorized();
      return;
    }
    if (outcome.type === 'skip' || outcome.type === 'ignore') return;
    if (outcome.type === 'error') {
      setNote(outcome.error || 'Unable to save style rule.');
      return;
    }
    setRule('');
    setProfile((p) =>
      p
        ? {
            ...p,
            rules: [
              ...(p.rules || []),
              { id: 'local', rule: text, scope: 'global' },
            ],
          }
        : p,
    );
    setNote('Style rule saved. Drafts still need your exact acceptance.');
  }
  const title =
    which === 'profile'
      ? 'Profile'
      : which === 'resume'
        ? 'Resume'
        : which === 'style'
          ? 'Style kit'
          : which === 'tools'
            ? 'Tools'
            : which === 'inspect'
              ? job?.name || 'Inspect'
              : 'The agent needs an answer';
  const tag =
    which === 'profile'
      ? 'used to fill drafts'
      : which === 'resume'
        ? 'extract only proposes'
        : which === 'style'
          ? 'how the agent writes as you'
          : which === 'tools'
            ? 'where the agent can act'
            : which === 'inspect'
              ? job?.status || ''
              : 'paused until you answer';
  return (
    <dialog
      className="veil on"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      open
      aria-labelledby="runtime-modal-title"
    >
      <div className="modal">
        <header>
          <h3 id="runtime-modal-title">{title}</h3>
          <span className="tag">{tag}</span>
          <button
            aria-label="Close"
            className="x"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="scroll">
          {which === 'profile' && (
            <>
              <div className="sect">
                <h4>Confirmed facts</h4>
                {verified.length ? (
                  <dl className="kv">
                    {verified.slice(0, 12).map((fact) => (
                      <div key={fact.id} className="contents">
                        <dt>{fact.tag}</dt>
                        <dd>{fact.claim}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="hint">
                    No confirmed facts yet. Extract a resume or add them on Your
                    facts.
                  </p>
                )}
              </div>
              <div className="sect">
                <h4>Awaiting your check</h4>
                <p className="hint">
                  {proposed.length
                    ? `${proposed.length} proposed line(s). Confirm accuracy yourself; Relay does not independently verify facts.`
                    : 'Nothing waiting.'}
                </p>
                <Link href="/profile" onClick={onNavigate}>
                  Open Your facts
                </Link>
              </div>
            </>
          )}
          {which === 'resume' && (
            <>
              <div className="sect">
                <h4>Base ledger</h4>
                <p className="hint">
                  {profile
                    ? `${profile.usable ?? 0} confirmed, unexpired fact(s) available for citations.`
                    : 'Loading…'}
                </p>
              </div>
              <div className="sect">
                <h4>Paste a new base</h4>
                <p className="hint">
                  Extraction proposes lines only. It cannot invent a role or
                  grant approval.
                </p>
                <label className="field">
                  Resume text
                  <textarea
                    aria-label="Resume text"
                    value={resume}
                    onChange={(e) => setResume(e.target.value)}
                    placeholder="Paste resume text…"
                  />
                </label>
                <button
                  className="btn btn-sm"
                  disabled={!resume.trim()}
                  onClick={() => void extract()}
                  type="button"
                >
                  Extract candidate facts
                </button>
                {candidates.length > 0 && (
                  <>
                    <div className="map">
                      {candidates.slice(0, 8).map((c) => (
                        <div className="row" key={c.claim}>
                          <span className="f">{c.tag}</span>
                          <span className="v">{c.claim}</span>
                          <span className="c low">proposed</span>
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn btn-sm btn-clear"
                      onClick={() => void propose()}
                      type="button"
                    >
                      Add {candidates.length} to ledger
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {which === 'style' && (
            <>
              <div className="sect">
                <h4>Never write</h4>
                <div className="chips">
                  {(profile?.rules ?? []).map((item) => (
                    <span className="chip" key={item.id}>
                      {item.rule}
                    </span>
                  ))}
                  {!profile?.rules?.length && (
                    <p className="hint">
                      No style rules yet. Add a phrase the agent must not use.
                    </p>
                  )}
                </div>
              </div>
              <div className="sect">
                <label className="field">
                  Add a style rule
                  <input
                    aria-label="New style rule"
                    type="text"
                    value={rule}
                    onChange={(e) => setRule(e.target.value)}
                    placeholder="passionate about"
                  />
                </label>
                <button
                  className="btn btn-sm btn-clear"
                  disabled={!rule.trim()}
                  onClick={() => void addRule()}
                  type="button"
                >
                  Save style kit
                </button>
              </div>
            </>
          )}
          {which === 'tools' && (
            <ToolsPanel
              busy={busy}
              jobs={jobs}
              key={policy?.version ?? 0}
              onClose={onClose}
              onSaveLimits={onSaveLimits}
              policy={policy}
              toolStatus={toolStatus}
            />
          )}
          {which === 'inspect' && (
            <>
              <div className="sect">
                <h4>Why this job is in core</h4>
                <div className="quote">{whyPicked(sources, fit)}</div>
                <p className="hint" style={{ paddingLeft: 0, marginTop: 8 }}>
                  Fit is a heuristic word and number match, not a qualification
                  score.
                </p>
              </div>
              <div className="sect">
                <h4>What changed in the saved draft</h4>
                <div className="map">
                  <div className="row">
                    <span className="f">wording</span>
                    <span className="v">
                      {draft.trim()
                        ? 'The visible draft is what you or an assistant wrote.'
                        : 'No draft yet.'}
                    </span>
                    <span className={'c' + (draft.trim() ? '' : ' low')}>
                      {draft.trim() ? 'on file' : 'empty'}
                    </span>
                  </div>
                  <div className="row">
                    <span className="f">everything else</span>
                    <span className="v">
                      Relay does not invent resume bullets or employer fields.
                    </span>
                    <span className="c">kept</span>
                  </div>
                </div>
              </div>
              <div className="sect">
                <h4>Draft</h4>
                <div className="doc">
                  {draft.trim() || 'No draft on this job yet.'}
                </div>
              </div>
              {fit && fit.gates.length > 0 && (
                <div className="sect">
                  <h4>Evidence matches</h4>
                  <div className="map">
                    {fit.gates.map((gate) => (
                      <div className="row" key={gate.text}>
                        <span className="f">
                          {gate.status === 'hit'
                            ? 'possible'
                            : gate.status === 'miss'
                              ? 'no match'
                              : 'skipped'}
                        </span>
                        <span className="v">{gate.text}</span>
                        <span
                          className={
                            'c' + (gate.status === 'hit' ? '' : ' low')
                          }
                        >
                          {gate.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {which === 'blocked' && (
            <>
              <div className="sect">
                <h4>The form asked</h4>
                <div className="quote">{blockedQuestion}</div>
                {blockedNote ? (
                  <p className="hint" style={{ paddingLeft: 0, marginTop: 8 }}>
                    {blockedNote}
                  </p>
                ) : null}
              </div>
              <div className="sect">
                <label className="field">
                  Your answer
                  <input
                    aria-label="Your answer"
                    id="runtime-block-answer"
                    onChange={(e) => onBlockedAnswer(e.target.value)}
                    placeholder="Type here"
                    type="text"
                    value={blockedAnswer}
                  />
                </label>
                <label className="check">
                  <input
                    checked={remember}
                    onChange={(e) => onRemember(e.target.checked)}
                    type="checkbox"
                  />
                  Save this as a progress note. Confirm facts separately on Your
                  facts if the agent should reuse them.
                </label>
              </div>
              <div className="sect">
                <h4>Where it stopped</h4>
                <div className="map">
                  <div className="row">
                    <span className="f">draft</span>
                    <span className="v">
                      {draft.trim()
                        ? 'Wording is on file in Relay. It still needs your exact acceptance.'
                        : 'No draft on file yet.'}
                    </span>
                    <span className={'c' + (draft.trim() ? '' : ' low')}>
                      {draft.trim() ? 'on file' : 'empty'}
                    </span>
                  </div>
                  <div className="row">
                    <span className="f">question</span>
                    <span className="v">
                      Waiting on your answer. The agent does not guess.
                    </span>
                    <span className="c low">paused</span>
                  </div>
                  <div className="row">
                    <span className="f">send</span>
                    <span className="v">
                      Relay does not POST to an employer. Sending stays on
                      Applications with a permit.
                    </span>
                    <span className="c low">not sent</span>
                  </div>
                </div>
              </div>
            </>
          )}
          {note ? <p className="hint">{note}</p> : null}
        </div>
        {which === 'inspect' ? (
          <footer>
            <button className="btn btn-sm" onClick={onEdit} type="button">
              Edit the draft
            </button>
            <button
              className="btn btn-sm btn-stop"
              onClick={onSkip}
              type="button"
            >
              Skip this one
            </button>
            <button
              className="btn btn-sm btn-clear"
              disabled={acceptDisabled}
              onClick={onAccept}
              type="button"
            >
              Accept exact draft
            </button>
          </footer>
        ) : which === 'blocked' ? (
          <footer>
            <button
              className="btn btn-sm"
              onClick={onBlockedDrop}
              type="button"
            >
              Drop this application
            </button>
            <button
              className="btn btn-sm btn-signal"
              onClick={onBlockedSubmit}
              type="button"
            >
              Answer and continue
            </button>
          </footer>
        ) : (
          <footer>
            <button className="btn btn-sm" onClick={onClose} type="button">
              Done
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
