// Relay's state machine used to stop at Live loop, which meant nothing could
// ever be learned from it. Outcomes close the loop.
//
// These states are deliberately NOT valid import statuses. A terminal outcome
// is a local record of something that actually happened, set by an explicit
// action here, so the existing import status matrix is untouched and
// rediscovery can never resurrect a job that has already ended.
export const terminalStates = ['Offer', 'Accepted', 'Closed'] as const;
export const outcomeKinds = [
  'submitted',
  'response',
  'screen',
  'onsite',
  'offer',
  'accepted',
  'rejected',
  'ghosted',
  'withdrawn',
] as const;
export type OutcomeKind = (typeof outcomeKinds)[number];
// What each recorded event does to the job's status. Progress through a live
// loop does not change status, because the status already says Live loop; only
// the ends of the process move it.
const resulting: Record<OutcomeKind, string | null> = {
  submitted: 'Submitted',
  response: 'Live loop',
  screen: 'Live loop',
  onsite: 'Live loop',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Closed',
  ghosted: 'Closed',
  withdrawn: 'Closed',
};
// Which kinds count as the employer having replied. Used for the response rate
// posterior, so a submission with no reply is evidence too.
const responded = new Set<OutcomeKind>([
  'response',
  'screen',
  'onsite',
  'offer',
  'accepted',
  'rejected',
]);
export function isTerminal(status: string): boolean {
  return (terminalStates as readonly string[]).includes(status);
}
export function statusAfter(kind: OutcomeKind): string | null {
  return resulting[kind];
}
export function countsAsResponse(kind: string): boolean {
  return responded.has(kind as OutcomeKind);
}
// The receipt invariant. A submission recorded here must carry proof, because a
// false "submitted" is doubly corrupting: deduplication stops you ever applying
// to a job you never actually applied to, and the response-rate posterior
// counts a send that never happened. Imported submissions are kept, but they
// arrive without a receipt and are excluded from learning.
export function validateOutcome(
  job: { status: string },
  body: {
    kind?: unknown;
    occurred?: unknown;
    receipt?: unknown;
    detail?: unknown;
  },
): {
  kind: OutcomeKind;
  occurred: string;
  receipt: string | null;
  detail: string;
} {
  const kind = body.kind as OutcomeKind;
  if (!(outcomeKinds as readonly string[]).includes(kind))
    throw Error('Record a known outcome.');
  if (isTerminal(job.status))
    throw Error('This job has already ended. Reopen it before recording more.');
  if (
    kind !== 'submitted' &&
    job.status !== 'Submitted' &&
    job.status !== 'Live loop'
  )
    throw Error('Record the submission before recording what came back.');
  if (kind === 'submitted' && job.status !== 'Ready')
    throw Error('Accept the exact draft before recording a submission.');
  const receipt = typeof body.receipt === 'string' ? body.receipt.trim() : '';
  if (kind === 'submitted' && receipt.length < 4)
    throw Error(
      'A submission needs a receipt: the confirmation URL, reference or email subject.',
    );
  if (receipt.length > 2000) throw Error('Use a shorter receipt reference.');
  const occurred =
    typeof body.occurred === 'string' && body.occurred
      ? body.occurred
      : new Date().toISOString();
  if (Number.isNaN(Date.parse(occurred)))
    throw Error('Use an ISO date for when this happened.');
  const detail =
    typeof body.detail === 'string' ? body.detail.slice(0, 4000) : '';
  return {
    kind,
    occurred: new Date(occurred).toISOString(),
    receipt: receipt || null,
    detail,
  };
}
export type OutcomeRow = {
  job_id: string;
  kind: string;
  receipt: string | null;
};
// Evidence for the response-rate posterior, counted only over submissions we
// can prove happened.
export function evidence(
  outcomes: OutcomeRow[],
  clusterOfJob: (jobId: string) => string,
): Record<string, { sent: number; responses: number }> {
  const out: Record<string, { sent: number; responses: number }> = {};
  const sentJobs = new Set<string>();
  for (const o of outcomes)
    if (o.kind === 'submitted' && o.receipt) sentJobs.add(o.job_id);
  for (const jobId of sentJobs) {
    const cluster = clusterOfJob(jobId);
    out[cluster] ??= { sent: 0, responses: 0 };
    out[cluster].sent++;
  }
  const replied = new Set<string>();
  for (const o of outcomes)
    if (sentJobs.has(o.job_id) && countsAsResponse(o.kind))
      replied.add(o.job_id);
  for (const jobId of replied) {
    const cluster = clusterOfJob(jobId);
    out[cluster] ??= { sent: 0, responses: 0 };
    out[cluster].responses++;
  }
  return out;
}
