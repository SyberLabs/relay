import { contentWords } from '../../../lib/profile.ts';
import { isKnownPosting } from './filter.mjs';

const SOFTWARE =
  /\b(software|swe|developer|full[ -]?stack|backend|front[ -]?end|back[ -]?end)\b/i;
const EARLY =
  /\b(intern(?:ship)?s?|co-?ops?|new[\s-]*grads?|early[\s-]*career|university|campus)\b/i;
const JUNIOR = /\b(junior|entry[ -]?level|swe\s*i\b|software engineer i\b)/i;
const HARDWARE = /\bhardware\b/i;
const SENIORISH = /\b(senior|staff|principal|director|manager|lead|sr\.?)\b/i;
const MIDMIX = /\bi\s*\/\s*ii\b/i;
const US_NAMES =
  /\b(united states|usa|u\.s\.a\.|u\.s\.|utah|salt lake|california|walnut creek)\b/i;
const US_ABBR = /(^|[^A-Za-z])US(A)?([^A-Za-z]|$)/;
const US_STATE = new Set(
  'AL AK AZ AR CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split(
    ' ',
  ),
);

export const DEFAULT_HUNT_PACKET =
  'software engineer intern internship new grad early career junior swe university campus';

/** LastRound `Name` is `Company — Title`. Instruments score the title only. */
export function roleTitle(name) {
  const text = String(name || '');
  const cut = text.indexOf(' — ');
  return cut === -1 ? text : text.slice(cut + 3);
}

export function internTitleMatch(name) {
  const title = roleTitle(name);
  if (SENIORISH.test(title) || MIDMIX.test(title))
    return { ok: false, reason: 'senior' };
  const software = SOFTWARE.test(title);
  const early = EARLY.test(title);
  const junior = JUNIOR.test(title);
  if (HARDWARE.test(title) && !software)
    return { ok: false, reason: 'hardware' };
  if (!software) return { ok: false, reason: 'not_software' };
  if (early || junior) return { ok: true, reason: early ? 'early' : 'junior' };
  return { ok: false, reason: 'not_early' };
}

export function lexicalCosine(text, packet) {
  const left = contentWords(text);
  const right = packet instanceof Set ? packet : contentWords(packet);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const word of left) if (right.has(word)) overlap += 1;
  return overlap / Math.sqrt(left.size * right.size);
}

/**
 * US hunt seat from location/remote fields only. Bare remote / worldwide
 * is not US. Two-letter state codes are matched case-sensitively.
 */
export function usHuntLocation(posting) {
  const row = posting?.row || posting || {};
  const place = `${row.location || ''} ${row.remote || ''}`;
  if (!place.trim()) return false;
  if (US_NAMES.test(place) || US_ABBR.test(place)) return true;
  const stateCode = /(?:^|[\s,(/])([A-Z]{2})(?:$|[\s,)/])/g;
  let match;
  while ((match = stateCode.exec(place))) {
    if (US_STATE.has(match[1])) return true;
  }
  return false;
}

export function compactPosting(posting) {
  const row = posting.row || posting;
  const rest = { ...row };
  delete rest.Notes;
  return {
    row: rest,
    board: posting.board || '',
    provider: posting.provider || rest.source || '',
    company: posting.company || rest.company || '',
  };
}

export function instrumentHits(
  postings,
  { known, packet, min_cosine = 0.08, now, freshness_days } = {},
) {
  const hunt = packet || DEFAULT_HUNT_PACKET;
  const huntWords = contentWords(hunt);
  const hits = [];
  const seen = new Set();
  for (const posting of postings) {
    const compact = compactPosting(posting);
    const key = compact.row.url || compact.row.Job;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const title = compact.row.Name || '';
    const regex = internTitleMatch(title);
    if (!regex.ok) continue;
    const unknown = !isKnownPosting(compact, known || { companies: [], boards: [] });
    const cosine = lexicalCosine(
      `${roleTitle(title)} ${compact.row.location || ''} ${compact.row.remote || ''}`,
      huntWords,
    );
    hits.push({
      posting: compact,
      regex: regex.reason,
      unknown_company: unknown,
      cosine,
      us: usHuntLocation(compact),
      lexical: cosine >= min_cosine,
      fresh: isFresh(compact.row, now, freshness_days),
    });
  }
  return hits;
}

export function scoreCorpus(postings, options = {}) {
  const min_cosine = options.min_cosine ?? 0.08;
  const hits = instrumentHits(postings, options);
  const hunt = options.packet || DEFAULT_HUNT_PACKET;
  return {
    corpus: postings.length,
    embedder: 'none',
    llm: 'asleep',
    packet_terms: contentWords(hunt).size,
    min_cosine,
    regex: tally(hits),
    lexical: tally(hits.filter((item) => item.lexical)),
    regex_us: tally(hits.filter((item) => item.us)),
    lexical_us: tally(hits.filter((item) => item.lexical && item.us)),
    regex_us_fresh: tally(hits.filter((item) => item.us && item.fresh)),
    lexical_us_fresh: tally(
      hits.filter((item) => item.lexical && item.us && item.fresh),
    ),
  };
}

function isFresh(row, now, freshness_days) {
  if (freshness_days == null || now == null) return true;
  if (!row?.posted) return true;
  const posted = Date.parse(row.posted);
  if (!Number.isFinite(posted)) return true;
  return (now - posted) / 86_400_000 <= freshness_days;
}

function tally(items) {
  const unknown = items.filter((item) => item.unknown_company).length;
  return {
    matched: items.length,
    unknown_company: unknown,
    unknown_company_share: items.length ? unknown / items.length : 0,
  };
}
