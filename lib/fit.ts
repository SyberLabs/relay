import {
  contentWords,
  numbersIn,
  usableFact,
  type Fact,
} from './profile.ts';

export type GateStatus = 'hit' | 'miss' | 'unknown';
export type Gate = {
  text: string;
  status: GateStatus;
  factId: string | null;
};
export type FitReason = 'notes' | 'facts' | 'compared';
const limit = 20;
const cue = /\b(must|required|minimum|need to|at least)\b/i;
const requiredHead =
  /^(requirements?|qualifications?|must haves|basic qualifications|minimum qualifications|what you.?ll need)$/i;
const otherHead =
  /^(benefits?|about(\s+the)?(\s+(role|team|company|us))?|responsibilities|what you.?ll do|nice to have|preferred|perks)$/i;
const filler = new Set([
  'must',
  'required',
  'minimum',
  'need',
  'least',
  'ability',
  'strong',
]);
function heading(line: string): 'required' | 'other' | null {
  const title = line.replace(/[:\s]+$/, '');
  if (title.length >= 60) return null;
  if (requiredHead.test(title)) return 'required';
  if (otherHead.test(title)) return 'other';
  if (title.length < 40 && line.endsWith(':') && !cue.test(line)) return 'other';
  return null;
}
function requirementWords(text: string) {
  const words = contentWords(text);
  for (const w of filler) words.delete(w);
  return words;
}
function postingLines(text: string): string[] {
  const prepared = text.replace(/[•·▪◦]/g, '\n').replace(
    /\b(requirements?|qualifications?|must haves|basic qualifications|minimum qualifications|what you.?ll need|benefits?|about(\s+the)?(\s+(role|team|company|us))?|responsibilities|what you.?ll do|nice to have|preferred|perks)\b/gi,
    '\n$&\n',
  );
  const out: string[] = [];
  for (const raw of prepared.split(/\r?\n/)) {
    const piece = raw.trim();
    if (!piece) continue;
    for (const part of piece.split(/(?<=[.!?])\s+/))
      if (part.trim()) out.push(part.trim());
  }
  return out;
}
export function extractRequirements(text: string): string[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  let inSection = false;
  for (const raw of postingLines(text)) {
    const line = raw.replace(/^[\s*–—>-]+/, '').trim();
    if (!line) continue;
    const kind = heading(line);
    if (kind) {
      inSection = kind === 'required';
      continue;
    }
    if (!(inSection || cue.test(line))) continue;
    if (line.length < 8 || line.length > 400) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}
export function postingText(
  job: { name: string },
  sources: { notes: string }[],
) {
  return [job.name, ...sources.map((s) => s.notes)]
    .filter((s) => typeof s === 'string' && s.trim())
    .join('\n');
}
function covers(
  requirement: string,
  fact: { claim: string; evidence: string },
) {
  const factText = `${fact.claim} ${fact.evidence}`;
  const need = numbersIn(requirement);
  const have = numbersIn(factText);
  for (const n of need) if (!have.has(n)) return false;
  const words = requirementWords(requirement);
  const factWords = contentWords(factText);
  let overlap = 0;
  for (const w of words) if (factWords.has(w)) overlap++;
  return overlap >= Math.min(2, words.size || 1);
}
export function assessPosting(
  posting: string,
  facts: Fact[],
  now: string,
): { gates: Gate[]; reason: FitReason } {
  const requirements = extractRequirements(posting);
  if (!requirements.length) return { gates: [], reason: 'notes' };
  const usable = facts.filter((f) => usableFact(f, now));
  if (!usable.length)
    return {
      gates: requirements.map((text) => ({
        text,
        status: 'unknown',
        factId: null,
      })),
      reason: 'facts',
    };
  return {
    reason: 'compared',
    gates: requirements.map((text) => {
      const hit = usable.find((f) => covers(text, f));
      if (hit) return { text, status: 'hit', factId: hit.id };
      if (!requirementWords(text).size)
        return { text, status: 'unknown', factId: null };
      return { text, status: 'miss', factId: null };
    }),
  };
}
