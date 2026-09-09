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
import { inspectSendControl, useInspect } from './inspect';
import { FirstJob } from './first-job';
import { TrackerImport } from './tracker-import';
import { BlockerReview } from './blocker-review';
import { defaultDraftingPreference } from '../lib/drafting-decision';
import { RuntimeShell } from './runtime-shell';
import { RuntimeModals, type RuntimeModal } from './runtime-modals';
import { WorkbenchQueue } from './workbench-queue';
import type { ApplicationPolicy } from '../lib/application-automation';
import {
  applicationReviewCopy,
  applicationReviewKind,
  boundedPolicyMaximum,
  ctxTally,
  formatLocation,
  formatPay,
  policyExpiryIso,
  policyJobIds,
  sourceLabel,
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
import { ArrowUpRight, Check, ArrowRight } from 'lucide-react';
type Job = {
  id: string;
  job_key: string;
  name: string;
  url: string | null;
  status: string;
  blocker: string;
  drafting_direction: string;
  draft: string;
  accepted_draft: string | null;
  version: number;
  company?: string;
  location?: string;
  remote?: string;
  source?: string;
  comp_min?: number | null;
  comp_max?: number | null;
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
  const [autopilot, setAutopilot] = useState(false);
  const [policy, setPolicy] = useState<ApplicationPolicy | null>(null);
  const [saveProfile, setSaveProfile] = useState(true);
  const [styleCount, setStyleCount] = useState(0);
  const sessionRef = useRef(createWorkspaceSession());
  const policyRef = useRef<ApplicationPolicy | null>(null);
  const selectedRef = useRef('');
  const busyRef = useRef<false | number>(false);
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
    setPolicy(null);
    setAutopilot(false);
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
    const apply = async (
      response: Response,
      write: (body: {
        policy?: ApplicationPolicy | null;
        rules?: { id: string }[];
      }) => void,
    ) => {
      const outcome = await processAuthorizedGet<{
        error?: string;
        viewer?: string;
        policy?: ApplicationPolicy | null;
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
        write(outcome.body);
        void refreshRef.current();
        return;
      }
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      write(outcome.body);
    };
    const consume = (
      url: string,
      write: (body: {
        policy?: ApplicationPolicy | null;
        rules?: { id: string }[];
      }) => void,
    ) =>
      fetch(url)
        .then((response) => apply(response, write))
        .catch(() => {
          /* Context tiles keep their last known values. */
        });
    await Promise.all([
      consume('/api/applications', (body) => {
        setPolicy(body.policy || null);
        setAutopilot(Boolean(body.policy?.enabled));
      }),
      consume('/api/profile', (body) => {
        setStyleCount(Array.isArray(body.rules) ? body.rules.length : 0);
      }),
    ]);
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
        setPolicy(null);
        setAutopilot(false);
        setStyleCount(0);
        policyRef.current = null;
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
    policyRef.current = policy;
  }, [policy]);
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
    if (!next) return;
    chooseJob(next);
  }
  async function saveLimits(input: {
    maximum: number;
    review: string;
    enabled: boolean;
  }): Promise<boolean | 'busy'> {
    const viewer = sessionRef.current.viewer;
    if (!viewer) {
      setMessage('Sign in to save application limits.');
      return false;
    }
    if (busyRef.current !== false) return 'busy';
    const saved = policyJobIds(policyRef.current).filter((id) =>
      jobs.some((job) => job.id === id),
    );
    const eligible = jobs
      .filter((job) => job.status !== 'Skip' && !isTerminal(job.status))
      .map((job) => job.id);
    const allowed = input.enabled ? (saved.length ? saved : eligible) : saved;
    if (input.enabled && !allowed.length) {
      setMessage('Add a job before enabling autopilot.');
      return false;
    }
    if (input.enabled && allowed.length > 100) {
      setMessage('Choose at most 100 jobs in Tools before enabling autopilot.');
      setModal('tools');
      return false;
    }
    const maximum = boundedPolicyMaximum(input.maximum);
    const review = input.review === 'sensitive' ? 'sensitive' : 'all';
    const started = beginMutation(sessionRef.current.gate);
    busyRef.current = started.epoch;
    setBusy(true);
    try {
      const r = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'policy',
          viewer,
          version: policyRef.current?.version || 0,
          enabled: input.enabled,
          review,
          jobs: allowed,
          maximum,
          expires: policyExpiryIso(policyRef.current?.expires, input.enabled),
        }),
      });
      const outcome = await processAuthorizedGet<{
        error?: string;
        viewer?: string;
        policy?: ApplicationPolicy | null;
      }>(sessionRef.current, started, r);
      if (outcome.type === 'expire') {
        applyExpired();
        return false;
      }
      if (outcome.type === 'ignore') return false;
      if (outcome.type === 'ok' && outcome.switched) {
        applyExpired();
        selectedRef.current = '';
        setSignedOut(false);
        setLoaded(true);
        const next = outcome.body.policy || null;
        policyRef.current = next;
        setPolicy(next);
        setAutopilot(Boolean(next?.enabled));
        void refresh();
        return false;
      }
      if (!mutationIsLive(sessionRef.current.gate, started)) return false;
      if (outcome.type === 'error') {
        setMessage(outcome.error);
        return false;
      }
      const next = outcome.body.policy || null;
      policyRef.current = next;
      setPolicy(next);
      setAutopilot(Boolean(next?.enabled));
      return true;
    } catch (e) {
      if (!mutationIsLive(sessionRef.current.gate, started)) return false;
      setMessage(e instanceof Error ? e.message : 'Unable to save limits.');
      return false;
    } finally {
      if (busyRef.current === started.epoch) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  async function toggleAutopilot() {
    if (busyRef.current !== false || signedOut) return;
    const started = { epoch: sessionRef.current.gate.epoch };
    if (autopilot) {
      const ok = await saveLimits({
        maximum: policy?.maximum || 8,
        review: policy?.review || 'all',
        enabled: false,
      });
      if (!mutationIsLive(sessionRef.current.gate, started)) return;
      if (ok === true)
        setMessage(
          'Autopilot off. Nothing is sent without your approval and a permit.',
        );
      return;
    }
    const allowed = jobs.filter(
      (job) => job.status !== 'Skip' && !isTerminal(job.status),
    );
    if (!allowed.length) {
      setModal('tools');
      setMessage('Choose jobs in Tools before enabling autopilot.');
      return;
    }
    const ok = await saveLimits({
      maximum: policy?.maximum || 8,
      review: 'all',
      enabled: true,
    });
    if (!mutationIsLive(sessionRef.current.gate, started)) return;
    if (ok === 'busy') return;
    if (ok !== true) {
      if (!sessionRef.current.viewer) return;
      setModal('tools');
      return;
    }
    setMessage(
      'Autopilot on. Agents may prepare applications under your saved permissions. Exact drafts still need your acceptance. Nothing is sent without a permit.',
    );
    if (!current) loadNext();
  }
  return (
    <RuntimeShell
      addJobPrimary={addJobPrimary}
      autopilot={autopilot}
      historyDisabled={!current}
      historyOpen={historyOpen}
      importOpen={showImport}
      importDisabled={signedOut || !loaded}
      lead={stageLead(stageView)}
      live={busy}
      logLine={
        signedOut
          ? 'Sign in to load your runtime.'
          : busy
            ? 'Working…'
            : current
              ? `${current.name}.`
              : 'Workbench ready. Select an application.'
      }
      logTime={message ? new Date().toTimeString().slice(0, 8) : '--:--:--'}
      onAddJob={openAddJob}
      onAutopilot={() => void toggleAutopilot()}
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
                onImported={() => {
                  if (!sessionRef.current.viewer) return Promise.resolve();
                  return refresh().then(() => undefined);
                }}
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
          <p aria-live="polite">Opening your workspace…</p>
        ) : (
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
        )}
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
        <RuntimeModals
          acceptDisabled={
            blocked || acceptedExact || !draft.trim() || !!blocker.trim()
          }
          blockedAnswer={editor?.progressNote ?? ''}
          blockedNote=""
          blockedQuestion={current?.blocker || ''}
          busy={busy}
          draft={draft}
          fit={fit}
          job={current}
          jobs={jobs}
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
          onSaveLimits={async (input) => {
            const started = { epoch: sessionRef.current.gate.epoch };
            const ok = await saveLimits(input);
            if (!mutationIsLive(sessionRef.current.gate, started)) return false;
            if (ok === true) setMessage('Limits saved.');
            return ok === true;
          }}
          onSkip={() => {
            setModal(null);
            save('Skip');
          }}
          onUnauthorized={applyExpired}
          policy={policy}
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
