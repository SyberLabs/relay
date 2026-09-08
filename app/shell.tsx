'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleOff,
  FileText,
  History,
  Inbox,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import {
  CONTEXT_PAGE_LINKS,
  PORTFOLIO_PAGE_LINKS,
  QUEUE_FILTERS,
  pageIsCurrent,
  queueHref,
  type ShellPage,
} from '../lib/nav';

const queueIcons = {
  Held: Inbox,
  Ready: Check,
  Submitted: ShieldCheck,
  'Live loop': BriefcaseBusiness,
  Skip: ArrowRight,
  Offer: Award,
  Accepted: BadgeCheck,
  Closed: CircleOff,
  All: History,
} as const;

const pageIcons = {
  '/applications': BriefcaseBusiness,
  '/profile': FileText,
  '/track': Activity,
  '/advanced': Settings2,
} as const;

export function ShellNav({
  current,
  onNavigate,
}: {
  current: ShellPage;
  onNavigate?: (event: { preventDefault: () => void }) => void;
}) {
  const pageLink = (
    item:
      | (typeof PORTFOLIO_PAGE_LINKS)[number]
      | (typeof CONTEXT_PAGE_LINKS)[number],
  ) => {
    const Icon = pageIcons[item.href];
    const active = pageIsCurrent(current, item.page);
    return (
      <Link
        aria-current={active ? 'page' : undefined}
        className={'nav nav-page' + (active ? ' active' : '')}
        href={item.href}
        key={item.href}
        onClick={onNavigate}
      >
        <Icon size={18} />
        {item.label}
        <ChevronRight className="nav-end" size={14} />
      </Link>
    );
  };
  return (
    <>
      {current !== 'track' ? (
        <fieldset aria-describedby="nav-queue-hint" className="navset">
          <legend className="navlabel" id="nav-queue-label">
            Job list
          </legend>
          <p className="navhint" id="nav-queue-hint">
            Opens Track and shows that job list.
          </p>
          {QUEUE_FILTERS.map((item) => {
            const Icon = queueIcons[item.value];
            return (
              <Link
                className="nav nav-filter"
                href={queueHref(item.value)}
                key={item.value}
                onClick={onNavigate}
              >
                <Icon size={18} />
                {item.label}
                <ChevronRight className="nav-end" size={14} />
              </Link>
            );
          })}
        </fieldset>
      ) : null}
      <fieldset aria-describedby="nav-outcomes-hint" className="navset">
        <legend className="navlabel" id="nav-outcomes-label">
          Outcomes
        </legend>
        <p className="navhint" id="nav-outcomes-hint">
          Track every job and record what happened after you submitted. This is
          not the draft review step.
        </p>
        {PORTFOLIO_PAGE_LINKS.map(pageLink)}
      </fieldset>
      <fieldset aria-describedby="nav-context-hint" className="navset">
        <legend className="navlabel" id="nav-context-label">
          Reusable context
        </legend>
        <p className="navhint" id="nav-context-hint">
          Optional facts and experimental tools. Not required to add a job.
        </p>
        {CONTEXT_PAGE_LINKS.map(pageLink)}
      </fieldset>
    </>
  );
}

export function AppShell({
  children,
  current,
  onNavigate,
}: {
  children: ReactNode;
  current: ShellPage;
  onNavigate?: (event: { preventDefault: () => void }) => void;
}) {
  return (
    <div className="shell">
      <a className="skip" href="#workspace-main">
        Skip to main content
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/" onClick={onNavigate}>
          Relay <span>workspace</span>
        </Link>
        <ShellNav current={current} onNavigate={onNavigate} />
        <div className="sidebottom">
          <p>External agents apply under your permissions.</p>
          <p>
            <Link href="/privacy" onClick={onNavigate}>
              How Relay uses your data
            </Link>
          </p>
        </div>
      </aside>
      {children}
    </div>
  );
}

export function ProductShell({
  current,
  children,
}: {
  current: ShellPage;
  children: ReactNode;
}) {
  return (
    <AppShell current={current}>
      <main className="productpage" id="workspace-main">
        {children}
      </main>
    </AppShell>
  );
}
