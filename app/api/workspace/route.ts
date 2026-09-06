import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import {
  classify,
  displayName,
  importedBlocker,
  importedJobStatus,
  jobKey,
  validateRows,
  validateEdit,
} from '../../../lib/domain';
import seed from '../../../lib/seed.json';
import { packets } from '../../../lib/packets';
import {
  historyPageSize,
  INITIAL_EVENT_LIMIT,
} from '../../../lib/workspace-events';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
// Optional posting attributes supplied by the read plane. Hand-written imports
// omit them, so every field coerces to a safe default rather than failing.
const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
const money = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 10_000_000
    ? Math.round(v)
    : null;
const minutes = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 480
    ? Math.round(v)
    : 20;
export async function GET() {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to open your workspace.' }, 401);
  const db = database();
  const jobs = await db
    .prepare('SELECT * FROM jobs WHERE owner=? ORDER BY updated DESC,name')
    .bind(user)
    .all();
  const sources = await db
    .prepare('SELECT * FROM observations WHERE owner=? ORDER BY created')
    .bind(user)
    .all();
  const events = await db
    .prepare(
      'SELECT * FROM events WHERE owner=? ORDER BY created DESC LIMIT ?',
    )
    .bind(user, INITIAL_EVENT_LIMIT)
    .all();
  return reply({
    jobs: jobs.results,
    sources: sources.results,
    events: events.results,
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
      return reply({ error: 'Import too large.' }, 413);
    const raw = await request.text();
    if (raw.length > 2000000) return reply({ error: 'Import too large.' }, 413);
    const b = JSON.parse(raw),
      db = database(),
      now = new Date().toISOString();
    if (['bootstrap', 'import', 'preview', 'replay'].includes(b.action)) {
      const rows = validateRows(
        b.action === 'bootstrap' ? seed : b.action === 'replay' ? seed : b.rows,
      );
      const existing = await db
        .prepare('SELECT job_key,status FROM jobs WHERE owner=?')
        .bind(user)
        .all<{ job_key: string; status: string }>();
      const report = classify(rows, existing.results);
      if (b.action === 'preview' || b.action === 'replay') return reply(report);
      const statements = [];
      for (const r of rows) {
        const key = jobKey(r.Job, r.url);
        statements.push(
          db
            .prepare(
              `INSERT INTO jobs (id,owner,job_key,name,url,status,blocker,draft,updated,company,level,remote,comp_min,comp_max,location,posted,source,effort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,job_key) DO UPDATE SET status=CASE WHEN jobs.status IN ('Offer','Accepted','Closed') THEN jobs.status WHEN jobs.status='Live loop' OR excluded.status='Live loop' THEN 'Live loop' WHEN jobs.status='Submitted' OR excluded.status='Submitted' THEN 'Submitted' ELSE jobs.status END, blocker=CASE WHEN jobs.blocker='' AND jobs.status NOT IN ('Ready','Submitted','Live loop') THEN excluded.blocker ELSE jobs.blocker END, accepted_draft=CASE WHEN excluded.status IN ('Submitted','Live loop') THEN NULL ELSE jobs.accepted_draft END, company=CASE WHEN excluded.company!='' THEN excluded.company ELSE jobs.company END, level=CASE WHEN excluded.level!='' THEN excluded.level ELSE jobs.level END, remote=CASE WHEN excluded.remote!='' THEN excluded.remote ELSE jobs.remote END, comp_min=COALESCE(excluded.comp_min,jobs.comp_min), comp_max=COALESCE(excluded.comp_max,jobs.comp_max), location=CASE WHEN excluded.location!='' THEN excluded.location ELSE jobs.location END, posted=COALESCE(excluded.posted,jobs.posted), source=CASE WHEN excluded.source!='' THEN excluded.source ELSE jobs.source END, effort=excluded.effort, version=jobs.version+1, updated=excluded.updated`,
            )
            .bind(
              crypto.randomUUID(),
              user,
              key,
              displayName(r.Name),
              r.Job,
              importedJobStatus(r.Status),
              importedBlocker(r.Notes) ||
                (b.action === 'bootstrap' ? packets[key]?.blocker || '' : ''),
              b.action === 'bootstrap' ? packets[key]?.draft || '' : '',
              now,
              text(r.company),
              text(r.level),
              text(r.remote),
              money(r.comp_min),
              money(r.comp_max),
              text(r.location),
              text(r.posted) || null,
              text(r.source),
              minutes(r.effort),
            ),
        );
        statements.push(
          db
            .prepare(
              'INSERT OR IGNORE INTO observations (id,owner,job_key,source_url,name,status,notes,created) VALUES (?,?,?,?,?,?,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              user,
              key,
              r.url,
              r.Name,
              r.Status,
              r.Notes || '',
              r.createdTime || now,
            ),
        );
      }
      await db.batch(statements);
      return reply(report);
    }
    if (b.action === 'save') {
      const job = await db
        .prepare('SELECT * FROM jobs WHERE id=? AND owner=?')
        .bind(b.id, user)
        .first<{ status: string; version: number }>();
      if (!job) return reply({ error: 'Record not found.' }, 404);
      if (b.version !== job.version)
        return reply(
          { error: 'This record changed. Reload before saving.' },
          409,
        );
      validateEdit(job, b);
      const result = await db.batch([
        db
          .prepare(
            'UPDATE jobs SET draft=?,blocker=?,status=?,accepted_draft=?,version=version+1,updated=? WHERE id=? AND owner=? AND version=?',
          )
          .bind(
            b.draft,
            b.blocker,
            b.status,
            b.status === 'Ready' ? b.draft : null,
            now,
            b.id,
            user,
            b.version,
          ),
        db
          .prepare(
            'INSERT INTO events (id,owner,job_id,kind,detail,created) SELECT ?,?,?,?,?,? WHERE changes()=1 AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner=? AND version=? AND updated=?)',
          )
          .bind(
            crypto.randomUUID(),
            user,
            b.id,
            b.status === 'Ready' ? 'Draft accepted' : 'Review saved',
            JSON.stringify({
              status: b.status,
              draft: b.draft,
              blocker: b.blocker,
            }),
            now,
            b.id,
            user,
            b.version + 1,
            now,
          ),
      ]);
      if (!result[0].meta.changes)
        return reply({ error: 'Record changed. Reload before saving.' }, 409);
      return reply({ ok: true });
    }
    if (b.action === 'history') {
      const job = await db
        .prepare('SELECT id FROM jobs WHERE id=? AND owner=?')
        .bind(b.id, user)
        .first();
      if (!job) return reply({ error: 'Record not found.' }, 404);
      const limit = historyPageSize(b.limit);
      const before = typeof b.before === 'string' && b.before ? b.before : null;
      const rows = before
        ? await db
            .prepare(
              'SELECT * FROM events WHERE owner=? AND job_id=? AND created < ? ORDER BY created DESC LIMIT ?',
            )
            .bind(user, b.id, before, limit)
            .all()
        : await db
            .prepare(
              'SELECT * FROM events WHERE owner=? AND job_id=? ORDER BY created DESC LIMIT ?',
            )
            .bind(user, b.id, limit)
            .all();
      const events = rows.results;
      return reply({
        events,
        next:
          events.length === limit
            ? events[events.length - 1]?.created || null
            : null,
      });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : 'Unable to complete request.' },
      400,
    );
  }
}
