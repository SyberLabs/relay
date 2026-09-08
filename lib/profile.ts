// The profile is what directs an autonomous writing agent, and the calibration
// loop is what keeps it honest. Two halves with deliberately different rules:
// the fact ledger is objective and gated on human verification, the style card
// is subjective and learned from corrections. Style mistakes are recoverable;
// an unsupported claim sent under the applicant's name is not.
export type Fact = {
  id: string;
  claim: string;
  evidence: string;
  tag: string;
  status: string;
  verified: string | null;
  expires: string | null;
  field_key?: string | null;
};
export type Rule = { id: string; rule: string; scope: string };
export type DraftRow = {
  id: string;
  job_id: string;
  cluster: string;
  body: string;
  corrected: string;
  cited: string;
  confidence: string;
  verdict: string;
  profile_version: number;
  batch?: string | null;
};
export const factStates = ['Proposed', 'Verified', 'Retired'] as const;
export const factTags = ['metric', 'role', 'credential', 'detail'] as const;
export const confidences = ['high', 'low'] as const;
export const verdicts = ['Logged', 'Reviewed', 'Corrected'] as const;
export const limits = {
  batchSize: 12,
  lowConfidence: 3,
  graduationRuns: 5,
  graduationEdit: 0.15,
  driftEdit: 0.45,
  samenessEdit: 0.2,
};
const stop = new Set(
  `a an the and or but if then than that this these those of in on at to for with from by as is are was were be been being am i my me we our us you your it its their there here have has had do does did not no so such very much many more most own same too also just only about into over under after before between during while which who whom what when where how why can could should would will shall may might must`.split(
    /\s+/,
  ),
);
// Unambiguous achievement verbs. Any of these alongside a first-person
// subject marks a checkable claim.
const strongVerbs =
  /\b(led|built|shipped|increased|reduced|managed|founded|scaled|launched|published|won|earned|grew|saved|delivered|architected|created|improved|drove|hired|mentored|taught|wrote|released|migrated|authored|generated|developed|implemented|automated|graduated|spent)\b/i;
// These double as common nouns ("your storage work", "the design", "a lead"),
// so they only count as claims when a first-person subject governs them. A
// missed claim is the dangerous direction, so they are guarded rather than
// dropped.
const ambiguousVerbs =
  /(?<=\b(?:i|we|my|our)\s(?:\w+\s){0,1})\b(lead|leads|build|builds|ship|ships|increase|reduce|manage|found|scale|own|owns|owned|launch|publish|save|deliver|design|designed|create|improve|cut|hold|holds|write|release|migrate|author|generate|raise|raised|close|closed|work|works|worked)\b/i;
const firstPerson = /\b(i|my|mine|we|our)\b/i;
const roleFamilies: [RegExp, string][] = [
  [/\b(research|scientist|scientific)\b/i, 'research'],
  [/\b(machine learning|ml|ai|deep learning)\b/i, 'ml'],
  [/\b(data|analytics|analyst)\b/i, 'data'],
  [/\b(infra|infrastructure|sre|reliability|devops)\b/i, 'infrastructure'],
  [/\b(security|appsec|cryptograph)\b/i, 'security'],
  [/\b(platform)\b/i, 'platform'],
  [/\b(backend|back-end|server)\b/i, 'backend'],
  [/\b(frontend|front-end|ui engineer)\b/i, 'frontend'],
  [/\b(full[ -]?stack)\b/i, 'fullstack'],
  [/\b(mobile|ios|android)\b/i, 'mobile'],
  [/\b(product manager|product owner|pm)\b/i, 'product'],
  [/\b(design|designer|ux)\b/i, 'design'],
];
export function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w)),
  );
}
export function numbersIn(text: string): Set<string> {
  return new Set(
    (text.replace(/,(?=\d{3}\b)/g, '').match(/\d+(?:\.\d+)?/g) || []).map((n) =>
      String(Number(n)),
    ),
  );
}
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
// A sentence asserts something checkable when it carries a quantity, or
// pairs a first-person subject with an achievement verb. Questions are
// not claims. Every digit in a non-question needs a citation — including
// years that mention the employer.
export function isClaim(sentence: string): boolean {
  if (sentence.endsWith('?')) return false;
  if (numbersIn(sentence).size) return true;
  if (!firstPerson.test(sentence)) return false;
  if (strongVerbs.test(sentence)) return true;
  // An ambiguous verb used intransitively is discourse, not assertion:
  // "why I write" frames the letter, while "I write release tooling" claims
  // something. Requiring a following object keeps the common cover-letter
  // framing out of the citation gate without weakening it for real claims.
  const match = ambiguousVerbs.exec(sentence);
  return (
    !!match &&
    contentWords(sentence.slice(match.index + match[0].length)).size > 0
  );
}
export function usableFact(fact: Fact, now: string): boolean {
  return fact.status === 'Verified' && (!fact.expires || fact.expires > now);
}

