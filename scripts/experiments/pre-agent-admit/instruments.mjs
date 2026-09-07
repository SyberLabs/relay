import { contentWords } from '../../../lib/profile.ts';
import { isKnownPosting } from './filter.mjs';

const SOFTWARE =
  /\b(software|swe|developer|full[ -]?stack|backend|front[ -]?end|back[ -]?end)\b/i;
const EARLY =
  /\b(intern(?:ship)?s?|co-?ops?|new[\s-]*grads?|early[\s-]*career|university|campus)\b/i;
const JUNIOR = /\b(junior|entry[ -]?level|swe\s*i\b|software engineer i\b)/i;
const HARDWARE = /\bhardware\b/i;

export const DEFAULT_HUNT_PACKET =
  'software engineer intern internship new grad early career junior swe university campus';

export function internTitleMatch(name) {
  const title = String(name || '');
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

export function scoreCorpus(postings, { known, packet, min_cosine = 0.08 } = {}) {
  const hunt = packet || DEFAULT_HUNT_PACKET;
  const huntWords = contentWords(hunt);
  const regexHits = [];
  const lexicalHits = [];
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
    const item = {
      posting: compact,
      regex: regex.reason,
      unknown_company: unknown,
      cosine: lexicalCosine(
        `${title} ${compact.row.location || ''} ${compact.row.remote || ''}`,
        huntWords,
      ),
    };
    regexHits.push(item);
    if (item.cosine >= min_cosine) lexicalHits.push(item);
  }
  return {
    corpus: postings.length,
    embedder: 'none',
    llm: 'asleep',
    packet_terms: huntWords.size,
    min_cosine,
    regex: tally(regexHits),
    lexical: tally(lexicalHits),
  };
}

function tally(items) {
  const unknown = items.filter((item) => item.unknown_company).length;
  return {
    matched: items.length,
    unknown_company: unknown,
    unknown_company_share: items.length ? unknown / items.length : 0,
  };
}
