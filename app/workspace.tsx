'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { validateRows } from '../lib/domain';
import { isTerminal } from '../lib/outcomes';
import { type Fact } from '../lib/profile';
import { assessJob } from '../lib/fit';
import Link from 'next/link';
import { useRelayTools } from './agent-tools';
import { Connections } from './connections';
import { TrackerImport } from './tracker-import';
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
import {
  mergeReviewEvents,
} from '../lib/workspace-events';
import {
  ArrowUpRight,
  Search,
  Check,
  GitMerge,
  Inbox,
  ShieldCheck,
  ArrowRight,
  History,
  BriefcaseBusiness,
  Upload,
  ChevronRight,
  FileText,
  Sparkles,
  Scale,
  Target,
  Activity,
  Award,
  BadgeCheck,
  CircleOff,
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
    [filter, setFilter] = useState('Held'),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [signedOut, setSignedOut] = useState(false),
    [loaded, setLoaded] = useState(false),
    [report, setReport] = useState<Report | null>(null),
    [importText, setImportText] = useState(''),
    [previewedImport, setPreviewedImport] = useState(''),
    [showImport, setShowImport] = useState(false),
    [historyNext, setHistoryNext] = useState<Record<string, string | null>>(
      {},
    );
  const sessionRef = useRef(createWorkspaceSession());
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
  const selectedRef = useRef('');
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
      if (!refreshIsLive(sessionRef.current.gate, started)) return;
      if (outcome.type === 'error') throw Error(outcome.error);
      setJobs(outcome.jobs as Job[]);
      setSources(outcome.sources as Source[]);
      setEvents(outcome.events as ReviewEvent[]);
      setFacts(outcome.facts as Fact[]);
      setEditor((e) => editorForJobs(sessionRef.current, e, outcome.jobs));
      setSignedOut(false);
      setLoaded(true);
      if (selectedRef.current) void loadJobHistory(selectedRef.current);
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
          : body.action === 'replay'
            ? 'Replay complete. No records changed.'
            : body.action === 'preview'
              ? 'Preview complete. No records were imported.'
              : 'Workspace updated.',
      );
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
  function chooseFilter(value: string) {
    if (value === filter) return;
    if (editorIsDirty(editor) && !discardUnsaved()) return;
    selectedRef.current = '';
    setFilter(value);
    setEditor(null);
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
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="mark">r</span>relay<span className="beta">01</span>
        </Link>
        <div className="studio">SYBERLABS / PRIVATE WORKSPACE</div>
        <div className="owner">
          <span className="avatar">S</span>
          <div>
            Your next move<small>Career workspace</small>
          </div>
        </div>
        <div className="navlabel">WORKSPACE</div>
        {(
          [
            ['Held', 'Review queue', Inbox],
            ['Ready', 'Accepted drafts', Check],
            ['Submitted', 'Submitted', ShieldCheck],
            ['Live loop', 'In conversation', BriefcaseBusiness],
            ['Skip', 'Set aside', ArrowRight],
            ['Offer', 'Offers', Award],
            ['Accepted', 'Accepted', BadgeCheck],
            ['Closed', 'Closed', CircleOff],
            ['All', 'All opportunities', History],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            className={'nav ' + (filter === v ? 'active' : '')}
            key={v}
            onClick={() => chooseFilter(v)}
          >
            <Icon size={18} />
            {label}
            <span>
              {v === 'All'
                ? jobs.length
                : jobs.filter((j) => j.status === v).length}
            </span>
          </button>
        ))}
        <div className="navlabel">AUTONOMY</div>
        <Link className="nav" href="/profile" onClick={confirmLeave}>
          <FileText size={18} />
          Profile
        </Link>
        <Link className="nav" href="/review" onClick={confirmLeave}>
          <Sparkles size={18} />
          Review drafts
        </Link>
        <Link className="nav" href="/preferences" onClick={confirmLeave}>
          <Scale size={18} />
          Preferences
        </Link>
        <Link className="nav" href="/plan" onClick={confirmLeave}>
          <Target size={18} />
          This week
        </Link>
        <Link className="nav" href="/track" onClick={confirmLeave}>
          <Activity size={18} />
          Track outcomes
        </Link>
        <div className="sidebottom">
          <div className="dot" /> History stays with the job.
          <p>
            Your research, connected
            <br />
            No live sending connected
          </p>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">CAREER / REVIEW</span>
            <h1>Make your next move.</h1>
            <p>One opportunity. One history. A clear next action.</p>
          </div>
          <button
            className="secondary"
            onClick={() => setShowImport(!showImport)}
          >
            <Upload size={16} />
            Import research
          </button>
        </header>
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
            <small>Evidence before action</small>
          </div>
          <div>
            <span>History preserved</span>
            <strong>
              {(sources.length - jobs.length).toString().padStart(2, '0')}
            </strong>
            <small>Repeat records consolidated</small>
          </div>
          <div className="stataccent">
            <ShieldCheck size={22} />
            <b>Decisions carry forward.</b>
            <small>Rediscovery never resets a submitted job.</small>
          </div>
        </section>
        {message && (
          <div className="notice" aria-live="polite">
            {message}
          </div>
        )}
        {signedOut ? (
          <section className="welcome">
            <h2>Your private workspace</h2>
            <p>Sign in to load and save your application history.</p>
            {/* oxlint-disable-next-line next/no-html-link-for-pages -- Sites authentication requires top-level navigation. */}
            <a
              className="primary"
              href="/signin-with-chatgpt?return_to=/"
              target="_top"
            >
              Sign in with ChatGPT <ArrowRight size={16} />
            </a>
          </section>
        ) : loaded && jobs.length === 0 ? (
          <section className="welcome">
            <span className="eyebrow">START WITH YOUR REAL WORK</span>
            <h2>Bring the history with you.</h2>
            <p>
              Import your research or explore fictional examples. Relay keeps
              earlier submissions, notes and blockers attached to each job.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => run({ action: 'bootstrap' })}
            >
              Explore example jobs <ArrowRight size={16} />
            </button>
            <small>Example companies and records are fictional.</small>
          </section>
        ) : !loaded ? (
          <p aria-live="polite">Opening your workspace…</p>
        ) : null}
        {!signedOut && loaded && (
          <TrackerImport
            onImported={() =>
              mutationIsLive(sessionRef.current.gate, { epoch: workspaceEpoch })
                ? refresh()
                : Promise.resolve()
            }
            onUnauthorized={() => {
              expireSession(sessionRef.current);
              applyExpired();
            }}
          />
        )}
        {!signedOut && (
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
            openImport={() => setShowImport(true)}
          />
        )}
        {showImport && !signedOut && (
          <section className="import">
            <h2>Import research</h2>
            <p>
              Review the selected research below, then preview its matches
              before saving. Importing adds these notes to your Relay workspace.
            </p>
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
            <div className="actions">
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
                >
                  {action === 'import'
                    ? 'Import into workspace'
                    : 'Preview matches'}
                </button>
              ))}
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
        {jobs.length > 0 && !signedOut && (
          <>
            <section className="replay">
              <GitMerge size={20} />
              <div>
                <b>Put the next hunt through its history.</b>
                <p>
                  Check example research against this workspace. Find repeats
                  before doing the work twice.
                </p>
              </div>
              <button
                disabled={busy}
                className="secondary"
                onClick={() => run({ action: 'replay' })}
              >
                Check examples <ArrowRight size={16} />
              </button>
            </section>
            <div className="workgrid">
              <section className="queue">
                <div className="queuehead">
                  <h2>
                    {filter === 'Held'
                      ? 'Review queue'
                      : filter === 'Ready'
                        ? 'Accepted drafts'
                        : filter === 'All'
                          ? 'All opportunities'
                          : filter}
                  </h2>
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
                      <span className="eyebrow">OPPORTUNITY RECORD</span>
                      <span className="badge">
                        Relay status: {current.status}
                      </span>
                      <h2>{current.name}</h2>
                      {current.url && (
                        <a href={current.url} target="_blank" rel="noreferrer">
                          Open employer posting <ArrowUpRight size={15} />
                        </a>
                      )}
                    </div>
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
                    {protectedState && (
                      <div className="actions">
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
                      <div className="actions">
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
                      Acceptance saves this version. It does not send or submit
                      anything.
                    </small>
                    <h3>Posting vs verified facts</h3>
                    <small className="muted">
                      Coverage of source notes by facts you verified. Not an
                      employer score, and it does not change status.
                    </small>
                    {fit?.reason === 'notes' && (
                      <p className="muted">
                        No required lines found in source notes. Import the
                        posting text as research before comparing.
                      </p>
                    )}
                    {fit?.reason === 'facts' && (
                      <p className="muted">
                        Verify facts on Profile to compare them with this
                        posting. Proposed facts are not used.
                      </p>
                    )}
                    {fit && fit.gates.length > 0 && (
                      <ul className="gates">
                        {fit.gates.map((gate) => (
                          <li key={gate.text}>
                            <span className="badge">
                              {gate.status[0].toUpperCase() + gate.status.slice(1)}
                            </span>
                            {gate.text}
                          </li>
                        ))}
                      </ul>
                    )}
                    {fit?.gates.some((gate) => gate.status === 'miss') && (
                      <small className="muted">
                        A miss is a reason to set this job aside or to verify a
                        real fact, not to invent a skill.
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
                    <h2>
                      Good decisions start
                      <br />
                      with the whole picture.
                    </h2>
                    <p>
                      Select a role to see its previous research, resolve a
                      blocker and prepare the exact text you want to use.
                    </p>
                    <div>
                      <span>01</span> Read the evidence
                    </div>
                    <div>
                      <span>02</span> Resolve the exception
                    </div>
                    <div>
                      <span>03</span> Accept a specific draft
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
        <footer>
          Relay / SyberLabs{' '}
          <span>Working version · Research and preparation</span>
        </footer>
      </main>
    </div>
  );
}
