// You accept one job, so the quantity to maximise is the expected value of the
// best offer received, not the sum over applications. That single distinction
// is what separates portfolio construction from ranking, and it is computed
// exactly here rather than approximated by tier heuristics.
export type Candidate = {
  job_key: string;
  u: number;
  p: number;
  effort: number;
};
export const prior = { alpha: 1, beta: 14 };
export const decayDays = 45;
// A cold prior of roughly 6% response, updated per cluster by what actually
// happened. Early p is a prior, not a measurement, so it is reported with the
// evidence count that produced it and never as a bare number.
export function responseRate(sent: number, responses: number) {
  const a = prior.alpha + Math.max(0, responses),
    b = prior.beta + Math.max(0, sent - responses);
  const mean = a / (a + b);
  const sd = Math.sqrt((a * b) / ((a + b) * (a + b) * (a + b + 1)));
  return {
    mean,
    low: Math.max(0, mean - 2 * sd),
    high: Math.min(1, mean + 2 * sd),
    sent,
  };
}
// A posting filled before you reach it has p = 0, and staleness is the only
// part of that the system can see, so age discounts the prior.
export function freshness(posted: string | null, now: string): number {
  if (!posted) return 0.8;
  const days = (Date.parse(now) - Date.parse(posted)) / 86_400_000;
  if (!Number.isFinite(days)) return 0.8;
  return Math.min(1, Math.max(0.05, Math.exp(-Math.max(0, days) / decayDays)));
}
// Offers are treated as independent draws. Sorting by utility descending, a
// candidate contributes only when it lands an offer and every better one did
// not, which is exactly the expectation of the maximum.
export function expectedMax(candidates: { u: number; p: number }[]): number {
  const sorted = [...candidates].sort((x, y) => y.u - x.u);
  let missed = 1,
    total = 0;
  for (const c of sorted) {
    const p = Math.min(1, Math.max(0, c.p));
    total += c.u * p * missed;
    missed *= 1 - p;
  }
  return total;
}
export function marginalGain(
  chosen: { u: number; p: number }[],
  candidate: { u: number; p: number },
): number {
  return expectedMax([...chosen, candidate]) - expectedMax(chosen);
}
// Greedy on gain per minute under the attention budget. Because the objective
// is an expected maximum rather than a sum, this produces tier spread on its
// own: once a strong likely offer is held, further similar candidates add
// almost nothing and long shots start winning the comparison. No hand-tuned
// reach/match/floor ratio is needed or wanted.
export function selectPortfolio(
  candidates: Candidate[],
  budgetMinutes: number,
): { chosen: Candidate[]; spent: number; expected: number } {
  const chosen: Candidate[] = [];
  const pool = candidates.filter(
    (c) => c.effort > 0 && c.effort <= budgetMinutes,
  );
  let spent = 0;
  while (true) {
    let best: Candidate | null = null,
      bestRate = 0;
    for (const c of pool) {
      if (chosen.includes(c) || spent + c.effort > budgetMinutes) continue;
      const rate = marginalGain(chosen, c) / c.effort;
      if (rate > bestRate) {
        bestRate = rate;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
    spent += best.effort;
  }
  return { chosen, spent, expected: expectedMax(chosen) };
}
// Tiers are a reading aid over the finished portfolio, never the mechanism that
// built it. They are cut on probability, not prestige.
export function tierOf(p: number): string {
  return p < 0.05 ? 'reach' : p < 0.15 ? 'match' : 'floor';
}
// One line saying why a job is in the plan. A ranking that cannot be argued
// with cannot be corrected, so every selection carries its reason.
export function reason(
  c: Candidate,
  now: string,
  posted: string | null,
): string {
  const tier = tierOf(c.p);
  const fresh = freshness(posted, now);
  const parts = [
    tier === 'reach'
      ? 'High value, low odds — this is where the best outcome comes from'
      : tier === 'floor'
        ? 'Strong odds — protects against finishing with no offer'
        : 'Good balance of fit and odds',
  ];
  if (fresh < 0.4) parts.push('posting is ageing, apply soon or drop it');
  if (c.effort >= 40) parts.push('costs more of the week than most');
  return parts.join(' · ');
}
