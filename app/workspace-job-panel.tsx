'use client';
import Link from 'next/link';
import { ArrowUpRight, Check, ArrowRight } from 'lucide-react';
import { inspectSendControl } from './inspect';
import { BlockerReview } from './blocker-review';
import { AgentSessionPanel } from './agent-session';
import { WorkbenchQueue } from './workbench-queue';
import { loadEditor, showsExactAcceptance } from '../lib/editor';
import {
  formatLocation,
  formatPay,
  sourceLabel,
} from '../lib/runtime';
import type { WorkspaceRuntime } from './workspace-runtime';

export function WorkspaceJobPanel({ rt }: { rt: WorkspaceRuntime }) {
  const {
    acceptedExact,
    action,
    applyExpired,
    blocked,
    blocker,
    busy,
    chooseJob,
    confirmLeave,
    connections,
    current,
    detailRef,
    draft,
    draftingPreference,
    editor,
    events,
    findMoreJobs,
    fit,
    historyNext,
    inspect,
    jobs,
    lanes,
    loadJobHistory,
    loadNext,
    loaded,
    named,
    openAddJob,
    protectedState,
    queued,
    reviewCopy,
    reviewKind,
    run,
    save,
    saveDecision,
    saveProgress,
    search,
    selected,
    sessionRef,
    setEditor,
    setModal,
    setSearch,
    signedOut,
    sources,
  } = rt;
  return (
          <div className="workbench">
            <WorkbenchQueue
              findDisabled={signedOut || !loaded}
              ledger={lanes.ledger}
              onChoose={chooseJob}
              onFindMore={findMoreJobs}
              onSearch={setSearch}
              search={search}
              selected={selected}
              waiting={queued}
            />
            <section
              className="review core"
              id="application-inspect"
              aria-label="Prepared application"
              ref={detailRef}
            >
              {current && named && reviewKind && reviewCopy ? (
                <>
                  <div className="job-head">
                    <div>
                      <h2 className="role" tabIndex={-1}>
                        {current.name}
                      </h2>
                      <div className="meta">
                        {current.company ||
                          named.org ||
                          sourceLabel(current.source, current.url)}
                        {' · '}
                        {formatLocation(current.location, current.remote)}
                        {' · '}
                        {formatPay(current.comp_min, current.comp_max)}
                      </div>
                    </div>
                    <span
                      className={
                        'badge' +
                        (reviewKind === 'ready_for_approval' ||
                        reviewKind === 'submitted'
                          ? ' ok'
                          : reviewKind === 'uncertain'
                            ? ' bad'
                            : ' warn')
                      }
                    >
                      {reviewCopy.title}
                    </span>
                    {current.url && (
                      <a href={current.url} target="_blank" rel="noreferrer">
                        Open employer posting <ArrowUpRight size={15} />
                      </a>
                    )}
                    <button
                      className="textbtn"
                      onClick={() => setModal('inspect')}
                      type="button"
                    >
                      Inspect what the agent wrote
                    </button>
                    {!protectedState && current.blocker.trim() ? (
                      <button
                        className="textbtn"
                        onClick={() => setModal('blocked')}
                        type="button"
                      >
                        Answer the open question
                      </button>
                    ) : null}
                  </div>
                  <div className="review-scroll">
                    {editor?.conflict && (
                      <div className="notice">
                        This record changed. Reload before saving.
                        <button
                          className="textbutton"
                          onClick={() => setEditor(loadEditor(current))}
                        >
                          Reload this record
                        </button>
                      </div>
                    )}
                    {inspect.review}
                    <AgentSessionPanel
                      key={current.id}
                      jobId={current.id}
                      jobName={current.name}
                      onInspect={() => setModal('inspect')}
                      sessionRef={sessionRef}
                      onExpired={applyExpired}
                    />
                  </div>
                  <footer className="foot">
                    <div className="foot-copy">
                      <p>{reviewCopy.title}</p>
                      <p className="why">{reviewCopy.detail}</p>
                    </div>
                    {inspectSendControl({
                      busy: busy || inspect.busy,
                      enabled: inspect.acceptEnabled,
                      onAccept: inspect.onAccept,
                    })}
                  </footer>
                  <details className="draft-tools">
                    <summary>Draft and notes</summary>
                    <BlockerReview
                      key={`blocker-${current.id}`}
                      blocker={current.blocker}
                      direction={current.drafting_direction}
                      preference={draftingPreference}
                      disabled={blocked}
                      dirty={
                        !!editor &&
                        (editor.draft !== editor.baseDraft ||
                          editor.blocker !== editor.baseBlocker)
                      }
                      answer={editor?.progressNote ?? ''}
                      onAnswer={(value) =>
                        setEditor((ed) =>
                          ed ? { ...ed, progressNote: value } : ed,
                        )
                      }
                      onDecision={saveDecision}
                    />
                    {showsExactAcceptance(current, editor) && (
                      <div className="notice">
                        This exact draft is accepted. It is not send permission.
                      </div>
                    )}
                    {protectedState && (
                      <div className="notice">
                        You can edit notes and follow-up drafts. Saving keeps
                        this job’s {current.status} status.
                      </div>
                    )}
                    <section className="draft-editor">
                      <h3>Saved draft</h3>
                      <p className="muted">
                        Accepting exact wording is not send permission.
                      </p>
                      <details className="review-notes">
                        <summary>Edit blocker or save a progress note</summary>
                        <label className="field">
                          Blocker or missing fact
                          <textarea
                            value={blocker}
                            onChange={(e) =>
                              setEditor((ed) =>
                                ed ? { ...ed, blocker: e.target.value } : ed,
                              )
                            }
                            placeholder="What needs to be resolved before accepting this draft?"
                            maxLength={4000}
                          />
                        </label>
                        <label className="field">
                          Progress note
                          <textarea
                            value={editor?.progressNote ?? ''}
                            onChange={(e) =>
                              setEditor((ed) =>
                                ed
                                  ? { ...ed, progressNote: e.target.value }
                                  : ed,
                              )
                            }
                            maxLength={4000}
                            placeholder="Completed work or a next action that does not prevent accepting the draft."
                          />
                        </label>
                        <div className="actions">
                          <button
                            className="secondary"
                            disabled={
                              blocked ||
                              (!editor?.progressNote.trim() &&
                                blocker === editor?.baseBlocker)
                            }
                            onClick={() => void saveProgress()}
                          >
                            Save progress only
                          </button>
                        </div>
                        <p className="muted">
                          Progress notes stay in history. They do not block
                          draft acceptance.
                        </p>
                      </details>
                      <label className="field">
                        Application answer or outreach draft
                        <textarea
                          className="draft"
                          value={draft}
                          onChange={(e) =>
                            setEditor((ed) =>
                              ed ? { ...ed, draft: e.target.value } : ed,
                            )
                          }
                          placeholder={
                            protectedState
                              ? 'Prepare a follow-up draft. Saving preserves your application status.'
                              : 'Write the exact text you want to review. Saving changes returns a draft to review.'
                          }
                        />
                      </label>
                      <p className="muted">
                        Check each claim against your evidence. Saving here does
                        not run the agent citation check.
                      </p>
                      {protectedState && (
                        <div className="actions sticky-actions">
                          <button
                            className="primary"
                            disabled={blocked}
                            onClick={() => save(current.status)}
                          >
                            Save notes and draft
                          </button>
                        </div>
                      )}
                      {!protectedState && (
                        <div className="actions sticky-actions">
                          <button
                            className="secondary"
                            disabled={blocked || acceptedExact}
                            onClick={() => save('Held')}
                          >
                            Save draft
                          </button>
                          <button
                            className="primary"
                            disabled={
                              blocked ||
                              acceptedExact ||
                              !draft.trim() ||
                              !!blocker.trim()
                            }
                            onClick={() => save('Ready')}
                          >
                            <Check size={16} />
                            Accept exact draft
                          </button>
                          <button
                            className="textbutton"
                            disabled={blocked}
                            onClick={() => save('Skip')}
                          >
                            Set aside
                          </button>
                        </div>
                      )}
                      <small className="muted">
                        Acceptance records your approval of these exact words.
                        Changed wording needs fresh acceptance. Nothing is sent.
                      </small>
                    </section>
                    {connections}
                    <details>
                      <summary>Evidence matches</summary>
                      <small className="muted">
                        {
                          'Heuristic word and number matches against your confirmed, unexpired facts. These do not assess your qualifications or change this job’s status.'
                        }
                      </small>
                      {fit?.reason === 'notes' && (
                        <p className="muted">
                          No required lines found in source notes. Import the
                          posting text as research before comparing.
                        </p>
                      )}
                      {fit?.reason === 'facts' && (
                        <p className="muted">
                          Confirm facts on{' '}
                          <Link href="/profile" onClick={confirmLeave}>
                            Your facts
                          </Link>{' '}
                          to compare them with this posting. Proposed facts are
                          not used. You can still draft and accept this job.
                        </p>
                      )}
                      {fit && fit.gates.length > 0 && (
                        <ul className="gates">
                          {fit.gates.map((gate) => (
                            <li key={gate.text}>
                              <span className="badge">
                                {gate.status === 'hit'
                                  ? 'Possible evidence'
                                  : gate.status === 'miss'
                                    ? 'No matching evidence found'
                                    : 'Not compared'}
                              </span>
                              {gate.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      {fit?.gates.some((gate) => gate.status === 'miss') && (
                        <small className="muted">
                          No match can mean missing evidence or different
                          wording. Review the requirement and your experience
                          before deciding.
                        </small>
                      )}
                    </details>
                    <details>
                      <summary>Source history</summary>
                      <small className="muted">
                        Imported source status is research evidence. Exact draft
                        acceptance is a local Relay decision.
                      </small>
                      {sources
                        .filter((s) => s.job_key === current.job_key)
                        .map((s) => (
                          <article className="source" key={s.id}>
                            <b>{s.name}</b>
                            <span className="badge">
                              Source reported: {s.status}
                            </span>
                            <p>{s.notes || 'No source notes recorded.'}</p>
                            {s.source_url.startsWith('obsidian:') && (
                              <small className="muted">
                                Obsidian note ·{' '}
                                {s.source_url.slice('obsidian:'.length)}
                              </small>
                            )}
                            {s.source_url.startsWith('https://') && (
                              <a
                                href={s.source_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Source record <ArrowUpRight size={13} />
                              </a>
                            )}
                          </article>
                        ))}
                    </details>
                    {events.filter((e) => e.job_id === current.id).length >
                      0 && (
                      <details>
                        <summary>Your review history</summary>
                        {events
                          .filter((e) => e.job_id === current.id)
                          .map((e) => (
                            <details className="source" key={e.id}>
                              <summary>
                                {e.kind} ·{' '}
                                {new Date(e.created).toLocaleString()}
                              </summary>
                              <pre>
                                {JSON.stringify(JSON.parse(e.detail), null, 2)}
                              </pre>
                            </details>
                          ))}
                        {historyNext[current.id] && (
                          <button
                            className="textbutton"
                            onClick={() =>
                              void loadJobHistory(
                                current.id,
                                historyNext[current.id],
                              )
                            }
                          >
                            Load earlier review history
                          </button>
                        )}
                      </details>
                    )}
                  </details>
                </>
              ) : (
                <div className="empty">
                  {jobs.length === 0 ? (
                    <>
                      <h2>No jobs yet</h2>
                      <p>
                        Add a posting with its role title and URL. Optional
                        notes are saved as research.
                      </p>
                      <div className="actions">
                        <button
                          className={
                            action === 'add_job' ? 'primary' : 'secondary'
                          }
                          onClick={openAddJob}
                          type="button"
                        >
                          Add job <ArrowRight size={16} />
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => run({ action: 'bootstrap' })}
                          type="button"
                        >
                          Explore example jobs
                        </button>
                      </div>
                      <small>
                        Example companies and records are fictional.
                      </small>
                    </>
                  ) : (
                    <>
                      <h2>Select a role</h2>
                      <p>
                        Select a job to continue its review. Adding or importing
                        is between jobs.
                      </p>
                      <button
                        className="btn btn-signal btn-sm"
                        disabled={!queued.length && !lanes.waiting.length}
                        onClick={loadNext}
                        type="button"
                      >
                        Load next application
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => run({ action: 'replay' })}
                        type="button"
                      >
                        Check examples
                      </button>
                    </>
                  )}
                  {connections}
                </div>
              )}
            </section>
          </div>
  );
}
