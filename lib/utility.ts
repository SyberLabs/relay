import { contentWords } from './profile.ts';
// U(j) is the term the whole selection stage rests on, and it cannot be asked
// for directly: people cannot state trade-off weights in the abstract, but they
// choose between two concrete jobs instantly and accurately. So preferences are
// elicited by forced choice and fitted here, the same way style is elicited by
// correction rather than configuration.
export type Posting = {
  job_key: string;
  name: string;
  company: string;
  level: string;
  remote: string;
  comp_min: number | null;
  comp_max: number | null;
  size: string;
  posted: string | null;
};
export const features = ['comp', 'remote', 'level', 'size', 'domain'] as const;
export type Weights = Record<(typeof features)[number], number>;
export const levels = ['junior', 'mid', 'senior', 'staff', 'principal'];
export const sizes = ['startup', 'growth', 'large'];
// A neutral 0.5 for an unknown attribute keeps a missing field from reading as
// a strong negative, which would quietly rank every posting that hides its
// compensation band below every posting that publishes one.
const UNKNOWN = 0.5;
const COMP_FLOOR = 80_000;
const COMP_CEIL = 400_000;
export function compFeature(min: number | null, max: number | null): number {
  const value = max ?? min;
  if (!value || value <= 0) return UNKNOWN;
  const t =
    (Math.log(value) - Math.log(COMP_FLOOR)) /
    (Math.log(COMP_CEIL) - Math.log(COMP_FLOOR));
  return Math.min(1, Math.max(0, t));
}
function ordinal(value: string, scale: string[]): number {
  const i = scale.indexOf(value);
  return i < 0
    ? UNKNOWN
    : scale.length === 1
      ? UNKNOWN
      : i / (scale.length - 1);
}
export function remoteFeature(remote: string): number {
  return remote === 'remote'
    ? 1
    : remote === 'hybrid'
      ? 0.5
      : remote === 'onsite'
        ? 0
        : UNKNOWN;
}
// Domain fit is computed, never learned as one weight per role family: twelve
// comparisons cannot determine a dozen family weights, and the person's own
// verified claims already say which domains they come from.
function domainFeature(posting: Posting, corpus: Set<string>): number {
  if (!corpus.size) return UNKNOWN;
  const words = contentWords(`${posting.name} ${posting.company}`);
  if (!words.size) return UNKNOWN;
  let hit = 0;
  for (const w of words) if (corpus.has(w)) hit++;
  return Math.min(1, hit / Math.min(words.size, 6));
}
export function vector(posting: Posting, corpus: Set<string>): number[] {
  return [
    compFeature(posting.comp_min, posting.comp_max),
    remoteFeature(posting.remote),
    ordinal(posting.level, levels),
    ordinal(posting.size, sizes),
    domainFeature(posting, corpus),
  ];
}
export function corpusOf(claims: string[]): Set<string> {
  const out = new Set<string>();
  for (const c of claims) for (const w of contentWords(c)) out.add(w);
  return out;
}
function toWeights(v: number[]): Weights {
  return Object.fromEntries(features.map((f, i) => [f, v[i] ?? 0])) as Weights;
}
function toVector(w: Weights): number[] {
  return features.map((f) => w[f] ?? 0);
}
export function difference(a: number[], b: number[]): number[] {
  return a.map((x, i) => x - b[i]);
}
export function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
}
// Pairwise logistic regression on the difference vectors: each recorded choice
// says only that the winner scores higher, which is exactly the constraint
// sigma(theta . delta) > 0.5 encodes. Plain gradient ascent with L2 is enough
// for five weights and a dozen comparisons, and stays deterministic.
export function isChoiceDelta(delta: unknown): delta is number[] {
  return (
    Array.isArray(delta) &&
    delta.length === features.length &&
    delta.every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 1,
    )
  );
}
export function fitWeights(
  deltas: number[][],
  steps = 600,
  rate = 0.6,
  l2 = 0.02,
): Weights {
  const theta = Array.from<number>({ length: features.length }).fill(0);
  const usable = deltas.filter(isChoiceDelta);
  if (!usable.length) return toWeights(theta);
  for (let step = 0; step < steps; step++) {
    const grad = Array.from<number>({ length: features.length }).fill(0);
    for (const d of usable) {
      // Every recorded delta is winner minus loser, so the target is always 1.
      const p = 1 / (1 + Math.exp(-dot(theta, d)));
      for (let i = 0; i < grad.length; i++) grad[i] += (1 - p) * d[i];
    }
    for (let i = 0; i < theta.length; i++)
      theta[i] += rate * (grad[i] / usable.length - l2 * theta[i]);
  }
  // Scale to unit L1 so weights read as shares of attention between attributes
  // and utilities stay comparable across refits.
  const mass = theta.reduce((s, x) => s + Math.abs(x), 0);
  return toWeights(mass > 1e-9 ? theta.map((x) => x / mass) : theta);
}
export function utility(
  posting: Posting,
  weights: Weights,
  corpus: Set<string>,
): number {
  return dot(toVector(weights), vector(posting, corpus));
}
// Utilities are compared against each other inside E[max], so the set is
// rescaled to [0,1]. A set whose postings are indistinguishable collapses to a
// constant rather than manufacturing spread that is not there.
export function normalise(values: number[]): number[] {
  const lo = Math.min(...values),
    hi = Math.max(...values);
  if (!values.length) return [];
  if (hi - lo < 1e-9) return values.map(() => 0.5);
  return values.map((v) => (v - lo) / (hi - lo));
}
export type Pair = { a: Posting; b: Posting; delta: number[] };
// Ask the most informative question available. Before any weights exist every
// comparison is equally uncertain, so the tie-break is feature spread; once
// weights exist, the pair the model is least sure about teaches the most.
export function nextPair(
  postings: Posting[],
  weights: Weights,
  corpus: Set<string>,
  asked: Set<string> = new Set(),
): Pair | null {
  const theta = toVector(weights);
  const vectors = new Map(postings.map((p) => [p.job_key, vector(p, corpus)]));
  let best: Pair | null = null,
    bestScore = -Infinity;
  for (let i = 0; i < postings.length; i++)
    for (let j = i + 1; j < postings.length; j++) {
      const a = postings[i],
        b = postings[j];
      if (asked.has(pairKey(a.job_key, b.job_key))) continue;
      const delta = difference(
        vectors.get(a.job_key)!,
        vectors.get(b.job_key)!,
      );
      const spread = delta.reduce((s, x) => s + Math.abs(x), 0);
      if (spread < 0.15) continue;
      // Prefer a choice that turns on two or three attributes: one attribute
      // teaches little, and five at once cannot be attributed to any of them.
      const moving = delta.filter((x) => Math.abs(x) > 0.15).length;
      const focus = moving >= 2 && moving <= 3 ? 1 : 0.45;
      const score = (spread * focus) / (1 + 3 * Math.abs(dot(theta, delta)));
      if (score > bestScore) {
        bestScore = score;
        best = { a, b, delta };
      }
    }
  return best;
}
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('||');
}
