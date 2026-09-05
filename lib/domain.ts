export type SourceRow = {
  url: string;
  Name: string;
  Job: string | null;
  Status: string;
  Notes: string | null;
  createdTime?: string;
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
    if (!s) known.set(key, r.Status);
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
      (r.Notes?.length || 0) > 20000
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
    !(states as readonly string[]).includes(b.status) ||
    typeof b.draft !== 'string' ||
    typeof b.blocker !== 'string' ||
    b.draft.length > 20000 ||
    b.blocker.length > 4000
  )
    throw Error('Invalid draft or status.');
  const active = ['Submitted', 'Live loop'].includes(job.status);
  if (active && b.status !== job.status)
    throw Error(
      'Save notes and drafts without changing the application status.',
    );
  if (!active && ['Submitted', 'Live loop'].includes(b.status))
    throw Error(
      'This workspace prepares applications; it does not submit them.',
    );
  if (b.status === 'Ready' && (!b.draft.trim() || b.blocker.trim()))
    throw Error('Add a draft and resolve its blocker before accepting.');
}
