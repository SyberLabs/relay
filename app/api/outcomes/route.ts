import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { statusAfter, validateOutcome } from '../../../lib/outcomes';
import { loadOutcomes } from '../../../lib/store';
import {
  refuseUntrustedOrigin,
  jsonCharsTooLarge,
} from '../../../lib/request-origin';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to see your outcomes.' }, 401);
  const db = database();
  const [outcomes, jobs] = await Promise.all([
    loadOutcomes(db, user),
    db
      .prepare(
        "SELECT id,name,status,version,receipt,accepted_draft FROM jobs WHERE owner=? AND status IN ('Ready','Submitted','Live loop','Offer') ORDER BY updated DESC,name",
      )
      .bind(user)
      .all<{
        id: string;
        name: string;
        status: string;
        version: number;
        receipt: string | null;
        accepted_draft: string | null;
      }>(),
  ]);
  return reply({ outcomes, applications: jobs.results });
}
export async function POST(request: Request) {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in first.' }, 401);
  const denied = await refuseUntrustedOrigin(request);
  if (denied) return denied;
  try {
    if (jsonCharsTooLarge(request.headers.get('content-length'), 0))
      return reply({ error: 'Request too large.' }, 413);
    const raw = await request.text();
    if (jsonCharsTooLarge(request.headers.get('content-length'), raw.length))
      return reply({ error: 'Request too large.' }, 413);
    const b = JSON.parse(raw),
      db = database(),
      now = new Date().toISOString();
    if (b.action !== 'record') return reply({ error: 'Unknown action.' }, 400);
    const job = await db
      .prepare('SELECT id,status,version FROM jobs WHERE id=? AND owner=?')
      .bind(b.id, user)
      .first<{ id: string; status: string; version: number }>();
    if (!job) return reply({ error: 'Record not found.' }, 404);
    if (!Number.isInteger(b.version) || b.version !== job.version)
      return reply(
        { error: 'This record changed. Reload before recording.' },
        409,
      );
    const entry = validateOutcome(job, b);
    const status = statusAfter(entry.kind) ?? job.status;
    const result = await db.batch([
      db
        .prepare(
          'UPDATE jobs SET status=?, receipt=COALESCE(?,receipt), version=version+1, updated=? WHERE id=? AND owner=? AND version=?',
        )
        .bind(status, entry.receipt, now, job.id, user, job.version),
      db
        .prepare(
          'INSERT INTO outcomes (id,owner,job_id,kind,detail,receipt,occurred,created) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1 AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner=? AND version=? AND updated=?)',
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
          job.id,
          user,
          job.version + 1,
          now,
        ),
      db
        .prepare(
          'INSERT INTO events (id,owner,job_id,kind,detail,created) SELECT ?,?,?,?,?,? WHERE changes()=1 AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner=? AND version=? AND updated=?)',
        )
        .bind(
          crypto.randomUUID(),
          user,
          job.id,
          `Outcome: ${entry.kind}`,
          JSON.stringify({ occurred: entry.occurred, receipt: entry.receipt }),
          now,
          job.id,
          user,
          job.version + 1,
          now,
        ),
    ]);
    if (!result[0].meta.changes)
      return reply(
        { error: 'This record changed. Reload before recording.' },
        409,
      );
    return reply({ ok: true, status });
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : 'Unable to complete request.' },
      400,
    );
  }
}