export const PROFILE_FACT_CLAIM_MAX = 500;

const authorizationQuestion =
  /\b(work authori[sz]|authori[sz]ed to work|eligible to work|citizenship)\b/i;
const sponsorshipQuestion = /\b(sponsor(?:ship)?|visa)\b/i;

function workJurisdiction(text: string): string | null {
  if (
    /\b(united states|u\.s\.a\.?|usa)\b/i.test(text) ||
    /\bin(?:\s+the)?\s+u\.?s\.?\b/i.test(text)
  )
    return 'us';
  if (/\b(canada|canadian)\b/i.test(text)) return 'ca';
  if (/\b(united kingdom|\bu\.k\.\b|britain|british|\buk\b)\b/i.test(text))
    return 'uk';
  if (/\b(european union|\beu\b)\b/i.test(text)) return 'eu';
  return null;
}

const questionFields: [RegExp, string][] = [
  [
    /\b(start date|earliest start|notice period|available to start)\b/i,
    'earliest_start',
  ],
  [
    /\b(salary|compensation|pay expect|desired pay|pay range)\b/i,
    'desired_pay',
  ],
  [/\b(relocat|willing to move)/i, 'relocation'],
  [/\b(security clearance)\b/i, 'security_clearance'],
];

export function factFieldKey(question: string): string {
  const text = question.trim();
  if (authorizationQuestion.test(text)) {
    const place = workJurisdiction(text);
    if (place) return `work_authorization.${place}`;
  } else if (sponsorshipQuestion.test(text)) {
    const place = workJurisdiction(text);
    return place ? `visa_sponsorship.${place}` : 'visa_sponsorship';
  }
  for (const [pattern, key] of questionFields)
    if (pattern.test(text)) return key;
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
    .replace(/_+$/g, '');
  return `question.${slug || 'unspecified'}`.slice(0, 128);
}

