import type { Fact, Rule, DraftRow } from './profile';
export async function loadFacts(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM profile_facts WHERE owner=? ORDER BY created')
    .bind(user)
    .all<Fact>();
  return r.results;
}
export async function loadRules(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM style_rules WHERE owner=? ORDER BY created')
    .bind(user)
    .all<Rule>();
  return r.results;
}
export async function loadDrafts(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM drafts WHERE owner=? ORDER BY created')
    .bind(user)
    .all<DraftRow>();
  return r.results;
}
export async function profileVersion(db: D1Database, user: string) {
  const row = await db
    .prepare('SELECT profile_version FROM profile_state WHERE owner=?')
    .bind(user)
    .first<{ profile_version: number }>();
  return row?.profile_version ?? 1;
}
// Every profile change advances the version, and every draft records the
// version it was written under. Without that stamp a bad draft cannot be
// attributed to a bad agent rather than a stale profile, and the calibration
// loop stops being falsifiable.
export function bumpProfile(db: D1Database, user: string, now: string) {
  return db
    .prepare(
      'INSERT INTO profile_state (owner,profile_version,updated) VALUES (?,2,?) ON CONFLICT(owner) DO UPDATE SET profile_version=profile_state.profile_version+1, updated=excluded.updated',
    )
    .bind(user, now);
}
