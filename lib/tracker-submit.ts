export type TrackerSubmitAction = 'preview' | 'import';

export type TrackerSubmitGate = {
  generation: number;
  pending: TrackerSubmitAction | null;
};

const importWrites = new Map<string, number>();
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
  importWrites.set(owner, token);
  return token;
}

export function ownerImportWritePending(owner: string) {
  return importWrites.has(owner);
}

export function completeOwnerImportWrite(owner: string, token: number) {
  if (importWrites.get(owner) === token) importWrites.delete(owner);
}

export function resetOwnerTrackerSubmit() {
  importWrites.clear();
  importWriteGeneration = 0;
}
