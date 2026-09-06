import type { Fact, Rule, DraftRow } from './profile.ts';
import type { Posting } from './utility.ts';
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
export type JobRow = {
  id: string;
  job_key: string;
  name: string;
  status: string;
  version: number;
  receipt?: string | null;
  company: string;
  level: string;
  remote: string;
  comp_min: number | null;
  comp_max: number | null;
  size: string;
  posted: string | null;
  effort: number;
  cited?: string;
};
export function toPosting(job: JobRow): Posting {
  return {
    job_key: job.job_key,
    name: job.name,
    company: job.company || '',
    level: job.level || '',
    remote: job.remote || '',
    comp_min: job.comp_min,
    comp_max: job.comp_max,
    size: job.size || '',
    posted: job.posted,
  };
}
export async function loadPreferences(db: D1Database, user: string) {
  const row = await db
    .prepare('SELECT * FROM preferences WHERE owner=?')
    .bind(user)
    .first<{ weights: string; pairs: number; minutes: number }>();
  return {
    weights: row?.weights || '',
    pairs: row?.pairs ?? 0,
    minutes: row?.minutes ?? 120,
  };
}
export async function loadChoices(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM choices WHERE owner=? ORDER BY created')
    .bind(user)
    .all<{ winner: string; loser: string; delta: string }>();
  return r.results;
}
export async function loadOutcomes(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM outcomes WHERE owner=? ORDER BY occurred')
    .bind(user)
    .all<{
      id: string;
      job_id: string;
      kind: string;
      detail: string;
      receipt: string | null;
      occurred: string;
    }>();
  return r.results;
}
export async function loadJobs(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM jobs WHERE owner=? ORDER BY updated DESC,name')
    .bind(user)
    .all<JobRow>();
  return r.results;
}
export async function loadRefusals(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM refusals WHERE owner=? ORDER BY created')
    .bind(user)
    .all<{
      id: string;
      job_id: string;
      reason: string;
      created: string;
    }>();
  return r.results;
}
export async function loadBatches(db: D1Database, user: string) {
  const r = await db
    .prepare('SELECT * FROM review_batches WHERE owner=? ORDER BY opened')
    .bind(user)
    .all<{ id: string; closed: string | null }>();
  return r.results;
}
