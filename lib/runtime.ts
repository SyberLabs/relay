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

export function draftProgress(job: {
  status: string;
  draft: string;
  accepted_draft: string | null;
  blocker: string;
}): { pct: number; label: string; step: string } {
  if (
    job.status === 'Submitted' ||
    job.status === 'Live loop' ||
    isTerminal(job.status)
  )
    return {
      pct: 100,
      label: 'recorded',
      step: 'This application is already on file.',
    };
  if (job.status === 'Skip')
    return {
      pct: 0,
      label: 'set aside',
      step: 'This job is set aside.',
    };
  if (job.status === 'Ready' || job.accepted_draft)
    return {
      pct: 100,
      label: 'draft ready',
      step: 'Exact draft accepted. Nothing has been sent.',
    };
  if (job.blocker.trim())
    return {
      pct: 40,
      label: 'blocked',
      step: 'Waiting on your answer before the draft can be accepted.',
    };
  if (job.draft.trim())
    return {
      pct: 70,
      label: 'in review',
      step: 'Draft saved. Review and accept the exact wording.',
    };
  return {
    pct: 15,
    label: 'opened',
    step: 'No draft yet. Import research or ask an assistant to write.',
  };
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
