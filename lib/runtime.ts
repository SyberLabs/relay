import { displayName } from './domain.ts';
import type { Gate } from './fit.ts';
import { isTerminal } from './outcomes.ts';

export type RuntimeJob = {
  id: string;
  name: string;
  status: string;
  blocker: string;
  draft: string;
  accepted_draft: string | null;
  url?: string | null;
  company?: string;
  location?: string;
  remote?: string;
  source?: string;
  comp_min?: number | null;
  comp_max?: number | null;
};

export function splitJobName(name: string): { role: string; org: string } {
  const cleaned = displayName(name);
  const parts = cleaned.split(/\s+[—–-]\s+/);
  if (parts.length >= 2)
    return { org: parts[0]!, role: parts.slice(1).join(' — ') };
  return { org: '', role: cleaned };
}

export function formatPay(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (!min && !max) return 'not listed';
  const money = (n: number) => '$' + Math.round(n / 1000) + 'k';
  if (min && max && min !== max) return `${money(min)} – ${money(max)}`;
  return money((max ?? min)!);
}

export function formatLocation(
  location: string | undefined,
  remote: string | undefined,
): string {
  const loc = (location || '').trim();
  const rem = (remote || '').trim();
  if (loc && rem && rem !== loc)
    return rem === 'onsite' ? loc : `${loc}, ${rem}`;
  if (loc) return loc;
  if (rem) return rem;
  return 'not listed';
}

export function sourceLabel(
  source: string | undefined,
  url: string | null | undefined,
): string {
  if (source && source.trim()) return source.trim();
  if (!url) return 'saved job';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'saved job';
  }
}

export type InspectReadiness = {
  ready: boolean;
  armed: boolean;
  accept_enabled: boolean;
  state: string | null;
  fields?: { unknown: boolean }[];
  recorded_result?: 'submitted' | 'uncertain' | 'not-submitted' | null;
  recorded_receipt?: string | null;
} | null;

export type ApplicationReviewKind =
  | 'preparing'
  | 'needs_answer'
  | 'draft_only'
  | 'ready_for_approval'
  | 'disconnected'
  | 'authorized'
  | 'sending'
  | 'submitted'
  | 'uncertain'
  | 'not_sent'
  | 'ended';

function inspectOutcome(
  inspect: InspectReadiness,
): 'submitted' | 'uncertain' | 'not-submitted' | null {
  const recorded = inspect?.recorded_result;
  if (
    recorded === 'submitted' ||
    recorded === 'uncertain' ||
    recorded === 'not-submitted'
  )
    return recorded;
  if (inspect?.state === 'submitted') return 'submitted';
  if (inspect?.state === 'uncertain') return 'uncertain';
  if (inspect?.state === 'cancelled') return 'not-submitted';
  return null;
}

function inspectHasPayload(inspect: InspectReadiness): boolean {
  if (!inspect) return false;
  return Boolean(
    inspect.ready || inspect.accept_enabled || inspect.fields?.length,
  );
}

export function applicationReviewKind(
  job: {
    status: string;
    blocker: string;
    draft: string;
    accepted_draft: string | null;
  },
  inspect: InspectReadiness,
): ApplicationReviewKind {
  const outcome = inspectOutcome(inspect);
  if (outcome === 'uncertain' || inspect?.state === 'uncertain')
    return 'uncertain';
  if (
    outcome === 'submitted' ||
    job.status === 'Submitted' ||
    job.status === 'Live loop'
  )
    return 'submitted';
  if (outcome === 'not-submitted') return 'not_sent';
  if (inspect?.state === 'executing') return 'sending';
  if (inspect?.state === 'authorized') return 'authorized';
  if (isTerminal(job.status)) return 'ended';
  const unknownField = inspect?.fields?.some((field) => field.unknown);
  if (unknownField || (job.blocker.trim() && job.status !== 'Skip'))
    return 'needs_answer';
  if (inspect?.accept_enabled) return 'ready_for_approval';
  if (
    inspect &&
    inspect.ready &&
    !inspect.armed &&
    inspect.state !== 'authorized' &&
    inspect.state !== 'executing' &&
    inspect.state !== 'submitted' &&
    inspect.state !== 'uncertain'
  )
    return 'disconnected';
  if (
    inspect &&
    !inspectHasPayload(inspect) &&
    (job.status === 'Ready' || job.accepted_draft)
  )
    return 'draft_only';
  return 'preparing';
}

export function applicationReviewCopy(kind: ApplicationReviewKind): {
  title: string;
  detail: string;
} {
  if (kind === 'ready_for_approval')
    return {
      title: 'Ready to send',
      detail: 'Your agent is connected',
    };
  if (kind === 'needs_answer')
    return {
      title: 'Needs an answer',
      detail: 'Fill the highlighted field to continue.',
    };
  if (kind === 'disconnected')
    return {
      title: 'Agent disconnected',
      detail: 'Reconnect your agent to continue',
    };
  if (kind === 'authorized')
    return {
      title: 'Approved, waiting for your agent to send',
      detail: 'Your agent has not started sending yet.',
    };
  if (kind === 'sending')
    return {
      title: 'Sending application',
      detail: 'Your agent is submitting the application you approved',
    };
  if (kind === 'submitted')
    return {
      title: 'Submission recorded',
      detail: 'Confirmation recorded by your agent',
    };
  if (kind === 'uncertain')
    return {
      title: 'Submission needs checking',
      detail:
        'Your agent could not confirm the result. Check before trying again.',
    };
  if (kind === 'not_sent')
    return {
      title: 'Not sent',
      detail: 'Your agent recorded that this was not sent.',
    };
  if (kind === 'ended')
    return {
      title: 'Application ended',
      detail: 'This record is closed. No send confirmation is on file.',
    };
  if (kind === 'draft_only')
    return {
      title: 'Draft saved',
      detail: 'The application form is not ready yet.',
    };
  return {
    title: 'Not prepared yet',
    detail: 'Ask your agent to prepare the destination, answers, and files.',
  };
}

