export type TrackerSubmitAction = 'preview' | 'import';

export type TrackerSubmitGate = {
  generation: number;
  pending: TrackerSubmitAction | null;
};

// Isolate-local: preview 409 while any import/bootstrap for this owner is
// still running here. Unique indexes remain the durable duplicate protection.
const importWrites = new Map<string, Set<number>>();
let importWriteGeneration = 0;

export function createTrackerSubmitGate(): TrackerSubmitGate {
  return { generation: 0, pending: null };
}

export function beginTrackerSubmit(
  gate: TrackerSubmitGate,
  action: TrackerSubmitAction,
): number | null {
  if (gate.pending === 'import') return null;
  if (gate.pending === 'preview' && action === 'preview') return null;
  gate.pending = action;
  gate.generation += 1;
  return gate.generation;
}

export function completeTrackerSubmit(
  gate: TrackerSubmitGate,
  started: number,
): boolean {
  if (gate.generation !== started) return false;
  gate.pending = null;
  return true;
}

export function trackerSubmitIsCurrent(
  gate: TrackerSubmitGate,
  started: number,
) {
  return gate.generation === started;
}

export function beginOwnerImportWrite(owner: string): number {
  const token = ++importWriteGeneration;
  const active = importWrites.get(owner) ?? new Set<number>();
  active.add(token);
  importWrites.set(owner, active);
  return token;
}

export function ownerImportWritePending(owner: string) {
  return (importWrites.get(owner)?.size ?? 0) > 0;
}

export function completeOwnerImportWrite(owner: string, token: number) {
  const active = importWrites.get(owner);
  if (!active) return;
  active.delete(token);
  if (active.size === 0) importWrites.delete(owner);
}

export function resetOwnerTrackerSubmit() {
  importWrites.clear();
  importWriteGeneration = 0;
}
