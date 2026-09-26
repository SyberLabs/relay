'use client';
import { ArrowRight } from 'lucide-react';
import { FirstJob } from './first-job';
import { RuntimeShell } from './runtime-shell';
import { RuntimeModals } from './runtime-modals';
import { useWorkspaceRuntime } from './workspace-runtime';
import { WorkspaceImportDock } from './workspace-import-dock';
import { WorkspaceJobPanel } from './workspace-job-panel';
import { WorkspaceHistoryDialog } from './workspace-history-dialog';

export default function Workspace() {
  const rt = useWorkspaceRuntime();
  const {
    action,
    addJobPrimary,
    applyExpired,
    acceptedExact,
    blocked,
    blocker,
    busy,
    closeHistory,
    confirmLeave,
    current,
    draft,
    editor,
    findMoreJobs,
    fit,
    historyOpen,
    inspectFreshnessGap,
    jobs,
    lead,
    loaded,
    message,
    modal,
    openAddJob,
    reviewKind,
    save,
    saveDecision,
    saveFirstJob,
    saveProfile,
    sessionRef,
    setEditor,
    setHistoryOpen,
    setModal,
    setSaveProfile,
    setShowAddJob,
    showAddJob,
    signedOut,
    sources,
    toolStatus,
  } = rt;
  return (
    <RuntimeShell
      addJobPrimary={addJobPrimary}
      historyDisabled={!current}
      historyOpen={historyOpen}
      importOpen={rt.showImport}
      importDisabled={signedOut || !loaded}
      lead={lead}
      live={busy}
      logLine={
        signedOut
          ? 'Sign in to load your runtime.'
          : busy
            ? 'Working…'
            : current
              ? `${current.name}.`
              : 'Runtime ready. Select an application.'
      }
      logTime={message ? new Date().toTimeString().slice(0, 8) : '--:--:--'}
      onAddJob={openAddJob}
      onHistory={() => {
        if (!current) return;
        if (historyOpen) closeHistory();
        else setHistoryOpen(true);
      }}
      onImport={findMoreJobs}
      onNavigate={confirmLeave}
      onProfile={() => setModal('profile')}
      onResearch={findMoreJobs}
      onTools={() => setModal('tools')}
      showAddJob={loaded && !signedOut && jobs.length > 0}
      stateKind={
        busy || reviewKind === 'sending' || reviewKind === 'ready_for_approval'
          ? 'live'
          : (reviewKind === 'disconnected' && !inspectFreshnessGap) ||
              reviewKind === 'uncertain'
            ? 'off'
            : 'idle'
      }
      stateText={
        busy
          ? 'Working'
          : signedOut
            ? 'Signed out'
            : inspectFreshnessGap &&
                (reviewKind === 'preparing' || reviewKind === 'disconnected')
              ? 'Checking latest changes'
              : reviewKind === 'ready_for_approval'
                ? 'Your agent is connected'
                : reviewKind === 'authorized'
                  ? 'Approved, waiting'
                  : reviewKind === 'sending'
                    ? 'Sending'
                    : reviewKind === 'disconnected'
                      ? 'Agent disconnected'
                      : reviewKind === 'submitted'
                        ? 'Submission recorded'
                        : reviewKind === 'uncertain'
                          ? 'Submission needs checking'
                          : reviewKind === 'not_sent'
                            ? 'Not sent'
                            : reviewKind === 'ended'
                              ? 'Application ended'
                              : 'Waiting for you'
      }
    >
      <main id="workspace-main">
        {message && (
          <div className="notice" aria-live="polite">
            {message}
          </div>
        )}
        {showAddJob && !signedOut && (
          <FirstJob
            busy={busy}
            jobs={jobs}
            onCancel={() => setShowAddJob(false)}
            onSave={saveFirstJob}
          />
        )}
        <WorkspaceImportDock rt={rt} />
        {signedOut ? (
          <section className="welcome" id="workspace-signin">
            <h2>Your private workspace</h2>
            <p>Sign in to load and save your application history.</p>
            {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
            <a
              className={action === 'sign_in' ? 'primary' : 'secondary'}
              href="/signin-with-chatgpt?return_to=/"
              target="_top"
            >
              Sign in with ChatGPT <ArrowRight size={16} />
            </a>
          </section>
        ) : !loaded ? (
          <div className="sy-loading" aria-busy="true">
            <p aria-live="polite">Opening your workspace…</p>
            <span aria-hidden="true" className="sy-skeleton mid" />
            <span aria-hidden="true" className="sy-skeleton" />
            <span aria-hidden="true" className="sy-skeleton short" />
          </div>
        ) : (
          <WorkspaceJobPanel rt={rt} />
        )}
        <WorkspaceHistoryDialog rt={rt} />
        <RuntimeModals
          acceptDisabled={
            blocked || acceptedExact || !draft.trim() || !!blocker.trim()
          }
          blockedAnswer={editor?.progressNote ?? ''}
          blockedNote=""
          blockedQuestion={current?.blocker || ''}
          draft={draft}
          fit={fit}
          job={current}
          onAccept={() => {
            setModal(null);
            save('Ready');
          }}
          onBlockedAnswer={(value) =>
            setEditor((ed) => (ed ? { ...ed, progressNote: value } : ed))
          }
          onBlockedDrop={() => {
            setModal(null);
            save('Skip');
          }}
          onBlockedSubmit={() => {
            void saveDecision(
              'answer',
              false,
              editor?.progressNote ?? '',
              saveProfile,
            ).then((ok) => {
              if (ok) setModal(null);
            });
          }}
          onClose={() => setModal(null)}
          onEdit={() => setModal(null)}
          onNavigate={confirmLeave}
          onSaveProfile={setSaveProfile}
          onSkip={() => {
            setModal(null);
            save('Skip');
          }}
          onUnauthorized={applyExpired}
          saveProfile={saveProfile}
          sessionRef={sessionRef}
          sources={sources.filter((s) => s.job_key === current?.job_key)}
          toolStatus={toolStatus}
          which={signedOut ? null : modal}
        />
      </main>
    </RuntimeShell>
  );
}
