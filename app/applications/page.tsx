'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type {
  ApplicationOperation,
  ApplicationPolicy,
  SubmissionManifest,
} from '../../lib/application-automation';
import { digest } from '../../lib/application-automation';
import { ApplicationPermissions } from './permissions';
import { ApplicationEvidence } from './evidence';
import { ProductShell } from '../shell';
import './applications.css';

type Job = {
  id: string;
  name: string;
  status: string;
  version: number;
  url: string;
};
type Snapshot = {
  viewer: string;
  policy: ApplicationPolicy | null;
  jobs: Job[];
  operations: ApplicationOperation[];
  next: string | null;
};
export default function Applications() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [jobVersion, setJobVersion] = useState(0);
  const [selected, setSelected] = useState<ApplicationOperation | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const owner = useRef<string | null>(null);
  const stopped = useRef(false);
  const [jobId, setJobId] = useState(''),
    [actor, setActor] = useState('ChatGPT');
  const [destination, setDestination] = useState('');
  const [fields, setFields] = useState([{ label: 'Full name', value: '' }]);
  const [files, setFiles] = useState<SubmissionManifest['files']>([]);
  const [filesReady, setFilesReady] = useState(true);
  const [receipt, setReceipt] = useState('');
  const operationId = useRef('');
  const fileGeneration = useRef(0);
  const preparation = useRef<HTMLDetailsElement>(null);
  const evidence = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) evidence.current?.focus();
  }, [selected]);
  const request = useCallback(async (url: string, body?: unknown) => {
    if (stopped.current) throw Error('Session changed. Reload to continue.');
    const r = await fetch(
      url,
      body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    if (r.status === 401) {
      stopped.current = true;
      setSnapshot(null);
      setSelected(null);
      setFields([]);
      setFiles([]);
      setReceipt('');
      setExpired(true);
      throw Error('Sign in again to continue.');
    }
    const b = (await r.json()) as Snapshot & {
      operation: ApplicationOperation;
      execute?: boolean;
      error?: string;
    };
    if (stopped.current) throw Error('Session changed. Reload to continue.');
    if (b.viewer && owner.current && b.viewer !== owner.current) {
      stopped.current = true;
      setSnapshot(null);
      setSelected(null);
      setFields([]);
      setFiles([]);
      setReceipt('');
      setExpired(true);
      throw Error('Account changed. Reload to continue.');
    }
    if (b.viewer) owner.current = b.viewer;
    if (!r.ok)
      throw Error(
        b.error ||
          'Request could not be confirmed. Inspect history before continuing.',
      );
    return b;
  }, []);
  const refresh = useCallback(
    async (after = '') => {
      const b: Snapshot = await request(
        `/api/applications?after=${encodeURIComponent(after)}`,
      );
      setSnapshot(b);
      return b;
    },
    [request],
  );
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((e) => setMessage(e.message));
  }, [refresh]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Unable to confirm the action.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string) {
    if (!selected || !snapshot) return;
    await run(async () => {
      const result = await request('/api/applications', {
        action,
        viewer: snapshot.viewer,
        id: selected.id,
        digest: selected.digest,
        receipt,
      });
      setSelected(result.operation);
      setMessage(
        result.execute
          ? 'Execution permitted once. Perform this exact application now. If interrupted or uncertain, inspect employer state; never submit again.'
          : 'Saved.',
      );
      await refresh();
    });
  }
  return (
    <ProductShell current="applications">
      <div className="applications-page">
        <Link className="applications-back" href="/">
          <ArrowLeft size={16} aria-hidden="true" />
          Workspace
        </Link>
        <header className="applications-header">
          <div>
            <h1>Applications</h1>
            <p>
              Let your assistants prepare applications. Review what goes out.
            </p>
          </div>
          <button
            className="application-primary"
            type="button"
            disabled={!snapshot || busy || expired}
            aria-controls="application-preparation"
            onClick={() => {
              if (!preparation.current) return;
              preparation.current.open = true;
              preparation.current.querySelector('summary')?.focus();
              preparation.current.scrollIntoView({ block: 'start' });
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Prepare application
          </button>
        </header>
        {message && <output className="application-message">{message}</output>}
        {expired ? (
          <Link href="/signin-with-chatgpt?return_to=/applications">
            Sign in again
          </Link>
        ) : !snapshot ? (
          <p className="application-empty">Loading applications…</p>
        ) : (
          <>
            <ApplicationPermissions
              policy={snapshot.policy}
              jobs={snapshot.jobs}
              busy={busy}
              run={run}
              save={async (input) => {
                const saved = await request('/api/applications', {
                  ...input,
                  action: 'policy',
                  viewer: snapshot.viewer,
                });
                await refresh();
                setMessage(
                  'Permissions saved. Earlier proposals need fresh permission.',
                );
                return saved.policy!;
              }}
            />
            <section aria-labelledby="application-history-heading">
              <div className="application-history-header">
                <h2 id="application-history-heading">
                  History and review{' '}
                  <span
                    className="application-count"
                    aria-label={`${snapshot.operations.length} records on this page`}
                  >
                    {snapshot.operations.length}
                  </span>
                </h2>
                <button
                  className="application-refresh"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await refresh();
                    })
                  }
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Refresh history
                </button>
              </div>
              {snapshot.operations.length === 0 && (
                <div className="application-empty">
                  <BriefcaseBusiness size={24} aria-hidden="true" />
                  <h3>No application proposals yet.</h3>
                  <p>
                    Prepare an application to start a record of exactly what
                    will be sent.
                  </p>
                </div>
              )}
              <ul className="application-history">
                {snapshot.operations.map((op) => {
                  const name =
                    snapshot.jobs.find((j) => j.id === op.job_id)?.name ||
                    'Application';
                  return (
                    <li className="application-card" key={op.id}>
                      <div className="application-card-body">
                        <span className="application-mark">
                          <BriefcaseBusiness size={22} aria-hidden="true" />
                        </span>
                        <div className="application-card-title">
                          <h3>{name}</h3>
                          <span
                            className="application-state"
                            data-state={op.state}
                          >
                            {op.state === 'submitted' && (
                              <Check size={13} aria-hidden="true" />
                            )}
                            {op.state.replaceAll('-', ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="application-card-footer">
                        <span className="application-actor">
                          <Bot size={16} aria-hidden="true" />
                          {op.actor}
                        </span>
                        <button
                          aria-label={`View record for ${name}`}
                          aria-expanded={selected?.id === op.id}
                          aria-controls="application-record"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const b = await request(
                                `/api/applications?id=${encodeURIComponent(op.id)}`,
                              );
                              setSelected(b.operation);
                              setReceipt('');
                            })
                          }
                        >
                          View record{' '}
                          <ArrowUpRight size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {snapshot.next && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await refresh(snapshot.next!);
                    })
                  }
                >
                  Next page
                </button>
              )}
              <p className="application-note">
                Each assistant uses its own signed-in browser. Agent names and
                employer confirmations are reported by the operator.
              </p>
              {selected && (
                <article
                  className="application-record"
                  id="application-record"
                  aria-label="Application record"
                  tabIndex={-1}
                  ref={evidence}
                >
                  <div className="application-record-heading">
                    Application record
                  </div>
                  <ApplicationEvidence
                    selected={selected}
                    name={
                      snapshot.jobs.find((j) => j.id === selected.job_id)?.name
                    }
                  />
                  {selected.state === 'proposed' && (
                    <button
                      className="application-primary"
                      disabled={busy}
                      onClick={() => void act('approve')}
                    >
                      Approve this exact application
                    </button>
                  )}
                  {selected.state === 'authorized' && (
                    <button
                      className="application-primary"
                      disabled={busy}
                      onClick={() => void act('begin')}
                    >
                      Begin this application once
                    </button>
                  )}
                  {['proposed', 'authorized'].includes(selected.state) && (
                    <button disabled={busy} onClick={() => void act('cancel')}>
                      Cancel proposal
                    </button>
                  )}
                  {['executing', 'uncertain'].includes(selected.state) && (
                    <div>
                      <p>
                        Do not submit again. Check the employer’s page or
                        confirmation before recording the result.
                      </p>
                      <label>
                        Employer confirmation or reason for uncertainty
                        <textarea
                          value={receipt}
                          onChange={(e) => setReceipt(e.target.value)}
                          maxLength={10000}
                        />
                      </label>
                      <button
                        disabled={busy || !receipt.trim()}
                        onClick={() => void act('complete')}
                      >
                        Record confirmed submission
                      </button>
                      {selected.state === 'executing' && (
                        <button
                          disabled={busy || !receipt.trim()}
                          onClick={() => void act('uncertain')}
                        >
                          Record uncertain outcome
                        </button>
                      )}
                      <button
                        disabled={busy || !receipt.trim()}
                        onClick={() => void act('not-submitted')}
                      >
                        Confirm no application was submitted
                      </button>
                      <p>
                        Use this only after verifying no submission occurred.
                        The evidence stays saved; a fresh proposal can then be
                        prepared.
                      </p>
                    </div>
                  )}
                </article>
              )}
            </section>
            <details
              className="application-preparation"
              id="application-preparation"
              ref={preparation}
            >
              <summary>
                <Plus size={17} aria-hidden="true" />
                Prepare an application
                <ChevronRight
                  className="application-chevron"
                  size={16}
                  aria-hidden="true"
                />
              </summary>
              <div className="application-form-body">
                <p>
                  Save every field and exact file before entering or uploading
                  information at the employer. Unknown answers require input.
                  The saved proposal cannot be edited.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const job = snapshot.jobs.find((j) => j.id === jobId);
                      if (!filesReady)
                        throw Error('Finish selecting files before saving.');
                      if (!job) throw Error('Choose a job.');
                      operationId.current ||= crypto.randomUUID();
                      const b = await request('/api/applications', {
                        action: 'propose',
                        viewer: snapshot.viewer,
                        id: operationId.current,
                        job: job.id,
                        version: jobVersion,
                        actor,
                        manifest: { destination, fields, files },
                      });
                      setSelected(b.operation);
                      operationId.current = '';
                      await refresh();
                      setMessage('Exact proposal saved.');
                    });
                  }}
                >
                  <p>
                    <label>
                      Job{' '}
                      <select
                        required
                        value={jobId}
                        onChange={(e) => {
                          setJobId(e.target.value);
                          setJobVersion(
                            snapshot.jobs.find((j) => j.id === e.target.value)
                              ?.version || 0,
                          );
                          setDestination(
                            snapshot.jobs.find((j) => j.id === e.target.value)
                              ?.url || '',
                          );
                        }}
                      >
                        <option value="">Choose a saved job</option>
                        {snapshot.jobs
                          .filter((j) => ['Held', 'Ready'].includes(j.status))
                          .map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </p>
                  <p>
                    <label>
                      Agent name{' '}
                      <input
                        required
                        maxLength={100}
                        value={actor}
                        onChange={(e) => setActor(e.target.value)}
                      />
                    </label>
                  </p>
                  <p>
                    <label>
                      Employer application URL{' '}
                      <input
                        type="url"
                        required
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                      />
                    </label>
                  </p>
                  {fields.map((f, i) => (
                    <fieldset key={i}>
                      <legend>Field {i + 1}</legend>
                      <label>
                        Question or field label{' '}
                        <input
                          required
                          value={f.label}
                          maxLength={300}
                          onChange={(e) =>
                            setFields(
                              fields.map((x, n) =>
                                n === i ? { ...x, label: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Exact answer{' '}
                        <textarea
                          value={f.value}
                          maxLength={20000}
                          onChange={(e) =>
                            setFields(
                              fields.map((x, n) =>
                                n === i ? { ...x, value: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    disabled={fields.length >= 100 || busy}
                    onClick={() =>
                      setFields([...fields, { label: '', value: '' }])
                    }
                  >
                    Add field
                  </button>
                  <p>
                    <label>
                      Exact files (up to two, 160 KB each){' '}
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const chosen = Array.from(e.target.files || []);
                          const generation = ++fileGeneration.current;
                          setFilesReady(false);
                          setFiles([]);
                          void run(async () => {
                            if (
                              chosen.length > 2 ||
                              chosen.some((f) => f.size > 160000)
                            )
                              throw Error(
                                'Choose up to two files, 160 KB each.',
                              );
                            const prepared = await Promise.all(
                              chosen.map(async (file) => {
                                const bytes = new Uint8Array(
                                  await file.arrayBuffer(),
                                );
                                return {
                                  name: file.name,
                                  base64: btoa(
                                    Array.from(bytes, (b) =>
                                      String.fromCharCode(b),
                                    ).join(''),
                                  ),
                                  sha256: await digest(bytes),
                                };
                              }),
                            );
                            if (
                              !stopped.current &&
                              generation === fileGeneration.current
                            ) {
                              setFiles(prepared);
                              setFilesReady(true);
                            }
                          });
                        }}
                      />
                    </label>
                  </p>
                  <p>{files.map((f) => f.name).join(', ')}</p>
                  {!filesReady && <p>Finish selecting files before saving.</p>}
                  <button
                    className="application-primary"
                    disabled={busy || !filesReady}
                  >
                    Save exact proposal
                  </button>
                </form>
              </div>
            </details>
          </>
        )}
      </div>
    </ProductShell>
  );
}
