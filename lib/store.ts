import type { Fact, Rule } from './profile.ts';
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
export async function profileVersion(db: D1Database, user: string) {
  const row = await db
    .prepare('SELECT profile_version FROM profile_state WHERE owner=?')
    .bind(user)
    .first<{ profile_version: number }>();
  return row?.profile_version ?? 1;
}
// A profile version lets handoff clients detect that the available facts or
// rules changed after the context was read.
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
};
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
