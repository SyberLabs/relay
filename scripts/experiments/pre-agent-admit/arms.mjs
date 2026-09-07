import { capPostings, isKnownPosting, matchesSpec, postingKey } from './filter.mjs';

export function admitTreatment(postings, spec, now) {
  return capPostings(
    postings.filter((posting) => matchesSpec(posting, spec, now).ok),
    spec.caps.max_admitted,
  );
}

export function admitControlKnown(postings, spec, known, now) {
  return capPostings(
    postings.filter(
      (posting) =>
        matchesSpec(posting, spec, now).ok && isKnownPosting(posting, known),
    ),
    spec.caps.max_admitted,
  );
}

export function admitControlQuery(postings, spec, now) {
  const eligible = postings.filter((posting) =>
    matchesSpec(posting, spec, now).ok,
  );
  const seen = new Set();
  const kept = [];
  for (const query of spec.queries) {
    const needle = query.toLowerCase();
    const hits = eligible
      .filter((posting) => posting.row.Name.toLowerCase().includes(needle))
      .sort((a, b) => {
        const aPosted = Date.parse(a.row.posted || '') || 0;
        const bPosted = Date.parse(b.row.posted || '') || 0;
        return bPosted - aPosted || postingKey(a).localeCompare(postingKey(b));
      });
    let n = 0;
    for (const posting of hits) {
      const key = postingKey(posting);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(posting);
      if (++n >= spec.query_k) break;
    }
  }
  return capPostings(kept, spec.caps.max_admitted);
}
