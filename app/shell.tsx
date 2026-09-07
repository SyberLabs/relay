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
  type QueueFilter,
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
  '/profile': FileText,
  '/track': Activity,
  '/advanced': Settings2,
} as const;

export function AppShell({
  children,
  current,
  filter,
  counts,
  onFilter,
  onNavigate,
}: {
  children: ReactNode;
  current: ShellPage;
  filter?: string;
  counts?: { total: number; byStatus: Record<string, number> };
  onFilter?: (value: QueueFilter) => void;
  onNavigate?: (event: { preventDefault: () => void }) => void;
}) {
  const onWorkspace = current === 'workspace';
  const showJobList = !onWorkspace || (counts?.total ?? 0) > 0;
  const pageLink = (
    item: (typeof PORTFOLIO_PAGE_LINKS)[number] | (typeof CONTEXT_PAGE_LINKS)[number],
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
    <div className="shell">
      <a className="skip" href="#workspace-main">
        Skip to main content
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/" onClick={onNavigate}>
          <span className="mark">r</span>relay<span className="beta">01</span>
        </Link>
        {showJobList ? (
          <fieldset aria-describedby="nav-queue-hint" className="navset">
            <legend className="navlabel" id="nav-queue-label">
              Job list
            </legend>
            <p className="navhint" id="nav-queue-hint">
              {onWorkspace
                ? 'Choose which job to continue. Review and accept happen on the selected job.'
                : 'Opens the workspace and shows that job list.'}
            </p>
            {QUEUE_FILTERS.map((item) => {
              const Icon = queueIcons[item.value];
              const count =
                item.value === 'All'
                  ? (counts?.total ?? 0)
                  : (counts?.byStatus[item.value] ?? 0);
              const className =
                'nav nav-filter' +
                (onWorkspace && filter === item.value ? ' active' : '');
              if (onWorkspace && onFilter)
                return (
                  <button
                    aria-controls="workspace-queue"
                    aria-pressed={filter === item.value}
                    className={className}
                    key={item.value}
                    onClick={() => onFilter(item.value)}
                    type="button"
                  >
                    <Icon size={18} />
                    {item.label}
                    <span className="nav-end">{count}</span>
                  </button>
                );
              return (
                <Link
                  className={className}
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
            Record what happened after you submitted. This is not the draft
            review step.
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
        <div className="sidebottom">
          <p>Does not send applications.</p>
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
