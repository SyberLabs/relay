'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Ellipsis, Upload } from 'lucide-react';
import { PRIMARY_PAGE_LINKS, pageIsCurrent } from '../lib/nav';
import { Lockup } from './lockup';
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
  historyDisabled,
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
  historyDisabled?: boolean;
}) {
  const lamp = stateKind || (live ? 'live' : 'idle');
  // Phones collapse the secondary actions behind one disclosure button; on
  // wider screens the same buttons sit inline and the toggle is hidden.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setMoreOpen(false);
      moreButton.current?.focus();
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        moreMenu.current?.contains(target) ||
        moreButton.current?.contains(target)
      )
        return;
      setMoreOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    moreMenu.current
      ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [moreOpen]);
  // Close before acting so a dialog opened by the action returns focus to the
  // visible More button instead of a hidden menu item.
  function pick(action: () => void) {
    return () => {
      if (moreOpen) {
        setMoreOpen(false);
        moreButton.current?.focus();
      }
      action();
    };
  }
  return (
    <div className={'runtime' + (live ? ' working' : ' idle')}>
      <a className="skip" href="#workspace-main">
        Skip to main content
      </a>
      <header className="bar">
        <div>
          <p className="wordmark" aria-hidden="true">
            <Lockup />
          </p>
          <h1 className="sr-only">Runtime</h1>
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
        <aside className="bar-nav" aria-label="Primary screens">
          {PRIMARY_PAGE_LINKS.map((item) => (
            <Link
              aria-current={
                pageIsCurrent('workspace', item.page) ? 'page' : undefined
              }
              href={item.href}
              key={item.href}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          ))}
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
            aria-controls="runtime-more"
            aria-expanded={moreOpen}
            className="secondary more-toggle"
            onClick={() => setMoreOpen((open) => !open)}
            ref={moreButton}
            type="button"
          >
            <Ellipsis aria-hidden="true" size={16} />
            More
          </button>
          <div
            className="bar-more"
            data-open={moreOpen ? 'true' : undefined}
            id="runtime-more"
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (
                moreOpen &&
                next &&
                !event.currentTarget.contains(next) &&
                !moreButton.current?.contains(next)
              )
                setMoreOpen(false);
            }}
            ref={moreMenu}
          >
            <button
              aria-controls="import-dock"
              aria-expanded={importOpen}
              aria-label="Import research"
              className="secondary"
              disabled={importDisabled}
              onClick={pick(onImport)}
              type="button"
            >
              <Upload aria-hidden="true" size={16} />
              Find more jobs
            </button>
            <button className="textbtn" onClick={pick(onProfile)} type="button">
              Profile
            </button>
            <button className="textbtn" onClick={pick(onTools)} type="button">
              Tools
            </button>
            <button
              className="textbtn"
              onClick={pick(onResearch)}
              type="button"
            >
              Research
            </button>
            <button
              aria-pressed={historyOpen}
              className="textbtn"
              disabled={historyDisabled}
              onClick={pick(onHistory)}
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
