import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { clusterOf, usableFact } from '../../../lib/profile';
import { corpusOf, fitWeights, normalise, utility } from '../../../lib/utility';
import {
  expectedMax,
  freshness,
  reason,
  responseRate,
  selectPortfolio,
  tierOf,
  type Candidate,
} from '../../../lib/scoring';
import { evidence } from '../../../lib/outcomes';
import {
  loadChoices,
  loadFacts,
  loadJobs,
  loadOutcomes,
  loadPreferences,
  toPosting,
} from '../../../lib/store';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const user = (await getChatGPTUser())?.userId;
  if (!user) return reply({ error: 'Sign in to see your plan.' }, 401);
  const db = database(),
    now = new Date().toISOString();
  const [prefs, choices, facts, jobs, outcomes] = await Promise.all([
    loadPreferences(db, user),
    loadChoices(db, user),
    loadFacts(db, user),
    loadJobs(db, user),
    loadOutcomes(db, user),
  ]);
  const weights = fitWeights(
    choices.map((c) => JSON.parse(c.delta) as number[]),
  );
  const corpus = corpusOf(
    facts.filter((f) => usableFact(f, now)).map((f) => f.claim),
  );
  const clusters = new Map(jobs.map((j) => [j.id, clusterOf(j.name)]));
  const seen = evidence(outcomes, (id) => clusters.get(id) || 'general');
  // Only jobs still awaiting a decision are candidates. Anything submitted,
  // skipped or ended is history, not this week's work.
  const open = jobs.filter((j) => j.status === 'Held' || j.status === 'Ready');
  const utilities = normalise(
    open.map((j) => utility(toPosting(j), weights, corpus)),
  );
  const rates = new Map<string, ReturnType<typeof responseRate>>();
  const candidates: Candidate[] = open.map((j, i) => {
    const cluster = clusters.get(j.id) || 'general';
    const ev = seen[cluster] || { sent: 0, responses: 0 };
    const rate = responseRate(ev.sent, ev.responses);
    rates.set(j.id, rate);
    return {
      job_key: j.job_key,
      u: utilities[i],
      p: rate.mean * freshness(j.posted, now),
      effort: j.effort || 20,
    };
  });
  const plan = selectPortfolio(candidates, prefs.minutes);
  const byKey = new Map(
    open.map((j, i) => [j.job_key, { job: j, u: utilities[i] }]),
  );
  const detail = (c: Candidate) => {
    const entry = byKey.get(c.job_key)!;
    const rate = rates.get(entry.job.id)!;
    return {
      id: entry.job.id,
      job_key: c.job_key,
      name: entry.job.name,
      company: entry.job.company,
      status: entry.job.status,
      cluster: clusters.get(entry.job.id),
      u: Number(c.u.toFixed(3)),
      p: Number(c.p.toFixed(4)),
      tier: tierOf(c.p),
      effort: c.effort,
      evidence: rate.sent,
      band: [Number(rate.low.toFixed(3)), Number(rate.high.toFixed(3))],
      reason: reason(c, now, entry.job.posted),
    };
  };
  const chosenKeys = new Set(plan.chosen.map((c) => c.job_key));
  return reply({
    minutes: prefs.minutes,
    calibrated: choices.length,
    weights,
    spent: plan.spent,
    expected: Number(plan.expected.toFixed(4)),
    // What the same budget would buy if it simply took the highest utilities.
    // Reported so the portfolio's advantage is visible rather than asserted.
    naive: Number(
      expectedMax(
        [...candidates]
          .sort((a, b) => b.u - a.u)
          .reduce<Candidate[]>((acc, c) => {
            const spent = acc.reduce((s, x) => s + x.effort, 0);
            if (spent + c.effort <= prefs.minutes) acc.push(c);
            return acc;
          }, []),
      ).toFixed(4),
    ),
    plan: plan.chosen.map(detail),
    rest: candidates
      .filter((c) => !chosenKeys.has(c.job_key))
      .sort((a, b) => b.u - a.u)
      .slice(0, 25)
      .map(detail),
  });
}
