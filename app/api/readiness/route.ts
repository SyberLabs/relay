import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { usableFact } from '../../../lib/profile';
import { readiness } from '../../../lib/readiness';
import {
  loadBatches,
  loadDrafts,
  loadFacts,
  loadJobs,
  loadOutcomes,
  loadPreferences,
  loadRefusals,
} from '../../../lib/store';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to see readiness.' }, 401);
  const db = database(),
    now = new Date().toISOString();
  const [batches, drafts, outcomes, refusals, facts, jobs, prefs] =
    await Promise.all([
      loadBatches(db, user),
      loadDrafts(db, user),
      loadOutcomes(db, user),
      loadRefusals(db, user),
      loadFacts(db, user),
      loadJobs(db, user),
      loadPreferences(db, user),
    ]);
  // What the week affords, using the effort of the roles actually awaiting a
  // decision rather than a fixed guess.
  const open = jobs.filter((j) => j.status === 'Held' || j.status === 'Ready');
  const efforts = open.map((j) => j.effort || 20).sort((a, b) => a - b);
  const medianEffort = efforts.length ? efforts[efforts.length >> 1] : 20;
  const requested = Number(
    new URL(request.url).searchParams.get('max') ?? Number.NaN,
  );
  return reply(
    readiness({
      batches,
      drafts,
      outcomes,
      refusals,
      budgetDrafts: Math.floor(prefs.minutes / Math.max(1, medianEffort)),
      requested: Number.isFinite(requested) ? requested : undefined,
      // An expired fact demotes every cluster, so readiness must see it too.
      staleFacts: facts.some(
        (f) => f.status === 'Verified' && !usableFact(f, now),
      ),
    }),
  );
}
