'use client';
import { ctxTally } from '../lib/runtime';
import type { WorkspaceRuntime } from './workspace-runtime';

export function WorkspaceHistoryDialog({ rt }: { rt: WorkspaceRuntime }) {
  const {
    closeHistory,
    current,
    events,
    facts,
    historyDialogRef,
    historyOpen,
    styleCount,
  } = rt;
  return (
    <>
        {historyOpen && current ? (
          <dialog
            ref={historyDialogRef}
            aria-labelledby="history-title"
            className="veil on"
            onCancel={(event) => {
              event.preventDefault();
              closeHistory();
            }}
          >
            <div className="modal">
              <header>
                <h2 id="history-title" tabIndex={-1}>
                  History
                </h2>
                <button
                  aria-label="Close"
                  className="x"
                  onClick={closeHistory}
                  type="button"
                >
                  ×
                </button>
              </header>
              <div className="scroll">
                <p className="hint">{ctxTally(facts.length, styleCount)}</p>
                {events.filter((e) => e.job_id === current.id).length ? (
                  events
                    .filter((e) => e.job_id === current.id)
                    .map((e) => (
                      <p key={e.id}>
                        {e.kind} · {new Date(e.created).toLocaleString()}
                      </p>
                    ))
                ) : (
                  <p className="hint">No review history for this job yet.</p>
                )}
              </div>
              <footer>
                <button
                  className="btn btn-sm"
                  onClick={closeHistory}
                  type="button"
                >
                  Done
                </button>
              </footer>
            </div>
          </dialog>
        ) : null}
    </>
  );
}
