export const QUEUE_FILTERS = [
  { value: 'Held', label: 'Review queue' },
  { value: 'Ready', label: 'Accepted drafts' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'Live loop', label: 'In conversation' },
  { value: 'Skip', label: 'Set aside' },
  { value: 'Offer', label: 'Offers' },
  { value: 'Accepted', label: 'Accepted' },
  { value: 'Closed', label: 'Closed' },
  { value: 'All', label: 'All opportunities' },
] as const;

export type QueueFilter = (typeof QUEUE_FILTERS)[number]['value'];

export const PAGE_LINKS = [
  { href: '/applications', label: 'Applications', page: 'applications' },
  { href: '/profile', label: 'Your facts', page: 'profile' },
  { href: '/track', label: 'Track jobs', page: 'track' },
  { href: '/advanced', label: 'Advanced', page: 'advanced' },
] as const;

export const PORTFOLIO_PAGE_LINKS = PAGE_LINKS.filter(
  (item) => item.page === 'track' || item.page === 'applications',
);
export const CONTEXT_PAGE_LINKS = PAGE_LINKS.filter(
  (item) => item.page === 'profile' || item.page === 'advanced',
);

export type ShellPage =
  | 'applications'
  | 'workspace'
  | 'profile'
  | 'track'
  | 'advanced'
  | 'review'
  | 'preferences'
  | 'plan';

export function isQueueFilter(value: string): value is QueueFilter {
  return QUEUE_FILTERS.some((item) => item.value === value);
}

export function queueFromSearch(
  search: string,
  fallback: QueueFilter = 'Held',
): QueueFilter {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get('queue');
  return raw && isQueueFilter(raw) ? raw : fallback;
}

export function queueTitle(filter: string): string {
  return QUEUE_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}

export function queueHref(filter: QueueFilter): string {
  return filter === 'All'
    ? '/track'
    : `/track?queue=${encodeURIComponent(filter)}`;
}

export function jobFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get('job');
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id || id.length > 200) return null;
  return id;
}

export function workspaceHref(jobId: string): string {
  return `/?job=${encodeURIComponent(jobId)}`;
}

export function plantSearchAction(search: string): {
  redirectTo: string | null;
  stripTo: string | null;
  jobId: string | null;
} {
  const jobId = jobFromSearch(search);
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const rawQueue = params.get('queue');
  if (rawQueue && isQueueFilter(rawQueue) && rawQueue !== 'Held') {
    return { redirectTo: queueHref(rawQueue), stripTo: null, jobId };
  }
  if (rawQueue === 'Held') {
    params.delete('queue');
    const rest = params.toString();
    return {
      redirectTo: null,
      stripTo: rest ? `/?${rest}` : '/',
      jobId,
    };
  }
  return { redirectTo: null, stripTo: null, jobId };
}

export function isAdvancedSection(page: ShellPage): boolean {
  return (
    page === 'advanced' ||
    page === 'review' ||
    page === 'preferences' ||
    page === 'plan'
  );
}

export function pageIsCurrent(
  page: ShellPage,
  linkPage: (typeof PAGE_LINKS)[number]['page'],
): boolean {
  if (linkPage === 'advanced') return isAdvancedSection(page);
  return page === linkPage;
}
