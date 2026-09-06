import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { validateFact, validateRule, usableFact } from '../../../lib/profile';
import { parseResume } from '../../../lib/resume';
import {
  bumpProfile,
  loadFacts,
  loadRules,
  profileVersion,
} from '../../../lib/store';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to open your profile.' }, 401);
  const db = database(),
    now = new Date().toISOString();
  const [facts, rules, version] = await Promise.all([
    loadFacts(db, user),
    loadRules(db, user),
    profileVersion(db, user),
  ]);
  return reply({
    facts,
    rules,
    version,
    usable: facts.filter((f) => usableFact(f, now)).length,
  });
}
export async function POST(request: Request) {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in first.' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return reply({ error: 'Invalid request origin.' }, 403);
  try {
    if (Number(request.headers.get('content-length') || 0) > 2000000)
      return reply({ error: 'Request too large.' }, 413);
    const raw = await request.text();
    if (raw.length > 2000000)
      return reply({ error: 'Request too large.' }, 413);
    const b = JSON.parse(raw),
      db = database(),
      now = new Date().toISOString();
    // Extraction only proposes. It writes nothing, so a noisy resume costs a
    // review pass rather than a false fact in the ledger.
    if (b.action === 'extract')
      return reply({ candidates: parseResume(b.text) });
    if (b.action === 'propose') {
      if (!Array.isArray(b.facts) || !b.facts.length || b.facts.length > 100)
        throw Error('Propose between 1 and 100 facts.');
      const rows = b.facts.map(validateFact);
      await db.batch(
        rows.map((f: { claim: string; evidence: string; tag: string }) =>
          db
            .prepare(
              'INSERT INTO profile_facts (id,owner,claim,evidence,tag,status,created) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner,claim) DO UPDATE SET evidence=excluded.evidence, tag=excluded.tag',
            )
            .bind(
              crypto.randomUUID(),
              user,
              f.claim,
              f.evidence,
              f.tag,
              'Proposed',
              now,
            ),
        ),
      );
      return reply({ ok: true, proposed: rows.length });
    }
    // Verification is the only path to a usable fact, and it is always a
    // human action on one specific claim.
    if (b.action === 'verify') {
      if (b.expires != null && Number.isNaN(Date.parse(String(b.expires))))
        throw Error('Use an ISO date for the expiry, or leave it empty.');
      const result = await db.batch([
        db
          .prepare(
            "UPDATE profile_facts SET status='Verified', verified=?, expires=? WHERE id=? AND owner=?",
          )
          .bind(
            now,
            b.expires ? new Date(String(b.expires)).toISOString() : null,
            b.id,
            user,
          ),
        bumpProfile(db, user, now),
      ]);
      if (!result[0].meta.changes)
        return reply({ error: 'Fact not found.' }, 404);
      return reply({ ok: true });
    }
    if (b.action === 'retire') {
      const result = await db.batch([
        db
          .prepare(
            "UPDATE profile_facts SET status='Retired' WHERE id=? AND owner=?",
          )
          .bind(b.id, user),
        bumpProfile(db, user, now),
      ]);
      if (!result[0].meta.changes)
        return reply({ error: 'Fact not found.' }, 404);
      return reply({ ok: true });
    }
    if (b.action === 'rule-add') {
      const rule = validateRule(b);
      await db.batch([
        db
          .prepare(
            'INSERT INTO style_rules (id,owner,rule,scope,origin,created) VALUES (?,?,?,?,?,?) ON CONFLICT(owner,scope,rule) DO NOTHING',
          )
          .bind(
            crypto.randomUUID(),
            user,
            rule.rule,
            rule.scope,
            typeof b.origin === 'string' ? b.origin.slice(0, 80) : '',
            now,
          ),
        bumpProfile(db, user, now),
      ]);
      return reply({ ok: true });
    }
    if (b.action === 'rule-remove') {
      await db.batch([
        db
          .prepare('DELETE FROM style_rules WHERE id=? AND owner=?')
          .bind(b.id, user),
        bumpProfile(db, user, now),
      ]);
      return reply({ ok: true });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : 'Unable to complete request.' },
      400,
    );
  }
}
