import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { usableFact } from '../../../lib/profile';
import {
  corpusOf,
  difference,
  fitWeights,
  nextPair,
  pairKey,
  vector,
} from '../../../lib/utility';
import {
  loadChoices,
  loadFacts,
  loadJobs,
  loadPreferences,
  toPosting,
} from '../../../lib/store';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
// Preferences are fitted from the choice log every time rather than stored as
// a running estimate, so a mistaken answer can be dropped and the model simply
// refits. There are never more than a few dozen comparisons.
async function state(db: D1Database, user: string) {
  const [prefs, choices, facts, jobs] = await Promise.all([
    loadPreferences(db, user),
    loadChoices(db, user),
    loadFacts(db, user),
    loadJobs(db, user),
  ]);
  const now = new Date().toISOString();
  const corpus = corpusOf(
    facts.filter((f) => usableFact(f, now)).map((f) => f.claim),
  );
  const deltas = choices.map((c) => JSON.parse(c.delta) as number[]);
  const weights = fitWeights(deltas);
  const asked = new Set(choices.map((c) => pairKey(c.winner, c.loser)));
  const pool = jobs.filter((j) => j.status === 'Held').map(toPosting);
  return { prefs, choices, weights, corpus, asked, pool, now };
}
export async function GET() {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to set your preferences.' }, 401);
  const db = database();
  const { prefs, choices, weights, corpus, asked, pool } = await state(
    db,
    user,
  );
  const pair = nextPair(pool, weights, corpus, asked);
  return reply({
    weights,
    answered: choices.length,
    minutes: prefs.minutes,
    pool: pool.length,
    // Twelve comparisons fit five weights well enough to rank thousands of
    // postings; more is welcome but the plan does not wait for it.
    target: 12,
    pair: pair && {
      a: pair.a,
      b: pair.b,
    },
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
    if (b.action === 'choose') {
      if (
        typeof b.winner !== 'string' ||
        typeof b.loser !== 'string' ||
        b.winner === b.loser
      )
        throw Error('A choice needs two different jobs.');
      if (Object.hasOwn(b, 'delta'))
        throw Error('A choice is two jobs, not a comparison vector.');
      const { pool, corpus } = await state(db, user);
      const winner = pool.find((p) => p.job_key === b.winner);
      const loser = pool.find((p) => p.job_key === b.loser);
      if (!winner || !loser)
        throw Error('Those postings are no longer in the pool.');
      const delta = difference(vector(winner, corpus), vector(loser, corpus));
      await db.batch([
        db
          .prepare(
            'INSERT INTO choices (id,owner,winner,loser,delta,created) VALUES (?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            user,
            b.winner,
            b.loser,
            JSON.stringify(delta),
            now,
          ),
        db
          .prepare(
            'INSERT INTO preferences (owner,weights,pairs,updated) VALUES (?,?,1,?) ON CONFLICT(owner) DO UPDATE SET pairs=preferences.pairs+1, updated=excluded.updated',
          )
          .bind(user, '', now),
      ]);
      const after = await state(db, user);
      await db
        .prepare('UPDATE preferences SET weights=? WHERE owner=?')
        .bind(JSON.stringify(Object.values(after.weights)), user)
        .run();
      return reply({ ok: true, weights: after.weights });
    }
    if (b.action === 'minutes') {
      const minutes = Number(b.minutes);
      if (!Number.isFinite(minutes) || minutes < 15 || minutes > 2400)
        throw Error('Set between 15 and 2400 minutes a week.');
      await db
        .prepare(
          'INSERT INTO preferences (owner,minutes,updated) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET minutes=excluded.minutes, updated=excluded.updated',
        )
        .bind(user, Math.round(minutes), now)
        .run();
      return reply({ ok: true, minutes: Math.round(minutes) });
    }
    // Preferences drift. Clearing the log refits from nothing rather than
    // leaving stale weights in place under a new intention.
    if (b.action === 'reset') {
      await db.batch([
        db.prepare('DELETE FROM choices WHERE owner=?').bind(user),
        db
          .prepare(
            "UPDATE preferences SET weights='', pairs=0, updated=? WHERE owner=?",
          )
          .bind(now, user),
      ]);
      return reply({ ok: true });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : 'Unable to complete request.' },
      400,
    );
  }
}
