// Confirmed candidate facts and user-maintained writing preferences.
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
export const factStates = ['Proposed', 'Verified', 'Retired'] as const;
export const factTags = ['metric', 'role', 'credential', 'detail'] as const;
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
const stop = new Set(
  `a an the and or but if then than that this these those of in on at to for with from by as is are was were be been being am i my me we our us you your it its their there here have has had do does did not no so such very much many more most own same too also just only about into over under after before between during while which who whom what when where how why can could should would will shall may might must`.split(
    /\s+/,
  ),
);
export function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stop.has(word)),
  );
}
export function usableFact(fact: Fact, now: string): boolean {
  return fact.status === 'Verified' && (!fact.expires || fact.expires > now);
}

export const PROFILE_FACT_CLAIM_MAX = 500;

export function numbersIn(text: string): Set<string> {
  return new Set(
    (text.replace(/,(?=\d{3}\b)/g, '').match(/\d+(?:\.\d+)?/g) || []).map((n) =>
      String(Number(n)),
    ),
  );
}

const authorizationQuestion =
  /\b(work authori[sz]|authori[sz]ed to work|eligible to work)\b/i;
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
  if (/\bcitizenship\b/i.test(text)) {
    const place = workJurisdiction(text);
    if (place) return `citizenship.${place}`;
  } else if (authorizationQuestion.test(text)) {
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
export function clusterOf(name: string): string {
  const role = name.includes('—') ? name.split('—').pop()! : name;
  for (const [pattern, family] of roleFamilies)
    if (pattern.test(role)) return family;
  return 'general';
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
      'Use relevant user-confirmed facts from this brief for candidate-specific claims.',
      'Keep numbers and scope consistent with the supplied facts.',
      'Omit unsupported claims or ask when a required fact is missing.',
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

// Must immediately follow the guarded fact transition in the same batch.
function bumpAfterFactChange(
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
      WHERE changes()=1 AND EXISTS (
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
    bumpAfterFactChange(db, owner, now, id, claim, 'Verified'),
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
    bumpAfterFactChange(db, owner, now, id, claim, 'Retired'),
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
