import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import {
  clusterOf,
  clusterTrust,
  proposeRules,
  reviewTrigger,
  trustMap,
  validateDraftLog,
  RefusalError,
  validateRule,
} from '../../../lib/profile';
import {
  bumpProfile,
  loadDrafts,
  loadFacts,
  profileVersion,
} from '../../../lib/store';
import { refuseUntrustedOrigin } from '../../../lib/request-origin';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const stale = (
  facts: { status: string; expires: string | null }[],
  now: string,
) =>
  facts.some((f) => f.status === 'Verified' && !!f.expires && f.expires <= now);
export async function GET() {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to open your drafts.' }, 401);
  const db = database(),
    now = new Date().toISOString();
  const [drafts, facts] = await Promise.all([
    loadDrafts(db, user),
    loadFacts(db, user),
  ]);
  const batches = await db
    .prepare(
      'SELECT * FROM review_batches WHERE owner=? ORDER BY opened DESC LIMIT 50',
    )
    .bind(user)
    .all();
  return reply({
    drafts,
    batches: batches.results,
    trust: trustMap(drafts, stale(facts, now)),
    trigger: reviewTrigger(drafts),
  });
}
export async function POST(request: Request) {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in first.' }, 401);
  const denied = await refuseUntrustedOrigin(request);
  if (denied) return denied;
  try {
    if (Number(request.headers.get('content-length') || 0) > 2000000)
      return reply({ error: 'Request too large.' }, 413);
    const raw = await request.text();
    if (raw.length > 2000000)
      return reply({ error: 'Request too large.' }, 413);
    const b = JSON.parse(raw),
      db = database(),
      now = new Date().toISOString();
    // The agent-facing write. A draft that cites an unverified fact, or makes a
    // claim no cited fact supports, is refused here rather than queued for a
    // reviewer to catch.
    if (b.action === 'log') {
      const job = await db
        .prepare(
          'SELECT id,name,status,version,accepted_draft FROM jobs WHERE id=? AND owner=?',
        )
        .bind(b.job_id, user)
        .first<{
          id: string;
          name: string;
          status: string;
          version: number;
          accepted_draft: string | null;
        }>();
      if (!job) return reply({ error: 'Record not found.' }, 404);
      const facts = await loadFacts(db, user);
      let entry;
      try {
        entry = validateDraftLog(b, facts, now);
      } catch (refusal) {
        // Count the refusal so the gate's real strictness is measurable.
        // Only a one-way signature of the failing clause is written -- no text
        // from the draft reaches the database -- and only for refusals the
        // gate itself raised.
        if (refusal instanceof RefusalError)
          await db
            .prepare(
              'INSERT INTO refusals (id,owner,job_id,reason,trigger_kind,numbers,words,employer_ref,cited,created) VALUES (?,?,?,?,?,?,?,?,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              user,
              job.id,
              refusal.reason,
              refusal.signature?.trigger ?? 'other',
              refusal.signature?.numbers ?? 0,
              refusal.signature?.words ?? 0,
              refusal.signature?.employer_ref ?? 0,
              (Array.isArray(b.cited) ? b.cited : [])
                .filter((c: unknown) => typeof c === 'string')
                .join(','),
              now,
            )
            .run();
        throw refusal;
      }
      const cluster = clusterOf(job.name),
        version = await profileVersion(db, user),
        existing = await loadDrafts(db, user);
      const trust = clusterTrust(cluster, existing, stale(facts, now));
      const statements = [
        db
          .prepare(
            'INSERT INTO drafts (id,owner,job_id,cluster,body,profile_version,cited,confidence,verdict,created) VALUES (?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            user,
            job.id,
            cluster,
            entry.body,
            version,
            entry.cited.join(','),
            entry.confidence,
            'Logged',
            now,
          ),
      ];
      // A graduated cluster earns the right to place its draft in the
      // workspace unattended. It still only stages: status is untouched and
      // acceptance stays a human action on an exact version.
      const staged =
        trust.state === 'Graduated' &&
        entry.confidence === 'high' &&
        job.status === 'Held' &&
        !job.accepted_draft;
      if (staged) {
        statements.push(
          db
            .prepare(
              "UPDATE jobs SET draft=?,version=version+1,updated=? WHERE id=? AND owner=? AND version=? AND status='Held'",
            )
            .bind(entry.body, now, job.id, user, job.version),
          db
            .prepare(
              'INSERT INTO events (id,owner,job_id,kind,detail,created) VALUES (?,?,?,?,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              user,
              job.id,
              'Draft staged by agent',
              JSON.stringify({ cluster, profile_version: version }),
              now,
            ),
        );
      }
      await db.batch(statements);
      return reply({
        ok: true,
        cluster,
        staged,
        trust: trust.state,
        review: reviewTrigger([
          ...existing,
          {
            id: 'pending',
            job_id: job.id,
            cluster,
            body: entry.body,
            corrected: '',
            cited: entry.cited.join(','),
            confidence: entry.confidence,
            verdict: 'Logged',
            profile_version: version,
          },
        ]),
      });
    }
    if (b.action === 'open-batch') {
      const drafts = await loadDrafts(db, user);
      const trigger = reviewTrigger(drafts);
      if (!trigger)
        return reply({ error: 'No drafts are waiting for review.' }, 400);
      const id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            'INSERT INTO review_batches (id,owner,reason,opened,size) VALUES (?,?,?,?,?)',
          )
          .bind(id, user, trigger.reason, now, trigger.ids.length),
        db
          .prepare(
            "UPDATE drafts SET batch=? WHERE owner=? AND verdict='Logged' AND batch IS NULL",
          )
          .bind(id, user),
      ]);
      return reply({
        ok: true,
        id,
        reason: trigger.reason,
        size: trigger.ids.length,
      });
    }
    // A correction is a style signal first and a text fix second, so the
    // generalisations offered back are computed from the edit itself.
    if (b.action === 'correct') {
      if (typeof b.corrected !== 'string' || b.corrected.length > 20000)
        throw Error('Provide corrected text under 20000 characters.');
      const draft = await db
        .prepare('SELECT * FROM drafts WHERE id=? AND owner=?')
        .bind(b.id, user)
        .first<{ body: string }>();
      if (!draft) return reply({ error: 'Draft not found.' }, 404);
      await db
        .prepare(
          "UPDATE drafts SET corrected=?, verdict='Corrected' WHERE id=? AND owner=?",
        )
        .bind(b.corrected, b.id, user)
        .run();
      return reply({
        ok: true,
        proposals: proposeRules(draft.body, b.corrected),
      });
    }
    if (b.action === 'accept') {
      const result = await db
        .prepare("UPDATE drafts SET verdict='Reviewed' WHERE id=? AND owner=?")
        .bind(b.id, user)
        .run();
      if (!result.meta.changes)
        return reply({ error: 'Draft not found.' }, 404);
      return reply({ ok: true });
    }
    // Closing a batch is the point of the whole loop: it is where corrections
    // become rules the next drafts are written under.
    if (b.action === 'close-batch') {
      const rules = Array.isArray(b.rules) ? b.rules.map(validateRule) : [];
      if (rules.length > 20) throw Error('Add at most 20 rules in one review.');
      const statements = rules.map((r: { rule: string; scope: string }) =>
        db
          .prepare(
            'INSERT INTO style_rules (id,owner,rule,scope,origin,created) VALUES (?,?,?,?,?,?) ON CONFLICT(owner,scope,rule) DO NOTHING',
          )
          .bind(crypto.randomUUID(), user, r.rule, r.scope, String(b.id), now),
      );
      statements.push(
        db
          .prepare(
            "UPDATE drafts SET verdict='Reviewed' WHERE owner=? AND batch=? AND verdict='Logged'",
          )
          .bind(user, b.id),
        db
          .prepare(
            'UPDATE review_batches SET closed=?, rules_added=? WHERE id=? AND owner=?',
          )
          .bind(now, rules.length, b.id, user),
      );
      if (rules.length) statements.push(bumpProfile(db, user, now));
      await db.batch(statements);
      return reply({ ok: true, rules_added: rules.length });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : 'Unable to complete request.' },
      400,
    );
  }
}
