import { isTerminal } from './outcomes.ts';

type Row = Record<string, unknown>;
type Call = (path: string, body?: Row) => Promise<unknown>;
export class DraftStageError extends Error {}

// Both assistant transports use the same explicit save. The server remains
// authoritative for ownership, version races, lifecycle restrictions and limits.
export async function stageDraft(call: Call, input: Row) {
  const { id, version, draft, blocker } = input;
  if (typeof id !== 'string' || !id.trim() || id.length > 200)
    throw new DraftStageError('Provide one Relay job id.');
  if (!Number.isSafeInteger(version) || (version as number) < 1)
    throw new DraftStageError(
      'Provide the job version used to prepare this draft.',
    );
  if (typeof draft !== 'string' || draft.length > 20_000)
    throw new DraftStageError(
      'Provide exact draft text of at most 20000 characters.',
    );
  if (typeof blocker !== 'string' || blocker.length > 4_000)
    throw new DraftStageError(
      'Provide an explicit blocker, empty if none, of at most 4000 characters.',
    );
  const snapshot = (await call('/api/workspace')) as {
    jobs: { id: string; status: string }[];
  };
  const job = snapshot.jobs.find((row) => row.id === id);
  if (!job) throw new DraftStageError('Record not found.');
  const status =
    ['Submitted', 'Live loop'].includes(job.status) || isTerminal(job.status)
      ? job.status
      : 'Held';
  // Never carry Ready/acceptance across a stage, substitute the fetched version,
  // forward caller-supplied status, or retry a mutation after a refusal.
  return call('/api/workspace', {
    action: 'save',
    id,
    version,
    draft,
    blocker,
    status,
  });
}
