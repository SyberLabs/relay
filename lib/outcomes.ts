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
export function isTerminal(status: string): boolean {
  return (terminalStates as readonly string[]).includes(status);
}
export function statusAfter(kind: OutcomeKind): string | null {
  return resulting[kind];
}
// A receipt distinguishes a manually recorded submission from an unverified
// status label. Keep the event auditable and owner/version bound.
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
  // Offer is terminal for import and editor status, but it is still the
  // status from which an offer is accepted, declined, or withdrawn.
  if (job.status === 'Accepted' || job.status === 'Closed')
    throw Error('This job has already ended. Reopen it before recording more.');
  if (
    kind !== 'submitted' &&
    job.status !== 'Submitted' &&
    job.status !== 'Live loop' &&
    job.status !== 'Offer'
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
