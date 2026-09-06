import { trustMap, type DraftRow } from './profile.ts';
// Whether an unattended run may happen, and at what scale.
//
// These gates live in code rather than on a checklist because a checklist is
// something a person ticks off outside the program and can therefore skip. The
// driver computes its own readiness, so the constraint is enforced by the thing
// being constrained.
export type Gate = {
  id: string;
  passed: boolean;
  label: string;
  detail: string;
};
export type Readiness = {
  gates: Gate[];
  passed: number;
  ready: boolean;
  allowance: number;
  cap: string;
  reviewed: number;
  refusals: { attempts: number; refused: number; rate: number };
};
export const thresholds = {
  receiptedOutcomes: 20,
  refusalRate: 0.1,
  // Below this many attempts a rate is noise, so the gate reports insufficient
  // evidence rather than passing on a lucky streak.
  refusalSample: 10,
};
export function refusalRate(
  refusals: unknown[],
  loggedDrafts: unknown[],
): { attempts: number; refused: number; rate: number } {
  const refused = refusals.length,
    attempts = refused + loggedDrafts.length;
  return { attempts, refused, rate: attempts ? refused / attempts : 0 };
}
// Never generate more unreviewed work than the person has shown they will
// review. A reviewer facing forty documents stops reviewing and starts
// approving, so the backlog is prevented rather than managed.
export function allowanceFor(
  reviewed: number,
  budgetDrafts: number,
  requested?: number,
): { allowance: number; cap: string } {
  const limits: [number, string][] = [
    [Math.max(0, Math.floor(budgetDrafts)), 'attention budget'],
    [Math.max(0, reviewed), 'reviewed drafts'],
  ];
  if (typeof requested === 'number' && Number.isFinite(requested))
    limits.push([Math.max(0, Math.floor(requested)), 'requested']);
  limits.sort((a, b) => a[0] - b[0]);
  const [value, cap] = limits[0];
  // An unproven profile may still write one supervised draft. That is how the
  // first review session comes to exist at all, so running the driver is a way
  // to satisfy the gates rather than a way around them.
  return value < 1
    ? { allowance: 1, cap: 'supervised minimum' }
    : { allowance: value, cap };
}
export function readiness({
  batches,
  drafts,
  outcomes,
  refusals,
  budgetDrafts,
  requested,
  staleFacts = false,
}: {
  batches: { closed: string | null }[];
  drafts: DraftRow[];
  outcomes: { kind: string; receipt: string | null }[];
  refusals: unknown[];
  budgetDrafts: number;
  requested?: number;
  staleFacts?: boolean;
}): Readiness {
  const reviewed = drafts.filter((d) => d.verdict !== 'Logged');
  const logged = drafts.filter((d) => d.verdict === 'Logged');
  const closed = batches.filter((b) => b.closed).length;
  const graduated = Object.values(trustMap(drafts, staleFacts)).filter(
    (t) => t.state === 'Graduated',
  );
  const receipted = outcomes.filter(
    (o) => o.kind === 'submitted' && !!o.receipt,
  ).length;
  const rate = refusalRate(refusals, logged.concat(reviewed));
  const gates: Gate[] = [
    {
      id: 'supervised_run',
      passed: closed > 0,
      label: 'supervised run',
      detail: closed
        ? `${closed} review session${closed > 1 ? 's' : ''} closed`
        : 'no review session closed yet',
    },
    {
      id: 'graduated_cluster',
      passed: graduated.length > 0,
      label: 'graduated cluster',
      detail: graduated.length
        ? graduated.map((g) => g.cluster).join(', ')
        : 'no cluster has graduated',
    },
    {
      id: 'receipted_outcomes',
      passed: receipted >= thresholds.receiptedOutcomes,
      label: 'receipted outcomes',
      detail: `${receipted} of ${thresholds.receiptedOutcomes}`,
    },
    {
      id: 'refusal_rate',
      passed:
        rate.attempts >= thresholds.refusalSample &&
        rate.rate < thresholds.refusalRate,
      label: 'refusal rate',
      detail:
        rate.attempts < thresholds.refusalSample
          ? `${rate.refused} of ${rate.attempts} attempts — too few to judge`
          : `${rate.refused} of ${rate.attempts} attempts (${Math.round(rate.rate * 100)}%)`,
    },
  ];
  const passed = gates.filter((g) => g.passed).length;
  const ready = passed === gates.length;
  // Full readiness removes the evidence cap and leaves the budget in charge.
  // That is the only thing the gates unlock.
  const { allowance, cap } = ready
    ? allowanceFor(Number.POSITIVE_INFINITY, budgetDrafts, requested)
    : allowanceFor(reviewed.length, budgetDrafts, requested);
  return {
    gates,
    passed,
    ready,
    allowance,
    cap,
    reviewed: reviewed.length,
    refusals: rate,
  };
}
