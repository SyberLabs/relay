import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { clusterOf } from '../../../lib/profile';
import { evidence, statusAfter, validateOutcome } from '../../../lib/outcomes';
import { responseRate } from '../../../lib/scoring';
import {
  loadDrafts,
  loadFacts,
  loadJobs,
  loadOutcomes,
} from '../../../lib/store';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to see your outcomes.' }, 401);
  const db = database();
  const [outcomes, jobs, drafts, facts] = await Promise.all([
    loadOutcomes(db, user),
    loadJobs(db, user),
    loadDrafts(db, user),
    loadFacts(db, user),
  ]);
  const clusters = new Map(jobs.map((j) => [j.id, clusterOf(j.name)]));
  const seen = evidence(outcomes, (id) => clusters.get(id) || 'general');
  // Interview preparation falls out of the citation graph rather than being a
  // separate feature: because every claim had to cite a verified fact, the
  // system already knows exactly what each application commits you to
  // defending. The newest draft per job is the one that was actually sent.
  const byFact = new Map(facts.map((f) => [f.id, f]));
  const latest = new Map<string, (typeof drafts)[number]>();
  for (const d of drafts) latest.set(d.job_id, d);
  const active = jobs.filter((j) =>
    ['Submitted', 'Live loop', 'Offer'].includes(j.status),
  );
  const prep = active.map((job) => {
    const draft = latest.get(job.id);
    const cited = (draft?.cited || '').split(',').filter(Boolean);
    return {
      id: job.id,
      name: job.name,
      status: job.status,
      receipt: (job as { receipt?: string | null }).receipt ?? null,
      claims: cited
        .map((id) => byFact.get(id))
        .filter(Boolean)
        .map((f) => ({ id: f!.id, claim: f!.claim, evidence: f!.evidence })),
    };
  });
  return reply({
    outcomes,
    prep,
    // Descriptive only. Small samples, heavy confounding and a moving market
    // mean these rates describe what happened; they do not establish that any
    // change caused it.
    rates: Object.fromEntries(
      Object.entries(seen).map(([cluster, e]) => [
        cluster,
        { ...responseRate(e.sent, e.responses), responses: e.responses },
      ]),
    ),
  });
}
export async function POST(request: Request) {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in first.' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return reply({ error: 'Invalid request origin.' }, 403);
  try {
    const b = JSON.parse(await request.text()),
      db = database(),
      now = new Date().toISOString();
    if (b.action !== 'record') return reply({ error: 'Unknown action.' }, 400);
    const job = await db
      .prepare('SELECT id,status,version FROM jobs WHERE id=? AND owner=?')
      .bind(b.id, user)
      .first<{ id: string; status: string; version: number }>();
    if (!job) return reply({ error: 'Record not found.' }, 404);
    const entry = validateOutcome(job, b);
    const status = statusAfter(entry.kind);
    const statements = [
      db
        .prepare(
          'INSERT INTO outcomes (id,owner,job_id,kind,detail,receipt,occurred,created) VALUES (?,?,?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          user,
          job.id,
          entry.kind,
          entry.detail,
          entry.receipt,
          entry.occurred,
          now,
        ),
      db
        .prepare(
          'INSERT INTO events (id,owner,job_id,kind,detail,created) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          user,
          job.id,
          `Outcome: ${entry.kind}`,
          JSON.stringify({ occurred: entry.occurred, receipt: entry.receipt }),
          now,
        ),
    ];
    // The receipt is stored on the job as well as the outcome, so the workspace
    // can show at a glance which submissions are proven and which arrived from
    // an import without one.
    if (status && status !== job.status)
      statements.push(
        db
          .prepare(
            'UPDATE jobs SET status=?, receipt=COALESCE(?,receipt), version=version+1, updated=? WHERE id=? AND owner=? AND version=?',
          )
          .bind(status, entry.receipt, now, job.id, user, job.version),
      );
    else if (entry.receipt)
      statements.push(
        db
          .prepare('UPDATE jobs SET receipt=? WHERE id=? AND owner=?')
          .bind(entry.receipt, job.id, user),
      );
    await db.batch(statements);
    return reply({ ok: true, status: status ?? job.status });
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : 'Unable to complete request.' },
      400,
    );
  }
}
