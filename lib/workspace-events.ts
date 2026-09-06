export const INITIAL_EVENT_LIMIT = 200;
export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_PAGE_MAX = 100;

export function historyPageSize(limit: unknown) {
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) return HISTORY_PAGE_SIZE;
  return Math.min(n, HISTORY_PAGE_MAX);
}

export function mergeReviewEvents<T extends { id: string; created: string }>(
  existing: T[],
  incoming: T[],
) {
  const byId = new Map(existing.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) =>
    a.created < b.created ? 1 : a.created > b.created ? -1 : 0,
  );
}

export function acceptedDraftFromEvents(
  events: { kind: string; detail: string }[],
) {
  for (const event of events) {
    if (event.kind !== 'Draft accepted') continue;
    try {
      const detail = JSON.parse(event.detail) as { draft?: unknown };
      if (typeof detail.draft === 'string') return detail.draft;
    } catch {
      /* Malformed review details are skipped rather than hiding later events. */
    }
  }
  return null;
}
