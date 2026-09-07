import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import {
  classify,
  displayName,
  importedBlocker,
  importedJobStatus,
  sourceJobKey,
  sourcePostingUrl,
  validateRows,
  validateEdit,
} from '../../../lib/domain';
import { jobImportSql, observationImportSql } from '../../../lib/import-upsert';
import seed from '../../../lib/seed.json';
import {
  historyPageSize,
  INITIAL_EVENT_LIMIT,
} from '../../../lib/workspace-events';
import { refuseUntrustedOrigin } from '../../../lib/request-origin';
import { usableFact } from '../../../lib/profile';
import { loadFacts } from '../../../lib/store';
import {
  loadDraftingPreference,
  saveDraftingDecision,
  validateDraftingDecision,
} from '../../../lib/drafting-decision';
import {
  saveProgress,
  validateProgress,
} from '../../../lib/application-progress';
import {
  beginOwnerImportWrite,
  completeOwnerImportWrite,
  ownerImportWritePending,
} from '../../../lib/tracker-submit';
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
  const now = new Date().toISOString();
  const jobs = await db
    .prepare('SELECT * FROM jobs WHERE owner=? ORDER BY updated DESC,name')
    .bind(user)
    .all();
  const sources = await db
    .prepare('SELECT * FROM observations WHERE owner=? ORDER BY created')
    .bind(user)
    .all();
  const events = await db
    .prepare('SELECT * FROM events WHERE owner=? ORDER BY created DESC LIMIT ?')
    .bind(user, INITIAL_EVENT_LIMIT)
    .all();
  const facts = (await loadFacts(db, user)).filter((f) => usableFact(f, now));
  return reply({
    viewer: user,
    jobs: jobs.results,
    sources: sources.results,
    events: events.results,
    facts,
    draftingPreference: await loadDraftingPreference(db, user),
  });
}
export async function POST(request: Request) {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in first.' }, 401);
  const denied = await refuseUntrustedOrigin(request);
  if (denied) return denied;
  try {
    if (Number(request.headers.get('content-length') || 0) > 2000000)
      return reply({ error: 'Import too large.' }, 413);
    const raw = await request.text();
    if (raw.length > 2000000) return reply({ error: 'Import too large.' }, 413);
    const b = JSON.parse(raw),
      db = database(),
      now = new Date().toISOString();
    if (
      b.action === 'import' &&
      typeof b.viewer === 'string' &&
      b.viewer !== user
    )
      return reply(
        { error: 'This add-job form belongs to a different account.' },
        409,
      );
    if (['bootstrap', 'import', 'preview', 'replay'].includes(b.action)) {
      if (b.action === 'preview' && ownerImportWritePending(user))
        return reply(
          {
            error: 'An import is already saving. Wait for it to finish.',
          },
          409,
        );
      const write =
        b.action === 'import' || b.action === 'bootstrap'
          ? beginOwnerImportWrite(user)
          : 0;
      try {
        const rows = validateRows(
          b.action === 'bootstrap' || b.action === 'replay' ? seed : b.rows,
        );
        const existing = await db
          .prepare('SELECT job_key,status FROM jobs WHERE owner=?')
          .bind(user)
          .all<{ job_key: string; status: string }>();
        const report = classify(rows, existing.results);
        if (b.action === 'preview' || b.action === 'replay')
          return reply(report);
        const statements = [];
        for (const r of rows) {
          const key = sourceJobKey(r);
          statements.push(
            db
              .prepare(jobImportSql)
              .bind(
                crypto.randomUUID(),
                user,
                key,
                displayName(r.Name),
                sourcePostingUrl(r),
                importedJobStatus(r.Status),
                importedBlocker(r.Notes),
                '',
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
              .prepare(observationImportSql)
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
      } finally {
        if (write) completeOwnerImportWrite(user, write);
      }
    }
    if (b.action === 'drafting-decision') {
      const result = await saveDraftingDecision(
        db,
        user,
        validateDraftingDecision(b),
        now,
      );
      return reply(result.data, result.status);
    }
    if (b.action === 'progress') {
      const progress = validateProgress(b);
      if (progress.viewer !== undefined && progress.viewer !== user)
        return reply(
          { error: 'This progress belongs to a different account.' },
          409,
        );
      const result = await saveProgress(db, user, progress, now);
      return reply(result.data, result.status);
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
      const skipExecuting =
        b.status === 'Skip'
          ? ' AND NOT EXISTS (SELECT 1 FROM application_operations WHERE owner=? AND job_id=? AND state=\'executing\')'
          : '';
      const statements = [
        db
          .prepare(
            `UPDATE jobs SET drafting_direction=CASE WHEN blocker=? THEN drafting_direction ELSE '' END,draft=?,blocker=?,status=?,accepted_draft=?,version=version+1,updated=? WHERE id=? AND owner=? AND version=?${skipExecuting}`,
          )
          .bind(
            ...(b.status === 'Skip'
              ? [
                  b.blocker,
                  b.draft,
                  b.blocker,
                  b.status,
                  null,
                  now,
                  b.id,
                  user,
                  b.version,
                  user,
                  b.id,
                ]
              : [
                  b.blocker,
                  b.draft,
                  b.blocker,
                  b.status,
                  b.status === 'Ready' ? b.draft : null,
                  now,
                  b.id,
                  user,
                  b.version,
                ]),
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
      ];
      if (b.status === 'Skip')
        statements.push(
          db
            .prepare(
              "UPDATE application_operations SET state='cancelled',finished=? WHERE owner=? AND job_id=? AND state IN ('proposed','authorized')",
            )
            .bind(now, user, b.id),
        );
      const result = await db.batch(statements);
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
