'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { jobKey, validateRows, type SourceRow } from '../lib/domain';
import { firstJobShouldSelectSaved } from '../lib/first-job';
import { isTerminal } from '../lib/outcomes';
import { type Fact } from '../lib/profile';
import { assessJob } from '../lib/fit';
import { useRelayTools } from './agent-tools';
import { Connections } from './connections';
import { useInspect } from './inspect';
import { defaultDraftingPreference } from '../lib/drafting-decision';
import { type RuntimeModal } from './runtime-modals';
import {
  applicationReviewCopy,
  applicationReviewKind,
  splitJobName,
  workbenchQueue,
} from '../lib/runtime';
import { plantSearchAction, workspaceHref } from '../lib/nav';
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
  processAuthorizedGet,
  processMutation,
  processRefresh,
  refreshIsLive,
} from '../lib/workspace-refresh';
import { mergeReviewEvents } from '../lib/workspace-events';
import {
  headerAddJobIsPrimary,
  primaryAction,
  stageLead,
} from '../lib/workspace-stage';
import type { Job, Report, ReviewEvent, Source } from './workspace-types';

export type { Job, Report, ReviewEvent, Source } from './workspace-types';

export function useWorkspaceRuntime() {
  const [draftingPreference, setDraftingPreference] = useState(
    defaultDraftingPreference,
  );
  const [jobs, setJobs] = useState<Job[]>([]),
    [sources, setSources] = useState<Source[]>([]),
    [events, setEvents] = useState<ReviewEvent[]>([]),
    [facts, setFacts] = useState<Fact[]>([]),
    [editor, setEditor] = useState<Editor | null>(null),
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
    [handoffOpen, setHandoffOpen] = useState(false),
    [historyNext, setHistoryNext] = useState<Record<string, string | null>>({});
  const [modal, setModal] = useState<RuntimeModal>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyReturnRef = useRef<HTMLElement | null>(null);
  const historyDialogRef = useRef<HTMLDialogElement>(null);
  const [saveProfile, setSaveProfile] = useState(true);
  const [styleCount, setStyleCount] = useState(0);
  const sessionRef = useRef(createWorkspaceSession());
  const selectedRef = useRef('');
  const refreshRef = useRef<
    (saved?: SaveSnapshot) => Promise<Job[] | undefined>
  >(async () => undefined);
  const importRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const applyExpired = useCallback(() => {
    const next = expiredPrivateWorkspace();
    setJobs(next.jobs);
    setSources(next.sources);
    setEvents(next.events);
    setFacts(next.facts);
    setDraftingPreference(defaultDraftingPreference);
    setEditor(next.editor);
    setImportText(next.importText);
    setPreviewedImport(next.previewedImport);
    setReport(next.report);
    setShowImport(next.showImport);
    setShowAddJob(next.showAddJob);
    setHandoffOpen(next.handoffOpen);
    setSignedOut(next.signedOut);
    setLoaded(next.loaded);
    setHistoryNext({});
    setMessage('');
    setStyleCount(0);
    setModal(null);
    setHistoryOpen(false);
    selectedRef.current = '';
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
    fit = current
      ? assessJob(
          current,
          sources.filter((s) => s.job_key === current.job_key),
          facts,
          new Date().toISOString(),
        )
      : null;
  const inspect = useInspect(
    current?.id,
    {
      sessionRef,
      onUnauthorized: () => {
        expireSession(sessionRef.current);
        applyExpired();
      },
    },
    current?.version,
  );
  const outcomeSeenRef = useRef('');
  const outcomeBusyRef = useRef(false);
  const inspectJobId = inspect.view?.job_id;
  const inspectOperationId = inspect.view?.operation_id;
  const inspectRecorded = inspect.view?.recorded_result;
  const inspectState = inspect.view?.state;
  useEffect(() => {
    if (!inspectJobId) return;
    if (selectedRef.current !== inspectJobId) return;
    const terminal =
      inspectRecorded === 'submitted' ||
      inspectRecorded === 'uncertain' ||
      inspectRecorded === 'not-submitted' ||
      inspectState === 'submitted' ||
      inspectState === 'uncertain' ||
      inspectState === 'cancelled' ||
      inspectState === 'not-submitted';
    if (!terminal) return;
    const key = `${inspectJobId}:${inspectOperationId || ''}:${inspectRecorded || inspectState}`;
    if (outcomeSeenRef.current === key) return;
    if (outcomeBusyRef.current) return;
    let cancelled = false;
    outcomeBusyRef.current = true;
    void (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (cancelled) return;
          try {
            const jobs = await refreshRef.current();
            if (cancelled) return;
            if (jobs) {
              outcomeSeenRef.current = key;
              if (attempt > 0) setMessage('');
              return;
            }
            return;
          } catch (error) {
            if (cancelled) return;
            setMessage(
              error instanceof Error ? error.message : 'Unable to load.',
            );
            if (attempt >= 1) return;
          }
        }
      } finally {
        if (!cancelled) outcomeBusyRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      outcomeBusyRef.current = false;
    };
  }, [inspectJobId, inspectOperationId, inspectRecorded, inspectState]);
  const lanes = workbenchQueue(jobs, search);
  const queued = lanes.waiting;
  const named = current ? splitJobName(current.name) : null;
  const inspectFreshnessGap =
    Boolean(inspect.view?.accept_enabled) && !inspect.acceptEnabled;
  const reviewKind = current
    ? applicationReviewKind(
        current,
        inspect.view
          ? { ...inspect.view, accept_enabled: inspect.acceptEnabled }
          : inspect.view,
      )
    : null;
  const reviewCopy = reviewKind
    ? inspectFreshnessGap &&
      (reviewKind === 'preparing' || reviewKind === 'disconnected')
      ? {
          title: 'Checking latest changes',
          detail: 'Refreshing this prepared application.',
        }
      : applicationReviewCopy(reviewKind)
    : null;
  const stageView = {
    page: 'workspace' as const,
    signedOut,
    jobCount: jobs.length,
    selectedStatus: current?.status ?? null,
    editorDirty: editorIsDirty(editor),
  };
  const action = primaryAction(stageView);
  const addJobPrimary = headerAddJobIsPrimary(stageView);
  const editorRef = useRef<Editor | null>(null);
  const addJobViewerRef = useRef<string | undefined>(undefined);
  const progressAttempt = useRef<{ key: string; operationId: string } | null>(
    null,
  );
  const decisionAttempt = useRef<{ key: string; operationId: string } | null>(
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
  const loadRuntimeContext = useCallback(async () => {
    if (!sessionRef.current.viewer) return;
    const started = beginMutation(sessionRef.current.gate);
    try {
      const response = await fetch('/api/profile');
      const outcome = await processAuthorizedGet<{
        error?: string;
        viewer?: string;
        rules?: { id: string }[];
      }>(sessionRef.current, started, response);
      if (outcome.type === 'expire') {
        applyExpired();
        return;
      }
      if (outcome.type !== 'ok') return;
      if (outcome.switched) {
        applyExpired();
        selectedRef.current = '';
        setSignedOut(false);
        setLoaded(true);
        setStyleCount(Array.isArray(outcome.body.rules) ? outcome.body.rules.length : 0);
        void refreshRef.current();
        return;
      }
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      setStyleCount(Array.isArray(outcome.body.rules) ? outcome.body.rules.length : 0);
    } catch {
      // Keep the last known style count when profile context cannot be read.
    }
  }, [applyExpired]);
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
      if (!selectedRef.current && typeof window !== 'undefined') {
        const raw = new URLSearchParams(window.location.search).get('job');
        const wanted =
          raw && raw.trim() && raw.trim().length <= 200 ? raw.trim() : null;
        if (wanted && nextJobs.some((job) => job.id === wanted))
          selectedRef.current = wanted;
      }
      setJobs(nextJobs);
      setSources(outcome.sources as Source[]);
      setEvents(outcome.events as ReviewEvent[]);
      setFacts(outcome.facts as Fact[]);
      setDraftingPreference(
        outcome.draftingPreference ?? defaultDraftingPreference,
      );
      const editorFromSelection = (e: Editor | null) => {
        const match = nextJobs.find((job) => job.id === selectedRef.current);
        const current =
          e?.jobId === selectedRef.current ? e : match ? loadEditor(match) : e;
        return editorForJobs(sessionRef.current, current, outcome.jobs);
      };
      if (outcome.switched) {
        setModal(null);
        setStyleCount(0);
        setHistoryOpen(false);
        setShowAddJob(false);
        setShowImport(false);
        setImportText('');
        setPreviewedImport('');
        setReport(null);
        if (!nextJobs.some((job) => job.id === selectedRef.current)) {
          selectedRef.current = '';
          setEditor(null);
        } else {
          setEditor(editorFromSelection);
        }
      } else {
        setEditor(editorFromSelection);
      }
      setSignedOut(false);
      setLoaded(true);
      if (selectedRef.current) void loadJobHistory(selectedRef.current);
      void loadRuntimeContext();
      return nextJobs;
    },
    [applyExpired, loadJobHistory, loadRuntimeContext],
  );
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e) => {
        setMessage(e.message);
        setLoaded(true);
      });
  }, [refresh]);
  useEffect(() => {
    const action = plantSearchAction(window.location.search);
    if (action.redirectTo) {
      window.location.replace(action.redirectTo);
      return;
    }
    if (action.stripTo) window.history.replaceState(null, '', action.stripTo);
  }, []);
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
  useEffect(() => {
    if (!historyOpen) return;
    const dialog = historyDialogRef.current;
    if (!dialog) return;
    historyReturnRef.current = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    document.getElementById('history-title')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      historyReturnRef.current?.focus?.();
    };
  }, [historyOpen]);
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
        body.action === 'drafting-decision'
          ? body.choice === 'reset'
            ? 'Preference updated. Your assistant will ask you again.'
            : 'Decision saved. Your assistant can continue from this job.'
          : body.action === 'save'
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
  const toolStatus = useRelayTools(refresh);
  const protectedState =
      current &&
      (['Submitted', 'Live loop'].includes(current.status) ||
        isTerminal(current.status)),
    blocked = busy || !editor || !canSave(editor),
    acceptedExact = showsExactAcceptance(current, editor);
  function discardUnsaved() {
    return window.confirm(
      'Discard unsaved draft, blocker, and progress note changes?',
    );
  }
  function confirmLeave(event: { preventDefault: () => void }) {
    if (editorIsDirty(editor) && !discardUnsaved()) event.preventDefault();
  }
  function closeHistory() {
    historyDialogRef.current?.close();
    setHistoryOpen(false);
  }
  function chooseJob(job: Job) {
    if (keepEditorOnReselect(editor, job.id)) return;
    if (editorIsDirty(editor) && !discardUnsaved()) return;
    selectedRef.current = job.id;
    setEditor(loadEditor(job));
    window.history.replaceState(null, '', workspaceHref(job.id));
    void loadJobHistory(job.id);
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ block: 'start' });
      detailRef.current?.querySelector('h2')?.focus({ preventScroll: true });
    });
  }
  function openImport(tab: ImportTab = 'json') {
    if (!loaded || signedOut) return;
    setImportTab(tab);
    setShowImport(true);
  }
  function findMoreJobs() {
    if (!loaded || signedOut) return;
    if (showImport) {
      document.getElementById('import-dock-title')?.focus();
      return;
    }
    openImport(importTab);
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
      progressNote: editor.progressNote,
    };
    const body = {
      action: 'progress',
      id: saved.jobId,
      version: saved.version,
      note: editor.progressNote.trim()
        ? editor.progressNote
        : 'Blocker updated',
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
  async function saveDecision(
    choice: 'delegate' | 'answer' | 'reset',
    remember: boolean,
    answer: string,
    saveProfileFact = false,
  ) {
    if (
      busy ||
      !editor ||
      !current ||
      !canSave(editor) ||
      editor.draft !== editor.baseDraft ||
      editor.blocker !== editor.baseBlocker ||
      (choice !== 'answer' && !!editor.progressNote)
    )
      return;
    const body = {
      action: 'drafting-decision',
      id: current.id,
      version: editor.version,
      viewer: sessionRef.current.viewer,
      preference_version: draftingPreference.version,
      choice,
      remember,
      answer,
      ...(choice === 'answer'
        ? {
            save_profile: saveProfileFact && answer.trim().length <= 500,
          }
        : {}),
    };
    const key = JSON.stringify(body);
    if (decisionAttempt.current?.key !== key)
      decisionAttempt.current = { key, operationId: crypto.randomUUID() };
    const attempt = decisionAttempt.current;
    const ok = await run(
      { ...body, operation_id: attempt.operationId },
      {
        jobId: editor.jobId,
        session: editor.session,
        version: editor.version,
        draft: current.draft,
        blocker: current.blocker,
        ...(choice === 'answer' ? { progressNote: answer } : {}),
      },
    );
    if (ok && decisionAttempt.current === attempt)
      decisionAttempt.current = null;
    return ok;
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
      progressNote: editor?.progressNote ?? '',
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
        setEditor(loadEditor(savedJob));
        if (typeof window !== 'undefined')
          window.history.replaceState(
            null,
            '',
            '/?job=' + encodeURIComponent(savedJob.id),
          );
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
      key={`connections-${current?.id ?? 'no-job'}`}
      toolStatus={toolStatus}
      open={handoffOpen}
      onOpenChange={setHandoffOpen}
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
      drafting={{
        routine: draftingPreference.routine,
        direction: current?.drafting_direction ?? '',
      }}
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
  function loadNext() {
    const next = queued[0] ?? lanes.waiting[0];
    if (next) chooseJob(next);
  }
  return {
    acceptedExact,
    action,
    addJobPrimary,
    applyExpired,
    blocked,
    blocker,
    busy,
    chooseJob,
    closeHistory,
    confirmLeave,
    connections,
    current,
    draft,
    draftingPreference,
    editor,
    events,
    facts,
    findMoreJobs,
    fit,
    historyDialogRef,
    historyNext,
    historyOpen,
    importRef,
    importTab,
    importText,
    inspect,
    inspectFreshnessGap,
    jobs,
    lanes,
    lead: stageLead(stageView),
    loaded,
    loadJobHistory,
    loadNext,
    message,
    modal,
    named,
    onImportTabKey,
    openAddJob,
    previewedImport,
    protectedState,
    queued,
    refresh,
    report,
    researchRows,
    reviewCopy,
    reviewKind,
    run,
    save,
    saveDecision,
    saveFirstJob,
    saveProfile,
    saveProgress,
    search,
    selected,
    selectedRef,
    sessionRef,
    setMessage,
    setEditor,
    setHistoryOpen,
    setImportTab,
    setImportText,
    setModal,
    setPreviewedImport,
    setReport,
    setSaveProfile,
    setSearch,
    setShowAddJob,
    setShowImport,
    showAddJob,
    showImport,
    signedOut,
    sources,
    stageView,
    styleCount,
    toolStatus,
    detailRef,
  };
}

export type WorkspaceRuntime = ReturnType<typeof useWorkspaceRuntime>;
