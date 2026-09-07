export type ApplicationProgress = {
  action: 'progress';
  id: string;
  version: number;
  operation_id: string;
  note: string;
  blocker: string;
  viewer?: string;
};

export function validateProgress(value: unknown): ApplicationProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Progress must be an object.');
  const b = value as Record<string, unknown>;
  const fields = new Set([
    'action',
    'id',
    'version',
    'operation_id',
    'note',
    'blocker',
    'viewer',
  ]);
  if (Object.keys(b).some((key) => !fields.has(key)))
    throw Error(
      'Progress cannot change drafts, acceptance, or application status.',
    );
  if (
    b.action !== 'progress' ||
    !Number.isSafeInteger(b.version) ||
    Number(b.version) < 1 ||
    typeof b.id !== 'string' ||
    !/^[\w.:-]{1,128}$/.test(b.id) ||
    typeof b.operation_id !== 'string' ||
    !/^[\w.:-]{1,128}$/.test(b.operation_id) ||
    typeof b.note !== 'string' ||
    !b.note.trim() ||
    b.note.length > 4000 ||
    typeof b.blocker !== 'string' ||
    b.blocker.length > 4000 ||
    (b.viewer !== undefined && typeof b.viewer !== 'string')
  )
    throw Error(
      'Progress requires a job ID, version, operation ID, note, and next action (up to 4000 characters each).',
    );
  return b as ApplicationProgress;
}

export async function saveProgress(
  db: D1Database,
  owner: string,
  b: ApplicationProgress,
  now: string,
) {
  const job = await db
    .prepare('SELECT version FROM jobs WHERE id=? AND owner=?')
    .bind(b.id, owner)
    .first<{ version: number }>();
  if (!job) return { status: 404, data: { error: 'Record not found.' } };
  // A fixed owner-scoped primary key makes replay lookup bounded and collisions
  // serializable in the same transaction as the saved progress.
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([owner, b.operation_id])),
  );
  const eventId =
    'progress:' +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  const detail = JSON.stringify({
    version: b.version,
    operation_id: b.operation_id,
    note: b.note,
    blocker: b.blocker,
  });
  const readReceipt = () =>
    db
      .prepare('SELECT job_id,kind,detail FROM events WHERE id=? AND owner=?')
      .bind(eventId, owner)
      .first<{ job_id: string; kind: string; detail: string }>();
  const matches = (event: Awaited<ReturnType<typeof readReceipt>>) =>
    event?.job_id === b.id &&
    event.kind === 'Progress saved' &&
    event.detail === detail;
  const conflict = {
    status: 409,
    data: {
      error:
        'Record changed or operation ID was reused. Reload before saving new progress.',
    },
  };
  const prior = await readReceipt();
  if (prior)
    return matches(prior)
      ? { status: 200, data: { ok: true, replayed: true } }
      : conflict;
  if (job.version !== b.version) return conflict;
  const result = await db.batch([
    db
      .prepare(`INSERT INTO events (id,owner,job_id,kind,detail,created)
      SELECT ?,?,?,'Progress saved',?,?
      WHERE EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner=? AND version=?)
      AND NOT EXISTS (SELECT 1 FROM events WHERE id=?)`)
      .bind(eventId, owner, b.id, detail, now, b.id, owner, b.version, eventId),
    // The original version prevents a replay from updating twice. Matching the
    // entire receipt prevents an operation-ID collision from changing the job.
    // Neither statement depends on connection-local changes() state.
    db
      .prepare(`UPDATE jobs SET blocker=?,version=version+1,updated=?
      WHERE id=? AND owner=? AND version=?
      AND EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND job_id=?
        AND kind='Progress saved' AND detail=?)`)
      .bind(
        b.blocker,
        now,
        b.id,
        owner,
        b.version,
        eventId,
        owner,
        b.id,
        detail,
      ),
  ]);
  if (result[0].meta.changes)
    return { status: 200, data: { ok: true, replayed: false } };
  // Another request may have committed between the initial read and this batch.
  return matches(await readReceipt())
    ? { status: 200, data: { ok: true, replayed: true } }
    : conflict;
}
