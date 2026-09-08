'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import './runtime.css';

export function RuntimeShell({
  children,
  onNavigate,
  lead,
  live,
  stateText,
  stateKind,
  autopilot,
  onAutopilot,
  showAddJob,
  addJobPrimary,
  onAddJob,
  importOpen,
  onImport,
  importDisabled,
  logTime,
  logLine,
  onProfile,
  onTools,
  onResearch,
  onHistory,
  historyOpen,
}: {
  children: ReactNode;
  onNavigate?: (event: { preventDefault: () => void }) => void;
  lead: string;
  live: boolean;
  stateText: string;
  stateKind?: 'live' | 'off' | 'idle';
  autopilot: boolean;
  onAutopilot: () => void;
  showAddJob: boolean;
  addJobPrimary: boolean;
  onAddJob: () => void;
  importOpen: boolean;
  onImport: () => void;
  importDisabled?: boolean;
  logTime: string;
  logLine: string;
  onProfile: () => void;
  onTools: () => void;
  onResearch: () => void;
  onHistory: () => void;
  historyOpen?: boolean;
}) {
  const lamp = stateKind || (live ? 'live' : 'idle');
  return (
    <div className={'runtime' + (live ? ' working' : ' idle')}>
      <a className="skip" href="#workspace-main">
        Skip to main content
      </a>
      <header className="bar">
        <div>
          <p className="wordmark" aria-hidden="true">
            Relay <span>/ workbench</span>
          </p>
          <h1 className="sr-only">Workspace</h1>
          <p>{lead}</p>
        </div>
        <div
          className={
            'state' + (lamp === 'live' ? ' live' : lamp === 'off' ? ' off' : '')
          }
          id="runtime-state"
        >
          <span className="lamp" />
          <span>{stateText}</span>
        </div>
        <aside className="bar-nav">
          <Link href="/track" onClick={onNavigate}>
            Track jobs
          </Link>
        </aside>
        <div className="bar-right">
          {showAddJob ? (
            <button
              className={addJobPrimary ? 'primary' : 'secondary'}
              onClick={onAddJob}
              type="button"
            >
              Add job
            </button>
          ) : null}
          <button
            aria-controls="import-dock"
            aria-expanded={importOpen}
            aria-label="Import research"
            className="secondary"
            disabled={importDisabled}
            onClick={onImport}
            type="button"
          >
            <Upload size={16} />
            Find more jobs
          </button>
          <button className="textbtn" onClick={onProfile} type="button">
            Profile
          </button>
          <button className="textbtn" onClick={onTools} type="button">
            Tools
          </button>
          <button className="textbtn" onClick={onResearch} type="button">
            Research
          </button>
          <button
            aria-pressed={historyOpen}
            className="textbtn"
            onClick={onHistory}
            type="button"
          >
            History
          </button>
          <button
            aria-pressed={autopilot}
            className="toggle"
            onClick={onAutopilot}
            type="button"
          >
            <span className="track">
              <span className="knob" />
            </span>
            Autopilot
          </button>
        </div>
      </header>
      {children}
      <div className="log">
        <span className="stamp mono">{logTime}</span>
        <span className="now">{logLine}</span>
        <Link href="/privacy" onClick={onNavigate}>
          How Relay uses your data
        </Link>
      </div>
    </div>
  );
}
