import { isTerminal } from './outcomes.ts';
export type SourceRow = {
  url: string;
  Name: string;
  Job: string | null;
  Status: string;
  Notes: string | null;
  createdTime?: string;
  // Structured attributes supplied by the read plane. Hand-written imports omit
  // them, so they are optional and every consumer defaults them.
  company?: string;
  level?: string;
  remote?: string;
  comp_min?: number | null;
  comp_max?: number | null;
  location?: string;
  size?: string;
  posted?: string | null;
  source?: string;
  effort?: number;
};
export const states = [
  'Held',
  'Ready',
  'Submitted',
  'Skip',
  'Live loop',
] as const;
export function jobKey(url: string | null, fallback: string): string {
  if (!url) return `source:${fallback}`;
  const u = new URL(url);
  if (!['https:', 'http:'].includes(u.protocol))
    throw Error('Use an HTTP or HTTPS job URL.');
  const gh = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)(?:\/|$)/);
  if (/^(job-boards|boards)\.greenhouse\.io$/.test(u.hostname) && gh)
    return `greenhouse:${gh[1]}:${gh[2]}`;
  u.hash = '';
  // Snapshot keys: deleting while iterating a live URLSearchParams iterator skips entries.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const k of [...u.searchParams.keys()])
    if (k.startsWith('utm_') || k === 'gh_src') u.searchParams.delete(k);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/$/, '') || '/';
  return u.toString();
}
export function packetKeyMatches(
  url: string | null | undefined,
  key: string,
): boolean {
  if (typeof key !== 'string' || !key) return false;
  if (url == null || url === '') return key.startsWith('source:');
  if (typeof url !== 'string') return false;
  try {
    return jobKey(url, '') === key;
  } catch {
    return false;
  }
}
export function displayName(n: string) {
  return n.replace(/^Hunt\d+\s*(?:#\d+)?\s*[—-]\s*/, '');
}
export function importedBlocker(n: string | null) {
  return n &&
    /do not (?:double-submit|retry|resubmit)|captcha|name.lock|doubled|invalid|clicked, never confirmed/i.test(
      n,
    )
    ? 'Prior attempt or restriction recorded. Read source history before continuing.'
    : '';
}
export function importedJobStatus(status: string) {
  return status === 'Ready' ? 'Held' : status;
}
export function mergeJobStatus(existing: string | undefined, incoming: string) {
  if (!existing) return importedJobStatus(incoming);
  // A job that has already ended stays ended. Terminal outcomes are recorded
  // locally and never appear in imported rows, so rediscovery cannot resurrect
  // a closed application.
  if (isTerminal(existing)) return existing;
  if (existing === 'Live loop' || incoming === 'Live loop') return 'Live loop';
  if (existing === 'Submitted' || incoming === 'Submitted') return 'Submitted';
  return existing;
}
export function classify(
  rows: SourceRow[],
  existing: { job_key: string; status: string }[],
) {
  const known = new Map(existing.map((j) => [j.job_key, j.status]));
  const out = {
    new: 0,
    known: 0,
    submitted: 0,
    items: [] as { name: string; kind: string; key: string }[],
  };
  for (const r of rows) {
    const key = jobKey(r.Job, r.url),
      s = known.get(key),
      kind = s === 'Submitted' ? 'submitted' : s ? 'known' : 'new';
    out[kind]++;
    out.items.push({ name: displayName(r.Name), kind, key });
    known.set(key, mergeJobStatus(s, r.Status));
  }
  return out;
}
export function validateRows(v: unknown): SourceRow[] {
  if (!Array.isArray(v) || !v.length || v.length > 200)
    throw Error('Import between 1 and 200 records.');
  return v.map((r) => {
    if (
      !r ||
      typeof r.url !== 'string' ||
      !r.url ||
      typeof r.Name !== 'string' ||
      !r.Name.trim() ||
      r.Name.length > 500 ||
      !states.includes(r.Status) ||
      !(r.Job === null || typeof r.Job === 'string') ||
      !(r.Notes == null || typeof r.Notes === 'string') ||
      (r.Notes?.length || 0) > 20000 ||
      !(r.createdTime == null || typeof r.createdTime === 'string')
    )
      throw Error('Each record needs url, Name, Job, Status and Notes.');
    jobKey(r.Job, r.url);
    return r;
  });
}
export function validateEdit(
  job: { status: string; version: number },
  b: { version: number; status: string; draft: string; blocker: string },
) {
  if (b.version !== job.version)
    throw Error('This record changed. Reload before saving.');
  if (
    !(
      (states as readonly string[]).includes(b.status) || isTerminal(b.status)
    ) ||
    typeof b.draft !== 'string' ||
    typeof b.blocker !== 'string' ||
    b.draft.length > 20000 ||
    b.blocker.length > 4000
  )
    throw Error('Invalid draft or status.');
  const active =
    ['Submitted', 'Live loop'].includes(job.status) || isTerminal(job.status);
  if (active && b.status !== job.status)
    throw Error(
      'Save notes and drafts without changing the application status.',
    );
  if (!active && isTerminal(b.status))
    throw Error(
      'Record the outcome with a receipt; do not set it from the editor.',
    );
  if (!active && ['Submitted', 'Live loop'].includes(b.status))
    throw Error(
      'This workspace prepares applications; it does not submit them.',
    );
  if (b.status === 'Ready' && (!b.draft.trim() || b.blocker.trim()))
    throw Error('Add a draft and resolve its blocker before accepting.');
}
