'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRelayTools } from './agent-tools';
import { Connections } from './connections';
import {
  acknowledgeSave,
  applyLoadedDraft,
  canSave,
  loadEditor,
  reconcileEditor,
  type Editor,
  type SaveSnapshot,
} from '../lib/editor';
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
} from 'lucide-react';
type Job = {
  id: string;
  job_key: string;
  name: string;
  url: string;
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
type Reply = {
  jobs: Job[];
  sources: Source[];
  events: ReviewEvent[];
  error?: string;
} & Report;
export default function Workspace() {
  const [jobs, setJobs] = useState<Job[]>([]),
    [sources, setSources] = useState<Source[]>([]),
    [events, setEvents] = useState<ReviewEvent[]>([]),
    [editor, setEditor] = useState<Editor | null>(null),
    [filter, setFilter] = useState('Held'),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [signedOut, setSignedOut] = useState(false),
    [loaded, setLoaded] = useState(false),
    [report, setReport] = useState<Report | null>(null),
    [importText, setImportText] = useState(''),
    [showImport, setShowImport] = useState(false);
  const selected = editor?.jobId ?? '',
    draft = editor?.draft ?? '',
    blocker = editor?.blocker ?? '',
    current = jobs.find((j) => j.id === selected),
    visible = jobs.filter(
      (j) =>
        (filter === 'All' || j.status === filter) &&
        j.name.toLowerCase().includes(search.toLowerCase()),
    );
  const refresh = useCallback(async (saved?: SaveSnapshot) => {
    const r = await fetch('/api/workspace');
    const data = (await r.json()) as Reply;
    if (r.status === 401) {
      setSignedOut(true);
      setLoaded(true);
      return;
    }
    if (!r.ok) throw Error(data.error);
    setJobs(data.jobs);
    setSources(data.sources);
    setEvents(data.events);
    setEditor((e) => {
      const next = e && saved ? acknowledgeSave(e, saved) : e;
      return reconcileEditor(
        next,
        data.jobs.find((j) => j.id === next?.jobId),
      );
    });
    setLoaded(true);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e) => {
        setMessage(e.message);
        setLoaded(true);
      });
  }, [refresh]);
  async function run(body: Record<string, unknown>, saved?: SaveSnapshot) {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as Reply;
      if (!r.ok) {
        if (saved && r.status === 409) await refresh();
        throw Error(data.error);
      }
      if (data.items) setReport(data);
      await refresh(saved);
      setMessage(
        body.action === 'save'
          ? 'Saved. Your review is preserved.'
          : body.action === 'replay'
            ? 'Replay complete. No records changed.'
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
      current && ['Submitted', 'Live loop'].includes(current.status),
    blocked = busy || !editor || !canSave(editor);
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
            ['All', 'All opportunities', History],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            className={'nav ' + (filter === v ? 'active' : '')}
            key={v}
            onClick={() => {
              setFilter(v);
              setEditor(null);
            }}
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
        {!signedOut && (
          <Connections
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
            onDraft={(value, started) => {
              setEditor((e) => applyLoadedDraft(e, value, started));
            }}
            onImport={setImportText}
            openImport={() => setShowImport(true)}
          />
        )}
        {showImport && (
          <section className="import">
            <h2>Import research</h2>
            <p>
              Paste a JSON array with url, Name, Job, Status and Notes. Preview
              checks the existing queue before saving.
            </p>
            <textarea
              aria-label="Research JSON"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='[{"url":"source-record-id","Name":"Company — Role","Job":"https://…","Status":"Held","Notes":"…"}]'
            />
            <div className="actions">
              {['preview', 'import'].map((action) => (
                <button
                  className={action === 'import' ? 'primary' : 'secondary'}
                  disabled={busy}
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
        {jobs.length > 0 && (
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
            {report && (
              <section className="report">
                <div>
                  <b>Research check</b>
                  <button
                    className="textbutton"
                    onClick={() => setReport(null)}
                  >
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
                      onClick={() => setEditor(loadEditor(j))}
                    >
                      <span className="companyicon">{j.name[0]}</span>
                      <span className="jobtext">
                        <b>{j.name}</b>
                        <small>
                          {j.blocker
                            ? 'Needs attention'
                            : j.status === 'Held'
                              ? 'Review fit & prepare draft'
                              : j.status === 'Ready'
                                ? 'Exact draft accepted'
                                : j.status}
                        </small>
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
                      <span className="badge">{current.status}</span>
                      <h2>{current.name}</h2>
                      {current.url && (
                        <a href={current.url} target="_blank" rel="noreferrer">
                          Open employer posting <ArrowUpRight size={15} />
                        </a>
                      )}
                    </div>
                    {protectedState && (
                      <div className="notice">
                        You can edit notes and follow-up drafts. Saving keeps
                        this job’s{' '}
                        {current.status === 'Live loop'
                          ? 'interview'
                          : 'submitted'}{' '}
                        status.
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
                          disabled={blocked}
                          onClick={() => save('Held')}
                        >
                          Save draft
                        </button>
                        <button
                          className="primary"
                          disabled={
                            blocked || !draft.trim() || !!blocker.trim()
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
                    <h3>Source history</h3>
                    {sources
                      .filter((s) => s.job_key === current.job_key)
                      .map((s) => (
                        <article className="source" key={s.id}>
                          <b>{s.name}</b>
                          <span className="badge">{s.status}</span>
                          <p>{s.notes || 'No source notes recorded.'}</p>
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