export function workbenchQueue<
  T extends { id: string; name: string; status: string; blocker: string },
>(jobs: T[], search: string): { waiting: T[]; ledger: T[] } {
  const needle = search.trim().toLowerCase();
  const match = (job: T) => !needle || job.name.toLowerCase().includes(needle);
  const waiting = jobs.filter((job) => !isSentJob(job) && match(job));
  const ledger = jobs.filter((job) => isSentJob(job) && match(job));
  return { waiting, ledger };
}

export function queueRowHint(job: {
  status: string;
  blocker: string;
  accepted_draft?: string | null;
}) {
  if (isSentJob(job)) {
    if (job.status === 'Skip') return 'Set aside';
    if (job.status === 'Submitted' || job.status === 'Live loop')
      return 'Submitted';
    return job.status;
  }
  if (job.blocker.trim()) return 'Needs an answer';
  return 'In review';
}

export function isBlockedJob(job: { status: string; blocker: string }) {
  if (!job.blocker.trim()) return false;
  if (job.status === 'Skip' || isTerminal(job.status)) return false;
  if (job.status === 'Submitted' || job.status === 'Live loop') return false;
  return true;
}

export function isSentJob(job: { status: string }) {
  return (
    job.status === 'Submitted' ||
    job.status === 'Live loop' ||
    job.status === 'Skip' ||
    isTerminal(job.status)
  );
}

export function sentPip(status: string) {
  if (status === 'Skip') return 'no';
  if (status === 'Submitted' || status === 'Live loop' || isTerminal(status))
    return 'ok';
  return 'q';
}

export function runtimeLanes<
  T extends { id: string; status: string; blocker: string },
>(
  jobs: T[],
  selectedId: string,
  filter: string,
): { queue: T[]; sent: T[]; blocked: T[]; core: T | null } {
  const core = jobs.find((job) => job.id === selectedId) ?? null;
  const blocked = jobs.filter((job) => isBlockedJob(job));
  const blockedIds = new Set(blocked.map((job) => job.id));
  const sent = jobs.filter((job) => isSentJob(job));
  const sentIds = new Set(sent.map((job) => job.id));
  const queue = jobs.filter((job) => {
    if (blockedIds.has(job.id)) return false;
    if (filter === 'All') return !sentIds.has(job.id);
    return job.status === filter;
  });
  return { queue, sent, blocked, core };
}

export function jobsMatchingQueue<T extends { status: string }>(
  jobs: T[],
  filter: string,
): T[] {
  if (filter === 'All') return jobs;
  return jobs.filter((job) => job.status === filter);
}

export type SheetJob = { id: string; name: string; status: string };

export function asSheetJobs(jobs: unknown): SheetJob[] {
  if (!Array.isArray(jobs)) return [];
  const rows: SheetJob[] = [];
  for (const item of jobs) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { id?: unknown; name?: unknown; status?: unknown };
    if (typeof row.id !== 'string' || !row.id.trim() || row.id.length > 200)
      continue;
    if (typeof row.name !== 'string' || typeof row.status !== 'string')
      continue;
    rows.push({ id: row.id, name: row.name, status: row.status });
  }
  return rows;
}

export function whyPicked(
  sources: { notes: string }[],
  fit: { gates: Gate[] } | null,
): string {
  const hits = fit?.gates.filter((gate) => gate.status === 'hit').length ?? 0;
  if (hits)
    return `${hits} required line(s) overlap your confirmed facts. This is a heuristic word and number match, not a qualification score.`;
  const notes = sources.find((source) => source.notes.trim())?.notes.trim();
  if (notes) return notes.length > 320 ? notes.slice(0, 317) + '…' : notes;
  return 'This job is in your workspace. Import posting text to compare requirements with your facts.';
}

export function ctxTally(facts: number, rules: number) {
  const parts = [];
  if (facts) parts.push(`${facts} fact${facts === 1 ? '' : 's'}`);
  if (rules) parts.push(`${rules} style rule${rules === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'no saved context yet';
}

export function policyExpiryIso(
  current: string | undefined,
  enabled: boolean,
  now = Date.now(),
) {
  const week = new Date(now + 7 * 86400000).toISOString();
  if (!enabled) return current || week;
  const stamp = current ? Date.parse(current) : Number.NaN;
  if (Number.isFinite(stamp) && stamp > now && stamp <= now + 30 * 86400000)
    return new Date(stamp).toISOString();
  return week;
}

export function boundedPolicyMaximum(value: number) {
  const n = Math.trunc(Number(value));
  if (!Number.isInteger(n)) return 8;
  return Math.min(100, Math.max(1, n));
}

export function policyJobIds(policy: { jobs?: string } | null | undefined) {
  if (!policy?.jobs) return [];
  try {
    const parsed = JSON.parse(policy.jobs) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 100);
  } catch {
    return [];
  }
}