export function factClaimFromAnswer(question: string, answer: string): string {
  const asked = question.trim();
  const wording = answer.trim();
  if (!wording) return asked.slice(0, PROFILE_FACT_CLAIM_MAX);
  if (!asked) return wording.slice(0, PROFILE_FACT_CLAIM_MAX);
  const composed = `${asked}: ${wording}`;
  if (composed.length <= PROFILE_FACT_CLAIM_MAX) return composed;
  return wording.slice(0, PROFILE_FACT_CLAIM_MAX);
}
function supports(sentence: string, fact: Fact, pool: Set<string>): boolean {
  const sentenceNumbers = numbersIn(sentence);
  for (const n of sentenceNumbers) if (!pool.has(n)) return false;
  const words = contentWords(sentence),
    factWords = contentWords(`${fact.claim} ${fact.evidence}`);
  let overlap = 0;
  for (const w of words) if (factWords.has(w)) overlap++;
  return overlap >= Math.min(2, words.size || 1);
}
// Every number in a claim must trace to some cited fact, and the claim must
// share vocabulary with at least one of them. This is what makes an invented
// achievement machine-detectable instead of something a reviewer has to catch.
export function unsupportedClaims(body: string, cited: Fact[]): string[] {
  const pool = new Set<string>();
  for (const f of cited)
    for (const n of numbersIn(`${f.claim} ${f.evidence}`)) pool.add(n);
  return sentences(body).filter(
    (s) => isClaim(s) && !cited.some((f) => supports(s, f, pool)),
  );
}
export function clusterOf(name: string): string {
  const role = name.includes('—') ? name.split('—').pop()! : name;
  for (const [pattern, family] of roleFamilies)
    if (pattern.test(role)) return family;
  return 'general';
}
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
// Word-level Levenshtein: prose comparison at character level is both slower
// and less meaningful than comparing the words a reviewer actually changed.
export function editRatio(a: string, b: string): number {
  const x = words(a),
    y = words(b);
  if (!x.length && !y.length) return 0;
  if (!x.length || !y.length) return 1;
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++)
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[y.length] / Math.max(x.length, y.length);
}
export function draftEdit(draft: DraftRow): number {
  return draft.corrected ? editRatio(draft.body, draft.corrected) : 0;
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
// Autonomy is earned per cluster, never globally. A cluster graduates only
// after enough reviewed drafts came back close to unchanged, and any later
// correction or expired fact drops it straight back to full review.
export function clusterTrust(
  cluster: string,
  all: DraftRow[],
  staleFacts = false,
): { cluster: string; state: string; reviewed: number; edit: number } {
  const reviewed = all.filter(
    (d) => d.cluster === cluster && d.verdict !== 'Logged',
  );
  const recent = reviewed.slice(-limits.graduationRuns);
  const edit = recent.length ? median(recent.map(draftEdit)) : 1;
  const state =
    !staleFacts &&
    reviewed.length >= limits.graduationRuns &&
    edit <= limits.graduationEdit
      ? 'Graduated'
      : 'Probation';
  return { cluster, state, reviewed: reviewed.length, edit };
}
export function trustMap(
  all: DraftRow[],
  staleFacts = false,
): Record<string, ReturnType<typeof clusterTrust>> {
  const out: Record<string, ReturnType<typeof clusterTrust>> = {};
  for (const cluster of new Set(all.map((d) => d.cluster)))
    out[cluster] = clusterTrust(cluster, all, staleFacts);
  return out;
}
// Ordered by risk, not by convenience. An unseen role type is reviewed at the
// first draft; a full batch is the weakest signal and comes last.
export function reviewTrigger(
  all: DraftRow[],
): { reason: string; ids: string[] } | null {
  const pending = all.filter((d) => d.verdict === 'Logged');
  if (!pending.length) return null;
  const seen = new Set(
    all.filter((d) => d.verdict !== 'Logged').map((d) => d.cluster),
  );
  const fresh = pending.filter((d) => !seen.has(d.cluster));
  if (fresh.length)
    return { reason: 'New cluster', ids: pending.map((d) => d.id) };
  const drifted = pending.filter((d) => {
    const trust = clusterTrust(d.cluster, all);
    if (trust.state !== 'Graduated') return false;
    const corpus = all.filter(
      (o) => o.cluster === d.cluster && o.verdict !== 'Logged',
    );
    return (
      median(corpus.map((o) => editRatio(d.body, o.corrected || o.body))) >
      limits.driftEdit
    );
  });
  if (drifted.length)
    return { reason: 'Style drift', ids: pending.map((d) => d.id) };
  if (
    pending.filter((d) => d.confidence === 'low').length >= limits.lowConfidence
  )
    return { reason: 'Low confidence', ids: pending.map((d) => d.id) };
  if (pending.length >= limits.batchSize)
    return { reason: 'Batch full', ids: pending.map((d) => d.id) };
  return null;
}
export function opening(body: string, count = 6): string {
  return words(sentences(body)[0] || '')
    .slice(0, count)
    .join(' ');
}
// Reviewing twelve documents one by one is the same work as before, batched.
// Grouping by shared opening turns a repeated habit into a single decision.
export function openingGroups(
  batch: DraftRow[],
): { phrase: string; ids: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const d of batch) {
    const phrase = opening(d.corrected || d.body);
    if (!phrase) continue;
    groups.set(phrase, [...(groups.get(phrase) || []), d.id]);
  }
  return [...groups]
    .filter(([, ids]) => ids.length > 1)
    .map(([phrase, ids]) => ({ phrase, ids }))
    .sort((a, b) => b.ids.length - a.ids.length);
}
// A profile that learns from its own accepted output homogenises. Near-identical
// letters in one batch are a defect worth blocking on, not a sign of success.
export function samenessPairs(batch: DraftRow[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < batch.length; i++)
    for (let j = i + 1; j < batch.length; j++)
      if (
        editRatio(
          batch[i].corrected || batch[i].body,
          batch[j].corrected || batch[j].body,
        ) <= limits.samenessEdit
      )
        out.push([batch[i].id, batch[j].id]);
  return out;
}
export function factUsage(
  batch: DraftRow[],
  facts: Fact[],
): { fact: Fact; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of batch)
    for (const id of d.cited.split(',').filter(Boolean))
      counts.set(id, (counts.get(id) || 0) + 1);
  return facts
    .filter((f) => counts.has(f.id))
    .map((f) => ({ fact: f, count: counts.get(f.id)! }))
    .sort((a, b) => b.count - a.count);
}
// Most people cannot describe their own voice but recognise a violation at a
// glance. Style is therefore elicited by correction: the reviewer edits, and
// these are the generalisations offered back for confirmation.
export function proposeRules(before: string, after: string): string[] {
  const out: string[] = [];
  if (!after.trim() || before.trim() === after.trim()) return out;
  const openBefore = opening(before),
    openAfter = opening(after);
  if (openBefore && openBefore !== openAfter)
    out.push(`Do not open with "${openBefore}".`);
  const kept = new Set(words(after));
  const tokens = (before.match(/[A-Za-z0-9'-]+/g) || []).filter(Boolean);
  let run: string[] = [];
  for (const token of [...tokens, '']) {
    const plain = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (plain && !kept.has(plain) && !stop.has(plain)) run.push(token);
    else {
      if (run.length >= 2) out.push(`Avoid the phrase "${run.join(' ')}".`);
      run = [];
    }
  }
  const wordsAfter = words(after).length;
  if (wordsAfter && words(before).length > wordsAfter * 1.25)
    out.push(`Keep drafts near ${Math.round(wordsAfter / 10) * 10} words.`);
  return [...new Set(out)].slice(0, 3);
}
// What the writing agent is actually handed. Verified, unexpired facts only;
// rules narrowed to the cluster in play. The agent reads this and never writes
// it — a generator that edits its own instructions drifts toward whatever is
// cheapest to produce.
export function profileBrief(
  facts: Fact[],
  rules: Rule[],
  cluster: string,
  now: string,
  version: number,
) {
  return {
    profile_version: version,
    cluster,
    facts: facts
      .filter((f) => usableFact(f, now))
      .map((f) => ({
        id: f.id,
        claim: f.claim,
        evidence: f.evidence,
        tag: f.tag,
        field_key: f.field_key || null,
      })),
    style: rules
      .filter((r) => r.scope === 'global' || r.scope === cluster)
      .map((r) => r.rule),
    rules_of_use: [
      'Every sentence making a factual claim must cite a fact id from this brief.',
      'Numbers may only come from cited facts.',
      'Set confidence "low" when a required fact is missing rather than guessing.',
    ],
  };
}
function parseFactExpiry(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number')
    throw Error('Use an ISO date for the expiry, or leave it empty.');
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed))
    throw Error('Use an ISO date for the expiry, or leave it empty.');
  return new Date(parsed).toISOString();
}

function exactDisplayedClaim(value: unknown) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PROFILE_FACT_CLAIM_MAX
    ? value
    : null;
}

