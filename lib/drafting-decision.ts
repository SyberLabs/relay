export type DraftingPreference = { routine: boolean; version: number };
export const defaultDraftingPreference: DraftingPreference = {
  routine: false,
  version: 1,
};

export const routineDraftingGuidance =
  'Choose wording, structure and optional examples using relevant confirmed facts. Omit unsupported optional claims. Do not ask for a personal anecdote or reason for interest if a truthful draft can work without it. For reasons for interest, draft from documented role details and relevant confirmed experience; do not require the user to supply their own wording. Never invent personal passion, past relationships, lived experience or qualifications. Ask one short question only when a required answer cannot be grounded. Preserve explicit submission holds and security refusals. This is preparation only, not draft acceptance or permission to send.';

export async function loadDraftingPreference(
  db: D1Database,
  owner: string,
): Promise<DraftingPreference> {
  const row = await db
    .prepare(
      'SELECT routine_drafting,drafting_version FROM preferences WHERE owner=?',
    )
    .bind(owner)
    .first<{ routine_drafting: number; drafting_version: number }>();
  return {
    routine: row?.routine_drafting === 1,
    version: row?.drafting_version ?? 1,
  };
}

type Decision = {
  action: 'drafting-decision';
  id: string;
  version: number;
  preference_version: number;
  viewer: string;
  operation_id: string;
  choice: 'delegate' | 'answer' | 'reset';
  remember: boolean;
  answer: string;
};

export function validateDraftingDecision(
  value: Record<string, unknown>,
): Decision {
  const fields = [
    'action',
    'id',
    'version',
    'preference_version',
    'viewer',
    'operation_id',
    'choice',
    'remember',
    'answer',
  ];
  if (
    Object.keys(value).some((key) => !fields.includes(key)) ||
    value.action !== 'drafting-decision' ||
    typeof value.id !== 'string' ||
    !/^[\w.:-]{1,128}$/.test(value.id) ||
    typeof value.operation_id !== 'string' ||
    !/^[\w.:-]{1,128}$/.test(value.operation_id) ||
    typeof value.viewer !== 'string' ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !Number.isSafeInteger(value.preference_version) ||
    Number(value.preference_version) < 1 ||
    !['delegate', 'answer', 'reset'].includes(String(value.choice)) ||
    typeof value.remember !== 'boolean' ||
    (value.choice !== 'delegate' && value.remember) ||
    typeof value.answer !== 'string' ||
    value.answer.length > 2000 ||
    (value.choice === 'answer' ? !value.answer.trim() : value.answer !== '')
  )
    throw Error(
      'Choose a drafting decision with the current job and preference versions. Keep your answer under 2,000 characters.',
    );
  return value as Decision;
}

// One bounded transaction: preserve the concern and exact wording while giving
// the assistant direction. A delegation cannot itself resolve a required fact.
export async function saveDraftingDecision(
  db: D1Database,
  owner: string,
  b: Decision,
  now: string,
) {
  if (b.viewer !== owner)
    return {
      status: 409,
      data: { error: 'This decision belongs to a different account.' },
    };
  const job = await db
    .prepare('SELECT version,blocker FROM jobs WHERE id=? AND owner=?')
    .bind(b.id, owner)
    .first<{ version: number; blocker: string }>();
  if (!job) return { status: 404, data: { error: 'Record not found.' } };
  const direction =
    b.choice === 'delegate'
      ? routineDraftingGuidance
      : b.choice === 'answer'
        ? b.answer
        : '';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([owner, b.operation_id])),
  );
  const eventId =
    'decision:' +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  const detail = JSON.stringify({
    version: b.version,
    preference_version: b.preference_version,
    choice: b.choice,
    remember: b.remember,
    answer: b.answer,
  });
  const receipt = () =>
    db
      .prepare('SELECT job_id,detail FROM events WHERE id=? AND owner=?')
      .bind(eventId, owner)
      .first<{ job_id: string; detail: string }>();
  const matches = (prior: Awaited<ReturnType<typeof receipt>>) =>
    prior?.job_id === b.id && prior.detail === detail;
  const conflict = {
    status: 409,
    data: {
      error:
        'This job or drafting preference changed. Reload before making a new decision.',
    },
  };
  const prior = await receipt();
  if (prior)
    return matches(prior)
      ? { status: 200, data: { ok: true, replayed: true } }
      : conflict;
  if (job.version !== b.version) return conflict;
  if (b.choice !== 'reset' && !job.blocker.trim())
    return {
      status: 400,
      data: { error: 'There is no saved question to answer. Reload this job.' },
    };
  const statements = [
    db
      .prepare(`INSERT INTO events (id,owner,job_id,kind,detail,created)
      SELECT ?,?,?,'Drafting decision',?,?
      WHERE EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner=? AND version=?)
      AND COALESCE((SELECT drafting_version FROM preferences WHERE owner=?),1)=?
      AND NOT EXISTS (SELECT 1 FROM events WHERE id=?)`)
      .bind(
        eventId,
        owner,
        b.id,
        detail,
        now,
        b.id,
        owner,
        b.version,
        owner,
        b.preference_version,
        eventId,
      ),
    db
      .prepare(`UPDATE jobs SET drafting_direction=?,version=version+1,updated=?
      WHERE id=? AND owner=? AND version=?
      AND EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND job_id=? AND detail=?)`)
      .bind(
        direction,
        now,
        b.id,
        owner,
        b.version,
        eventId,
        owner,
        b.id,
        detail,
      ),
  ];
  if (b.remember || b.choice === 'reset')
    statements.push(
      db
        .prepare(`INSERT INTO preferences (owner,routine_drafting,drafting_version,updated)
      SELECT ?,?,2,? WHERE EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner=? AND version=?)
      AND EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND job_id=? AND detail=?)
      ON CONFLICT(owner) DO UPDATE SET routine_drafting=excluded.routine_drafting,
        drafting_version=preferences.drafting_version+1,updated=excluded.updated
      WHERE preferences.drafting_version=?`)
        .bind(
          owner,
          b.remember ? 1 : 0,
          now,
          b.id,
          owner,
          b.version + 1,
          eventId,
          owner,
          b.id,
          detail,
          b.preference_version,
        ),
    );
  const result = await db.batch(statements);
  return result[0].meta.changes || matches(await receipt())
    ? { status: 200, data: { ok: true, replayed: !result[0].meta.changes } }
    : conflict;
}
