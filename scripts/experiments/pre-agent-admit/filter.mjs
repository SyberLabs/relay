import { jobKey } from '../../../lib/domain.ts';
import { normName } from './load.mjs';

export function postingKey(posting) {
  return jobKey(posting.row.Job, posting.row.url);
}

export function isKnownPosting(posting, known) {
  const companies = new Set((known.companies || []).map(normName));
  const boards = new Set((known.boards || []).map(normName));
  return (
    companies.has(normName(posting.company)) ||
    companies.has(normName(posting.row.company)) ||
    boards.has(normName(posting.board))
  );
}

export function matchesSpec(posting, spec, now = Date.now()) {
  const row = posting.row;
  const title = row.Name.toLowerCase();
  const place = `${row.location || ''} ${row.remote || ''} ${row.Name}`.toLowerCase();
  if (
    spec.title_any.length &&
    !spec.title_any.some((term) => title.includes(term.toLowerCase()))
  )
    return { ok: false, reason: 'title' };
  if (spec.title_none.some((term) => title.includes(term.toLowerCase())))
    return { ok: false, reason: 'title_exclude' };
  if (spec.levels.length && !spec.levels.includes(row.level))
    return { ok: false, reason: 'level' };
  if (spec.remote_any.length) {
    if (row.remote) {
      if (!spec.remote_any.includes(row.remote))
        return { ok: false, reason: 'remote' };
    } else if (
      !spec.remote_any.some((term) => place.includes(term.toLowerCase()))
    )
      return { ok: false, reason: 'remote' };
  }
  if (
    spec.location_none.some((term) => place.includes(term.toLowerCase()))
  )
    return { ok: false, reason: 'location_exclude' };
  if (
    spec.location_any.length &&
    !spec.location_any.some((term) => place.includes(term.toLowerCase()))
  )
    return { ok: false, reason: 'location' };
  if (spec.freshness_days != null && row.posted) {
    const posted = Date.parse(row.posted);
    if (Number.isFinite(posted)) {
      const ageDays = (now - posted) / 86_400_000;
      if (ageDays > spec.freshness_days) return { ok: false, reason: 'stale' };
    }
  }
  return { ok: true, reason: 'match' };
}

export function byPostedThenKey(a, b) {
  const aPosted = Date.parse(a.row.posted || '') || 0;
  const bPosted = Date.parse(b.row.posted || '') || 0;
  if (aPosted !== bPosted) return bPosted - aPosted;
  return postingKey(a).localeCompare(postingKey(b));
}

export function capPostings(postings, max) {
  const sorted = [...postings].sort(byPostedThenKey);
  return {
    kept: sorted.slice(0, max),
    cap_hit: sorted.length > max,
    omitted: Math.max(0, sorted.length - max),
  };
}