function bumpWhenFactMatches(
  db: D1Database,
  owner: string,
  now: string,
  id: string,
  claim: string,
  status: 'Verified' | 'Retired',
) {
  return db
    .prepare(
      `INSERT INTO profile_state (owner,profile_version,updated)
      SELECT ?,2,?
      WHERE EXISTS (
        SELECT 1 FROM profile_facts
        WHERE id=? AND owner=? AND claim=? AND status=?
      )
      ON CONFLICT(owner) DO UPDATE SET
        profile_version=profile_state.profile_version+1,
        updated=excluded.updated
      WHERE EXISTS (
        SELECT 1 FROM profile_facts
        WHERE id=? AND owner=? AND claim=? AND status=?
      )`,
    )
    .bind(owner, now, id, owner, claim, status, id, owner, claim, status);
}

export async function confirmProfileFact(
  db: D1Database,
  owner: string,
  body: { id?: unknown; claim?: unknown; expires?: unknown },
  now: string,
) {
  const id = typeof body.id === 'string' && body.id ? body.id : null;
  const claim = exactDisplayedClaim(body.claim);
  if (!id || !claim)
    return {
      status: 400,
      data: { error: 'Confirm the exact fact wording shown.' },
    };
  const expires = parseFactExpiry(body.expires);
  const result = await db.batch([
    db
      .prepare(
        `UPDATE profile_facts SET status='Verified', verified=?, expires=?
        WHERE id=? AND owner=? AND claim=? AND status='Proposed'`,
      )
      .bind(now, expires, id, owner, claim),
    bumpWhenFactMatches(db, owner, now, id, claim, 'Verified'),
  ]);
  if (result[0].meta.changes) return { status: 200, data: { ok: true } };
  const row = await db
    .prepare('SELECT claim, status FROM profile_facts WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<{ claim: string; status: string }>();
  if (!row) return { status: 404, data: { error: 'Fact not found.' } };
  if (row.status === 'Verified' && row.claim === claim)
    return { status: 200, data: { ok: true, replayed: true } };
  return {
    status: 409,
    data: { error: 'This fact changed. Reload before confirming.' },
  };
}

export async function retireProfileFact(
  db: D1Database,
  owner: string,
  body: { id?: unknown; claim?: unknown },
  now: string,
) {
  const id = typeof body.id === 'string' && body.id ? body.id : null;
  const claim = exactDisplayedClaim(body.claim);
  if (!id || !claim)
    return {
      status: 400,
      data: { error: 'Discard the exact fact wording shown.' },
    };
  const result = await db.batch([
    db
      .prepare(
        `UPDATE profile_facts SET status='Retired'
        WHERE id=? AND owner=? AND claim=? AND status!='Retired'`,
      )
      .bind(id, owner, claim),
    bumpWhenFactMatches(db, owner, now, id, claim, 'Retired'),
  ]);
  if (result[0].meta.changes) return { status: 200, data: { ok: true } };
  const row = await db
    .prepare('SELECT claim, status FROM profile_facts WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<{ claim: string; status: string }>();
  if (!row) return { status: 404, data: { error: 'Fact not found.' } };
  if (row.status === 'Retired' && row.claim === claim)
    return { status: 200, data: { ok: true, replayed: true } };
  return {
    status: 409,
    data: { error: 'This fact changed. Reload before discarding.' },
  };
}

export function validateFact(v: unknown): {
  claim: string;
  evidence: string;
  tag: string;
} {
  const f = v as { claim?: unknown; evidence?: unknown; tag?: unknown };
  if (
    typeof f?.claim !== 'string' ||
    !f.claim.trim() ||
    f.claim.length > PROFILE_FACT_CLAIM_MAX ||
    (f.evidence != null && typeof f.evidence !== 'string') ||
    ((f.evidence as string)?.length || 0) > 2000
  )
    throw Error('A fact needs a claim under 500 characters.');
  const tag = typeof f.tag === 'string' ? f.tag : 'detail';
  if (!(factTags as readonly string[]).includes(tag))
    throw Error('Use a known fact tag.');
  return {
    claim: f.claim.trim(),
    evidence: ((f.evidence as string) || '').trim(),
    tag,
  };
}
export function validateRule(v: unknown): { rule: string; scope: string } {
  const r = v as { rule?: unknown; scope?: unknown };
  if (typeof r?.rule !== 'string' || !r.rule.trim() || r.rule.length > 300)
    throw Error('A style rule needs text under 300 characters.');
  const scope = typeof r.scope === 'string' && r.scope ? r.scope : 'global';
  if (scope.length > 40) throw Error('Use a shorter rule scope.');
  return { rule: r.rule.trim(), scope };
}
export const refusalReasons = [
  'unsupported_claim',
  'unverified_fact',
  'unknown_fact',
] as const;
export const refusalTriggers = [
  'digit',
  'strong_verb',
  'ambiguous_verb',
  'other',
] as const;
export type RefusalSignature = {
  trigger: (typeof refusalTriggers)[number];
  numbers: number;
  words: number;
  employer_ref: number;
};
// A refusal has to be measurable without keeping the text that was refused.
// This is a one-way summary of why a clause tripped the gate: which rule fired,
// how many figures it carried, how long it was, and whether an employer
// possessive governed one of them. Those four answer "is the gate too strict, and in
// which direction" while making the clause unreconstructable -- no word of the
// draft survives.
// Whether a second-person possessive governs a figure in the clause: "your
// 2024 launch". isClaim deliberately treats those as claims needing citation,
// and this changes nothing about that -- it exempts nothing and is read by
// nothing except the refusal record. It exists so the cost of that deliberate
// strictness can be seen in evidence rather than argued from memory.
const employerFigure = /\b(?:your|yours|their|its)\b[^.!?]{0,24}?\d/i;
export function refusalSignature(sentence: string): RefusalSignature {
  return {
    trigger: /\d/.test(sentence)
      ? 'digit'
      : strongVerbs.test(sentence)
        ? 'strong_verb'
        : ambiguousVerbs.test(sentence)
          ? 'ambiguous_verb'
          : 'other',
    numbers: numbersIn(sentence).size,
    words: words(sentence).length,
    employer_ref: employerFigure.test(sentence) ? 1 : 0,
  };
}
// A refusal the system should count. Malformed requests are ordinary errors and
// are deliberately not RefusalErrors: they say nothing about whether the
// citation gate is calibrated, and counting them would flatter the rate.
export class RefusalError extends Error {
  reason: (typeof refusalReasons)[number];
  // Returned to the caller so a person can see which clause failed. It is
  // deliberately not a stored field: nothing persists the refused text.
  sentence: string;
  signature: RefusalSignature | null;
  constructor(
    message: string,
    reason: (typeof refusalReasons)[number],
    sentence = '',
  ) {
    super(message);
    this.name = 'RefusalError';
    this.reason = reason;
    this.sentence = sentence;
    this.signature = sentence ? refusalSignature(sentence) : null;
  }
}
// The agent may log a draft, never accept one. A draft carrying an unsupported
// claim is refused outright: it must not reach a batch where a tired reviewer
// might wave it through.
export function validateDraftLog(
  v: unknown,
  facts: Fact[],
  now: string,
): { body: string; cited: string[]; confidence: string } {
  const d = v as { body?: unknown; cited?: unknown; confidence?: unknown };
  if (typeof d?.body !== 'string' || !d.body.trim() || d.body.length > 20000)
    throw Error('A logged draft needs body text under 20000 characters.');
  const confidence = typeof d.confidence === 'string' ? d.confidence : 'high';
  if (!(confidences as readonly string[]).includes(confidence))
    throw Error('Confidence must be high or low.');
  const cited = Array.isArray(d.cited) ? d.cited : [];
  if (cited.some((id) => typeof id !== 'string'))
    throw Error('Cited facts must be fact ids.');
  const known = new Map(facts.map((f) => [f.id, f]));
  const used: Fact[] = [];
  for (const id of cited as string[]) {
    const fact = known.get(id);
    if (!fact)
      throw new RefusalError(
        `Cited fact ${id} does not exist.`,
        'unknown_fact',
      );
    if (!usableFact(fact, now))
      throw new RefusalError(
        `Fact ${id} is not verified or has expired. Verify it before citing it.`,
        'unverified_fact',
      );
    used.push(fact);
  }
  const unsupported = unsupportedClaims(d.body, used);
  if (unsupported.length)
    throw new RefusalError(
      `Unsupported claim: "${unsupported[0]}". Cite a verified fact or remove the claim.`,
      'unsupported_claim',
      unsupported[0],
    );
  return { body: d.body, cited: cited as string[], confidence };
}
