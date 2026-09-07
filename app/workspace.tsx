'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { jobKey, validateRows, type SourceRow } from '../lib/domain';
import { firstJobShouldSelectSaved } from '../lib/first-job';
import { isTerminal } from '../lib/outcomes';
import { type Fact } from '../lib/profile';
import { assessJob } from '../lib/fit';
import { useRelayTools } from './agent-tools';
import { Connections } from './connections';
import { FirstJob } from './first-job';
import { TrackerImport } from './tracker-import';
import { AppShell } from './shell';
import {
  isQueueFilter,
  queueFromSearch,
  queueHref,
  queueTitle,
  type QueueFilter,
} from '../lib/nav';
import {
  importTabButtonId,
  importTabFromKey,
  type ImportTab,
} from '../lib/import-tabs';
import {
  acknowledgeSave,
  applyLoadedDraft,
  canSave,
  editorIsDirty,
  jobQueueHint,
  keepEditorOnReselect,
  loadEditor,
  showsExactAcceptance,
  type Editor,
  type SaveSnapshot,
} from '../lib/editor';
import {
  beginMutation,
  beginRefresh,
  createWorkspaceSession,
  editorForJobs,
  expiredPrivateWorkspace,
  expireSession,
  mutationIsLive,
  processMutation,
  processRefresh,
  refreshIsLive,
} from '../lib/workspace-refresh';
import { mergeReviewEvents } from '../lib/workspace-events';
import {
  headerAddJobIsPrimary,
  loopStepLead,
  primaryAction,
  stageLead,
} from '../lib/workspace-stage';
import {
  ArrowUpRight,
  Search,
  Check,
  GitMerge,
  ArrowRight,
  BriefcaseBusiness,
  Upload,
  ChevronRight,
} from 'lucide-react';
type Job = {
  id: string;
  job_key: string;
  name: string;
  url: string | null;
  status: string;
  blocker: string;
  draft: string;
  accepted_draft: string | null;
  version: number;
};
type Source = {
  id: string;
  job_key: string;
  name: string;
  notes: string;
  status: string;
  source_url: string;
};
type ReviewEvent = {
  id: string;
  job_id: string;
  kind: string;
  created: string;
  detail: string;
};
type Report = {
  new: number;
  known: number;
  submitted: number;
  items: { name: string; kind: string; key: string }[];
};
export default function Workspace() {
  const [jobs, setJobs] = useState<Job[]>([]),
    [sources, setSources] = useState<Source[]>([]),
    [events, setEvents] = useState<ReviewEvent[]>([]),
    [facts, setFacts] = useState<Fact[]>([]),
    [editor, setEditor] = useState<Editor | null>(null),
    [filter, setFilter] = useState<QueueFilter>(() =>
      typeof window === 'undefined'
        ? 'Held'
        : queueFromSearch(window.location.search),
    ),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [signedOut, setSignedOut] = useState(false),
    [loaded, setLoaded] = useState(false),
    [report, setReport] = useState<Report | null>(null),
    [importTab, setImportTab] = useState<ImportTab>('json'),
    [importText, setImportText] = useState(''),
    [previewedImport, setPreviewedImport] = useState(''),
    [showImport, setShowImport] = useState(false),
    [showAddJob, setShowAddJob] = useState(false),
    [historyNext, setHistoryNext] = useState<Record<string, string | null>>({});
  const sessionRef = useRef(createWorkspaceSession());
  const importRef = useRef<HTMLElement>(null);
  const queueRef = useRef<HTMLElement>(null);
  const workspaceEpoch = sessionRef.current.gate.epoch;
  const applyExpired = useCallback(() => {
    const next = expiredPrivateWorkspace();
    setJobs(next.jobs);
    setSources(next.sources);
    setEvents(next.events);
    setFacts(next.facts);
    setEditor(next.editor);
    setImportText(next.importText);
    setPreviewedImport(next.previewedImport);
    setReport(next.report);
    setShowImport(next.showImport);
    setShowAddJob(next.showAddJob);
    setSignedOut(next.signedOut);
    setLoaded(next.loaded);
    setHistoryNext({});
    setMessage('');
  }, []);
  const researchRows = useMemo(() => {
    try {
      return validateRows(JSON.parse(importText));
    } catch {
      return [];
    }
  }, [importText]);
  const selected = editor?.jobId ?? '',
    draft = editor?.draft ?? '',
    blocker = editor?.blocker ?? '',
    current = jobs.find((j) => j.id === selected),
    visible = jobs.filter(
      (j) =>
        (filter === 'All' || j.status === filter) &&
        j.name.toLowerCase().includes(search.toLowerCase()),
    ),
    fit = current
      ? assessJob(
          current,
          sources.filter((s) => s.job_key === current.job_key),
          facts,
          new Date().toISOString(),
        )
      : null;
  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const job of jobs)
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    return { total: jobs.length, byStatus };
  }, [jobs]);
  const stageView = {
    page: 'workspace' as const,
    signedOut,
    jobCount: jobs.length,
    selectedStatus: current?.status ?? null,
    editorDirty: editorIsDirty(editor),
  };
  const action = primaryAction(stageView);
  const addJobPrimary = headerAddJobIsPrimary(stageView);
  const selectedRef = useRef('');
  const editorRef = useRef<Editor | null>(null);
  const addJobViewerRef = useRef<string | undefined>(undefined);
  const progressAttempt = useRef<{ key: string; operationId: string } | null>(
    null,
  );
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  const loadJobHistory = useCallback(
    async (jobId: string, before?: string | null) => {
      const started = { epoch: sessionRef.current.gate.epoch };
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'history',
          id: jobId,
          limit: 50,
          ...(before ? { before } : {}),
        }),
      });
      if (r.status === 401) {
        expireSession(sessionRef.current);
        applyExpired();
        return;
      }
      if (!r.ok) return;
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      const data = (await r.json()) as {
        events?: ReviewEvent[];
        next?: string | null;
      };
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      setEvents((prev) => mergeReviewEvents(prev, data.events || []));
      setHistoryNext((prev) => ({ ...prev, [jobId]: data.next || null }));
    },
    [applyExpired],
  );
  const refresh = useCallback(
    async (saved?: SaveSnapshot) => {
      if (saved) sessionRef.current.lastAck = saved;
      const started = beginRefresh(sessionRef.current.gate);
      const r = await fetch('/api/workspace');
      const outcome = await processRefresh(sessionRef.current, started, r);
      if (outcome.type === 'expire') {
        applyExpired();
        return;
      }
      if (outcome.type === 'ignore') return;
      if (outcome.type === 'error') throw Error(outcome.error);
      if (!outcome.switched && !refreshIsLive(sessionRef.current.gate, started))
        return;
      const nextJobs = outcome.jobs as Job[];
      setJobs(nextJobs);
      setSources(outcome.sources as Source[]);
      setEvents(outcome.events as ReviewEvent[]);
      setFacts(outcome.facts as Fact[]);
      if (outcome.switched) {
        setShowAddJob(false);
        setShowImport(false);
        setImportText('');
        setPreviewedImport('');
        setReport(null);
        if (!nextJobs.some((job) => job.id === selectedRef.current)) {
          selectedRef.current = '';
          setEditor(null);
        } else {
          setEditor((e) => editorForJobs(sessionRef.current, e, outcome.jobs));
        }
      } else {
        setEditor((e) => editorForJobs(sessionRef.current, e, outcome.jobs));
      }
      setSignedOut(false);
      setLoaded(true);
      if (selectedRef.current) void loadJobHistory(selectedRef.current);
      return nextJobs;
    },
    [applyExpired, loadJobHistory],
  );
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e) => {
        setMessage(e.message);
        setLoaded(true);
      });
  }, [refresh]);
  useEffect(() => {
    if (!showImport) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowImport(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showImport]);
  useEffect(() => {
    if (showImport) importRef.current?.scrollIntoView({ block: 'nearest' });
  }, [showImport]);
  async function run(body: Record<string, unknown>, saved?: SaveSnapshot) {
    const started = beginMutation(sessionRef.current.gate);
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const outcome = await processMutation(
        sessionRef.current,
        started,
        r,
        saved,
      );
      if (outcome.type === 'expire') {
        applyExpired();
        return;
      }
      if (outcome.type === 'ignore') return;
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      if (outcome.type === 'error') {
        if (saved && outcome.status === 409) await refresh();
        if (!mutationIsLive(sessionRef.current.gate, started)) return;
        throw Error(outcome.error);
      }
      setEditor((e) => (e && saved ? acknowledgeSave(e, saved) : e));
      if (outcome.body.items) setReport(outcome.body as Report);
      if (body.action === 'preview')
        setPreviewedImport(JSON.stringify(body.rows));
      if (body.action === 'import') setPreviewedImport('');
      await refresh(saved);
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      setMessage(
        body.action === 'save'
          ? 'Saved. Your review is preserved.'
          : body.action === 'progress'
            ? 'Progress saved. Saved wording and application status are unchanged.'
            : body.action === 'replay'
              ? 'Replay complete. No records changed.'
              : body.action === 'preview'
                ? 'Preview complete. No records were imported.'
                : 'Workspace updated.',
      );
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  useRelayTools(refresh);
  const protectedState =
      current &&
      (['Submitted', 'Live loop'].includes(current.status) ||
        isTerminal(current.status)),
    blocked = busy || !editor || !canSave(editor),
    acceptedExact = showsExactAcceptance(current, editor);
  function discardUnsaved() {
    return window.confirm('Discard unsaved draft and blocker changes?');
  }
  function confirmLeave(event: { preventDefault: () => void }) {
    if (editorIsDirty(editor) && !discardUnsaved()) event.preventDefault();
  }
  function chooseJob(job: Job) {
    if (keepEditorOnReselect(editor, job.id)) return;
    if (editorIsDirty(editor) && !discardUnsaved()) return;
    selectedRef.current = job.id;
    setEditor(loadEditor(job));
    void loadJobHistory(job.id);
  }
  function chooseFilter(value: QueueFilter) {
    if (signedOut) {
      document
        .getElementById('workspace-signin')
        ?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (value === filter) {
      queueRef.current?.scrollIntoView({ block: 'nearest' });
      queueRef.current?.querySelector('h2')?.focus();
      return;
    }
    if (editorIsDirty(editor) && !discardUnsaved()) return;
    selectedRef.current = '';
    setFilter(value);
    setEditor(null);
    window.history.replaceState(null, '', queueHref(value));
    requestAnimationFrame(() => {
      queueRef.current?.scrollIntoView({ block: 'nearest' });
      queueRef.current?.querySelector('h2')?.focus();
    });
  }
  function openImport(tab: ImportTab = 'json') {
    setImportTab(tab);
    setShowImport(true);
  }
  function chooseImportTab(next: ImportTab) {
    setImportTab(next);
    requestAnimationFrame(() => {
      document.getElementById(importTabButtonId(next))?.focus();
    });
  }
  function onImportTabKey(event: { key: string; preventDefault: () => void }) {
    const next = importTabFromKey(importTab, event.key);
    if (!next) return;
    event.preventDefault();
    chooseImportTab(next);
  }
  function save(status: string) {
    if (!editor || !canSave(editor)) return;
    const saved: SaveSnapshot = {
      jobId: editor.jobId,
      session: editor.session,
      version: editor.version,
      draft: editor.draft,
      blocker: editor.blocker,
    };
    void run(
      {
        action: 'save',
        id: saved.jobId,
        version: saved.version,
        draft: saved.draft,
        blocker: saved.blocker,
        status,
      },
      saved,
    );
  }
  async function saveProgress() {
    if (busy || !editor || !current || !canSave(editor)) return;
    const saved: SaveSnapshot = {
      jobId: editor.jobId,
      session: editor.session,
      version: editor.version,
      draft: current.draft,
      blocker: editor.blocker,
    };
    const body = {
      action: 'progress',
      id: saved.jobId,
      version: saved.version,
      note: 'Next action updated',
      blocker: saved.blocker,
      viewer: sessionRef.current.viewer,
    };
    const key = JSON.stringify(body);
    if (progressAttempt.current?.key !== key)
      progressAttempt.current = { key, operationId: crypto.randomUUID() };
    const attempt = progressAttempt.current;
    const ok = await run({ ...body, operation_id: attempt.operationId }, saved);
    if (ok && progressAttempt.current === attempt)
      progressAttempt.current = null;
  }
  function openAddJob() {
    addJobViewerRef.current = sessionRef.current.viewer;
    setShowAddJob(true);
  }
  async function saveFirstJob(row: SourceRow) {
    if (editorIsDirty(editor) && !discardUnsaved()) return;
    const originViewer = addJobViewerRef.current;
    const started = beginMutation(sessionRef.current.gate);
    const startedEditor = {
      selectedId: selectedRef.current,
      jobId: editor?.jobId ?? '',
      session: editor?.session ?? '',
      draft: editor?.draft ?? '',
      blocker: editor?.blocker ?? '',
    };
    setBusy(true);
    setMessage('');
    try {
      await refresh();
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      if (
        originViewer &&
        sessionRef.current.viewer &&
        originViewer !== sessionRef.current.viewer
      ) {
        setShowAddJob(false);
        return;
      }
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          rows: [row],
          ...(originViewer ? { viewer: originViewer } : {}),
        }),
      });
      const outcome = await processMutation(sessionRef.current, started, r);
      if (outcome.type === 'expire') {
        applyExpired();
        return;
      }
      if (outcome.type === 'ignore') {
        setShowAddJob(false);
        return;
      }
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      if (outcome.type === 'error') {
        if (outcome.status === 409) setShowAddJob(false);
        throw Error(outcome.error);
      }
      const key = jobKey(row.Job, row.url);
      let nextJobs: Job[] | undefined;
      try {
        nextJobs = await refresh();
      } catch {
        if (!mutationIsLive(sessionRef.current.gate, started)) return;
        setShowAddJob(false);
        setMessage(
          'Job was saved, but the workspace could not refresh. Reload the page to see it.',
        );
        return;
      }
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      const savedJob = nextJobs?.find((job) => job.job_key === key);
      const selectSaved = firstJobShouldSelectSaved(
        startedEditor,
        editorRef.current,
        selectedRef.current,
        savedJob?.id,
      );
      if (savedJob && selectSaved) {
        selectedRef.current = savedJob.id;
        setFilter((currentFilter) =>
          currentFilter === 'All' || currentFilter === savedJob.status
            ? currentFilter
            : isQueueFilter(savedJob.status)
              ? savedJob.status
              : currentFilter,
        );
        setEditor(loadEditor(savedJob));
        void loadJobHistory(savedJob.id);
      }
      const kind = (outcome.body as Report).items?.[0]?.kind;
      setShowAddJob(false);
      setMessage(
        kind && kind !== 'new'
          ? 'Research added to the existing job.'
          : selectSaved
            ? 'Job saved. Continue from the selected record.'
            : 'Job saved.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  const connections = !signedOut ? (
    <Connections
      key={current?.id ?? 'no-job'}
      current={
        current && editor
          ? {
              ...current,
              version: editor.version,
              session: editor.session,
            }
          : current
      }
      draft={draft}
      notes={blocker}
      sources={sources.filter((s) => s.job_key === current?.job_key)}
      onDraft={(value, started) => {
        setEditor((e) => applyLoadedDraft(e, value, started));
      }}
      onImport={(value) => {
        setImportText(value);
        setPreviewedImport('');
        setReport(null);
      }}
      openImport={() => openImport('json')}
    />
  ) : null;
  return (
    <AppShell
      counts={counts}
      current="workspace"
      filter={filter}
      onFilter={chooseFilter}
      onNavigate={confirmLeave}
    >
      <main id="workspace-main">
        <header>
          <div>
            <h1>Workspace</h1>
            <p>{stageLead(stageView)}</p>
          </div>
          <div className="actions">
            {loaded && !signedOut && jobs.length > 0 && (
              <button
                className={addJobPrimary ? 'primary' : 'secondary'}
                onClick={openAddJob}
                type="button"
              >
                Add job
              </button>
            )}
            {!signedOut && (
              <button
                aria-controls="import-dock"
                aria-expanded={showImport}
                className="secondary"
                onClick={() => {
                  if (showImport) {
                    document.getElementById('import-dock-title')?.focus();
                    return;
                  }
                  openImport(importTab);
                }}
                type="button"
              >
                <Upload size={16} />
                Import research
              </button>
            )}
          </div>
        </header>
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
        {!signedOut && (
          <section
            aria-labelledby="import-dock-title"
            className="import import-dock"
            hidden={!showImport}
            id="import-dock"
            ref={importRef}
          >
            <div className="import-dock-head">
              <h2 id="import-dock-title" tabIndex={-1}>
                Import research
              </h2>
              <button
                className="textbutton"
                onClick={() => setShowImport(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <p>
              Review the selected research below, then preview its matches
              before saving. Importing adds these notes to your Relay workspace.
            </p>
            <div
              aria-label="How to import"
              aria-orientation="horizontal"
              className="import-tabs"
              role="tablist"
            >
              <button
                aria-controls="import-panel-json"
                aria-selected={importTab === 'json'}
                className="secondary"
                id="import-tab-json"
                onClick={() => setImportTab('json')}
                onKeyDown={onImportTabKey}
                role="tab"
                tabIndex={importTab === 'json' ? 0 : -1}
                type="button"
              >
                Research JSON
              </button>
              <button
                aria-controls="import-panel-csv"
                aria-selected={importTab === 'csv'}
                className="secondary"
                id="import-tab-csv"
                onClick={() => setImportTab('csv')}
                onKeyDown={onImportTabKey}
                role="tab"
                tabIndex={importTab === 'csv' ? 0 : -1}
                type="button"
              >
                Tracker CSV
              </button>
            </div>
            <div
              aria-labelledby="import-tab-json"
              hidden={importTab !== 'json'}
              id="import-panel-json"
              role="tabpanel"
            >
              {researchRows.map((row, index) => (
                <details key={index} className="source">
                  <summary>{row.Name}</summary>
                  <p>{row.Job}</p>
                  <pre
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {row.Notes || 'No source notes recorded.'}
                  </pre>
                </details>
              ))}
              <details open={!researchRows.length}>
                <summary>Paste or edit import data</summary>
                <textarea
                  aria-label="Research JSON"
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setPreviewedImport('');
                    setReport(null);
                  }}
                  placeholder='[{"url":"source-record-id","Name":"Company — Role","Job":"https://…","Status":"Held","Notes":"…"}]'
                />
              </details>
              <div className="import-dock-actions">
                {['preview', 'import'].map((action) => (
                  <button
                    className={action === 'import' ? 'primary' : 'secondary'}
                    disabled={
                      busy ||
                      !researchRows.length ||
                      (action === 'import' &&
                        previewedImport !== JSON.stringify(researchRows))
                    }
                    key={action}
                    onClick={() => {
                      try {
                        void run({ action, rows: JSON.parse(importText) });
                      } catch {
                        setMessage('Enter a valid JSON array.');
                      }
                    }}
                    type="button"
                  >
                    {action === 'import'
                      ? 'Import into workspace'
                      : 'Preview matches'}
                  </button>
                ))}
              </div>
            </div>
            <div
              aria-labelledby="import-tab-csv"
              hidden={importTab !== 'csv'}
              id="import-panel-csv"
              role="tabpanel"
            >
              <TrackerImport
                onImported={() =>
                  mutationIsLive(sessionRef.current.gate, {
                    epoch: workspaceEpoch,
                  })
                    ? refresh().then(() => undefined)
                    : Promise.resolve()
                }
                onUnauthorized={() => {
                  expireSession(sessionRef.current);
                  applyExpired();
                }}
              />
            </div>
          </section>
        )}
        {report && !signedOut && (
          <section className="report">
            <div>
              <b>Research check</b>
              <button className="textbutton" onClick={() => setReport(null)}>
                Dismiss
              </button>
            </div>
            <p>
              <strong>{report.new}</strong> new to this workspace ·{' '}
              <strong>{report.known}</strong> already known ·{' '}
              <strong>{report.submitted}</strong> already submitted
            </p>
            <details>
              <summary>See {report.items.length} results</summary>
              {report.items.map((i, n: number) => (
                <p key={n}>
                  {i.name}
                  <span className={'badge ' + i.kind}>{i.kind}</span>
                </p>
              ))}
            </details>
          </section>
        )}
        {jobs.length > 0 && (
          <section className="stats">
          <div>
            <span>Opportunities</span>
            <strong>{jobs.length.toString().padStart(2, '0')}</strong>
            <small>Unique job records</small>
          </div>
          <div>
            <span>Ready for your review</span>
            <strong>
              {jobs
                .filter((j) => j.status === 'Held')
                .length.toString()
                .padStart(2, '0')}
            </strong>
            <small>Held drafts</small>
          </div>
          <div>
            <span>Repeat sources</span>
            <strong>
              {(sources.length - jobs.length).toString().padStart(2, '0')}
            </strong>
            <small>Joined to an existing job</small>
          </div>
        </section>
        )}
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
        ) : loaded && jobs.length === 0 && !showAddJob ? (
          <section className="welcome">
            <h2>No jobs yet</h2>
            <p>
              Add a posting with its role title and URL. Optional notes are
              saved as research. Your facts and Advanced tools are optional.
            </p>
            <div className="actions">
              <button
                className={action === 'add_job' ? 'primary' : 'secondary'}
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
            <small>Example companies and records are fictional.</small>
          </section>
        ) : !loaded ? (
          <p aria-live="polite">Opening your workspace…</p>
        ) : null}
        {!signedOut && loaded && jobs.length > 0 && (
          <>
            {jobs.length > 0 && !current && (
              <section className="replay">
                <GitMerge size={20} />
                <div>
                  <b>Check example research</b>
                  <p>
                    Compare the example records with this workspace to see which
                    jobs are already here.
                  </p>
                </div>
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() => run({ action: 'replay' })}
                  type="button"
                >
                  Check examples <ArrowRight size={16} />
                </button>
              </section>
            )}
            <div className="workgrid">
              <section className="queue" id="workspace-queue" ref={queueRef}>
                <div className="queuehead">
                  <h2 tabIndex={-1}>{queueTitle(filter)}</h2>
                  <span>{visible.length} roles</span>
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Find a company or role"
                    placeholder="Find a company or role"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="joblist">
                  {visible.map((j) => (
                    <button
                      key={j.id}
                      className={'job ' + (selected === j.id ? 'selected' : '')}
                      onClick={() => chooseJob(j)}
                    >
                      <span className="companyicon">{j.name[0]}</span>
                      <span className="jobtext">
                        <b>{j.name}</b>
                        <small>{jobQueueHint(j, editor)}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {!visible.length && (
                    <p className="empty">No roles in this view.</p>
                  )}
                </div>
              </section>
              <section className="detail">
                {current ? (
                  <>
                    <div className="detailhead">
                      <span className="badge">
                        Relay status: {current.status}
                      </span>
                      <h2>{current.name}</h2>
                      <p className="muted">{loopStepLead(current.status)}</p>
                      {current.url && (
                        <a href={current.url} target="_blank" rel="noreferrer">
                          Open employer posting <ArrowUpRight size={15} />
                        </a>
                      )}
                    </div>
                    {connections}
                    {showsExactAcceptance(current, editor) && (
                      <div className="notice">
                        This exact draft is accepted.
                      </div>
                    )}
                    {protectedState && (
                      <div className="notice">
                        You can edit notes and follow-up drafts. Saving keeps
                        this job’s {current.status} status.
                      </div>
                    )}
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
                    <label className="field">
                      Blocker or missing fact
                      <textarea
                        value={blocker}
                        onChange={(e) =>
                          setEditor((ed) =>
                            ed ? { ...ed, blocker: e.target.value } : ed,
                          )
                        }
                        placeholder={
                          protectedState
                            ? 'Interview notes, next steps, or missing information…'
                            : 'What needs to be resolved before accepting this draft?'
                        }
                      />
                    </label>
                    <div className="actions">
                      <button
                        className="secondary"
                        disabled={blocked || blocker === editor?.baseBlocker}
                        onClick={() => void saveProgress()}
                      >
                        Save progress only
                      </button>
                    </div>
                    <p className="muted">
                      Save the next action without changing saved wording or
                      application status. Draft edits below remain unsaved.
                    </p>
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
                    <h3>Evidence matches</h3>
                    <small className="muted">
                      Heuristic word and number matches against your confirmed,
                      unexpired facts. These do not assess your qualifications
                      or change this job’s status.
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
                        No match can mean missing evidence or different wording.
                        Review the requirement and your experience before
                        deciding.
                      </small>
                    )}
                    <h3>Source history</h3>
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
                    {events.filter((e) => e.job_id === current.id).length >
                      0 && (
                      <>
                        <h3>Your review history</h3>
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
                      </>
                    )}
                  </>
                ) : (
                  <div className="detailintro">
                    <div className="bigmark">
                      <BriefcaseBusiness size={32} />
                    </div>
                    <h2>Select a role</h2>
                    <p>
                      Open a job to continue its review, or add another posting.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
        <footer>Relay / SyberLabs</footer>
      </main>
    </AppShell>
  );
}
