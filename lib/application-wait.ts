export const APPLICATION_WAIT_POLL_MS = 3_000;
export const APPLICATION_WAIT_ARM_MS = 12_000;
export const APPLICATION_WAIT_DEFAULT_MS = 40_000;
export const APPLICATION_WAIT_MAX_MS = 300_000;
export const APPLICATION_WAIT_MAX_REQUESTS = 126;

export type ApplicationWaitPin = {
  job: string;
  preparation_revision: string | null;
  id: string;
  digest: string;
  actor: string;
  wait_ms?: number;
};

export type ApplicationWaitAuthorized = {
  authorized: true;
  viewer: string;
  job: string;
  preparation_revision: string | null;
  id: string;
  digest: string;
  state: 'authorized';
};

export type ApplicationWaitIo = {
  readWorkspace: (signal: AbortSignal) => Promise<unknown>;
  inspect: (job: string, signal: AbortSignal) => Promise<unknown>;
  arm: (body: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  maxMs?: number;
  maxRequests?: number;
};

type InspectWaitView = {
  viewer: string;
  job_id: string;
  preparation_revision: string | null;
  operation_id: string | null;
  digest: string | null;
  state: string | null;
  armed: boolean;
  recorded_result?: string | null;
  recorded_receipt?: string | null;
};

export class ApplicationWaitRefusal extends Error {
  constructor(payload: Record<string, unknown>) {
    super(JSON.stringify(payload));
    this.name = 'ApplicationWaitRefusal';
  }
}

function refuse(payload: Record<string, unknown>): never {
  throw new ApplicationWaitRefusal(payload);
}

function isAbort(error: unknown) {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException)
  );
}

function sleepMs(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort);
  });
}

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function parseToolError(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof Error)) return null;
  try {
    const body = JSON.parse(error.message) as unknown;
    const record = asRecord(body);
    if (record && typeof record.error === 'string') return record;
  } catch {
    return null;
  }
  return null;
}

function rethrowIo(error: unknown): never {
  if (error instanceof ApplicationWaitRefusal) throw error;
  if (isAbort(error))
    refuse({
      error: 'Application wait stopped because the Relay tab closed.',
      code: 'wait_aborted',
    });
  const body = parseToolError(error);
  if (body) throw new ApplicationWaitRefusal(body);
  refuse({
    error: 'Application wait failed. Inspect saved work before continuing.',
    code: 'wait_failed',
  });
}

function requirePin(pin: ApplicationWaitPin) {
  if (
    typeof pin.job !== 'string' ||
    pin.job.length === 0 ||
    pin.job.length > 100 ||
    typeof pin.id !== 'string' ||
    pin.id.length === 0 ||
    pin.id.length > 100 ||
    typeof pin.digest !== 'string' ||
    pin.digest.length === 0 ||
    pin.digest.length > 64 ||
    typeof pin.actor !== 'string' ||
    pin.actor.length === 0 ||
    pin.actor.length > 100 ||
    !(
      pin.preparation_revision === null ||
      (typeof pin.preparation_revision === 'string' &&
        pin.preparation_revision.length <= 100)
    ) ||
    (pin.wait_ms !== undefined &&
      !(
        Number.isInteger(pin.wait_ms) &&
        pin.wait_ms >= 1 &&
        pin.wait_ms <= APPLICATION_WAIT_MAX_MS
      ))
  )
    refuse({
      error:
        'Supply job, preparation_revision, operation id, digest and actor.',
      code: 'wait_malformed',
    });
}

function parseView(raw: unknown): InspectWaitView {
  const record = asRecord(raw);
  if (
    !record ||
    typeof record.job_id !== 'string' ||
    record.job_id.length === 0 ||
    typeof record.viewer !== 'string' ||
    record.viewer.length === 0 ||
    !(
      record.preparation_revision === null ||
      typeof record.preparation_revision === 'string'
    ) ||
    !(
      record.operation_id === null || typeof record.operation_id === 'string'
    ) ||
    !(record.digest === null || typeof record.digest === 'string') ||
    !(record.state === null || typeof record.state === 'string') ||
    typeof record.armed !== 'boolean'
  )
    refuse({
      error:
        'Inspect snapshot was malformed. Inspect saved work before waiting again.',
      code: 'wait_malformed',
    });
  return {
    viewer: record.viewer,
    job_id: record.job_id,
    preparation_revision: record.preparation_revision,
    operation_id: record.operation_id,
    digest: record.digest,
    state: record.state,
    armed: record.armed,
    recorded_result:
      typeof record.recorded_result === 'string' ||
      record.recorded_result === null
        ? record.recorded_result
        : null,
    recorded_receipt:
      typeof record.recorded_receipt === 'string' ||
      record.recorded_receipt === null
        ? record.recorded_receipt
        : null,
  };
}

function pinMatches(view: InspectWaitView, pin: ApplicationWaitPin) {
  return (
    view.job_id === pin.job &&
    view.preparation_revision === pin.preparation_revision &&
    view.operation_id === pin.id &&
    view.digest === pin.digest
  );
}

function authorized(
  viewer: string,
  pin: ApplicationWaitPin,
): ApplicationWaitAuthorized {
  return {
    authorized: true,
    viewer,
    job: pin.job,
    preparation_revision: pin.preparation_revision,
    id: pin.id,
    digest: pin.digest,
    state: 'authorized',
  };
}

function decide(
  view: InspectWaitView,
  pin: ApplicationWaitPin,
  viewer: string,
) {
  if (view.viewer !== viewer)
    refuse({
      error: 'Account changed. Rebind viewer before waiting again.',
      code: 'wait_viewer_changed',
    });
  if (!pinMatches(view, pin))
    refuse({
      error:
        'Preparation or payload changed. Inspect saved work before waiting again.',
      code: 'wait_pin_changed',
    });
  if (view.state === 'authorized') return authorized(viewer, pin);
  if (view.state === 'cancelled')
    refuse({
      error: 'Application wait cancelled.',
      code: 'wait_cancelled',
    });
  if (view.state === 'executing')
    refuse({
      error:
        'Application already executing. Inspect saved work; do not submit again.',
      code: 'wait_executing',
    });
  if (
    view.state === 'submitted' ||
    view.state === 'uncertain' ||
    view.state === 'not-submitted'
  )
    refuse({
      error:
        'Application outcome is already recorded. Inspect saved work; do not submit again.',
      code: 'wait_terminal',
      state: view.state,
      recorded_result: view.recorded_result ?? view.state,
      recorded_receipt: view.recorded_receipt ?? null,
    });
  if (view.state !== 'proposed')
    refuse({
      error:
        'Inspect snapshot was malformed. Inspect saved work before waiting again.',
      code: 'wait_malformed',
    });
  return null;
}

async function runWait(
  io: ApplicationWaitIo,
  pin: ApplicationWaitPin,
  signal: AbortSignal,
): Promise<ApplicationWaitAuthorized> {
  requirePin(pin);
  const now = io.now ?? Date.now;
  const sleep = io.sleep ?? sleepMs;
  const maxMs = io.maxMs ?? pin.wait_ms ?? APPLICATION_WAIT_DEFAULT_MS;
  const maxRequests = io.maxRequests ?? APPLICATION_WAIT_MAX_REQUESTS;
  const start = now();
  let requests = 0;
  let lastOwnArm: number | undefined;
  const live = () => {
    if (signal.aborted) rethrowIo(abortError());
    if (now() - start >= maxMs)
      refuse({
        error: 'Application wait timed out.',
        code: 'wait_timeout',
      });
  };
  const request = async <T>(
    work: (slice: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    live();
    if (requests >= maxRequests)
      refuse({
        error: 'Application wait reached its request limit.',
        code: 'wait_budget',
      });
    requests += 1;
    const remaining = maxMs - (now() - start);
    if (remaining <= 0)
      refuse({
        error: 'Application wait timed out.',
        code: 'wait_timeout',
      });
    const slice = new AbortController();
    const onParent = () => slice.abort();
    signal.addEventListener('abort', onParent);
    const running = work(slice.signal);
    const deadline = sleep(remaining, slice.signal).then(() => {
      if (signal.aborted) rethrowIo(abortError());
      refuse({
        error: 'Application wait timed out.',
        code: 'wait_timeout',
      });
    });
    try {
      const value = await Promise.race([running, deadline]);
      live();
      return value;
    } catch (error) {
      rethrowIo(error);
    } finally {
      signal.removeEventListener('abort', onParent);
      slice.abort();
      void running.catch(() => {});
      void deadline.catch(() => {});
    }
  };
  const workspace = asRecord(await request((slice) => io.readWorkspace(slice)));
  const viewer = workspace?.viewer;
  if (typeof viewer !== 'string' || viewer.length === 0)
    refuse({
      error:
        'Inspect snapshot was malformed. Inspect saved work before waiting again.',
      code: 'wait_malformed',
    });
  while (true) {
    live();
    const view = parseView(
      await request((slice) => io.inspect(pin.job, slice)),
    );
    live();
    const done = decide(view, pin, viewer);
    if (done) {
      live();
      return done;
    }
    const due = view.armed
      ? lastOwnArm !== undefined
        ? now() - lastOwnArm >= APPLICATION_WAIT_ARM_MS
        : now() - start >= APPLICATION_WAIT_ARM_MS
      : lastOwnArm === undefined ||
        now() - lastOwnArm >= APPLICATION_WAIT_ARM_MS;
    if (due) {
      live();
      const armed = parseView(
        await request((slice) =>
          io.arm(
            {
              action: 'arm',
              viewer,
              job: pin.job,
              preparation_revision: pin.preparation_revision,
              id: pin.id,
              actor: pin.actor,
            },
            slice,
          ),
        ),
      );
      lastOwnArm = now();
      live();
      const afterArm = decide(armed, pin, viewer);
      if (afterArm) return afterArm;
    }
    live();
    const remaining = maxMs - (now() - start);
    if (remaining <= 0)
      refuse({
        error: 'Application wait timed out.',
        code: 'wait_timeout',
      });
    await sleep(Math.min(APPLICATION_WAIT_POLL_MS, remaining), signal).catch(
      rethrowIo,
    );
    live();
  }
}

export function createApplicationWait(
  io: ApplicationWaitIo,
  parentSignal?: AbortSignal,
) {
  let active: AbortController | null = null;
  return {
    wait(pin: ApplicationWaitPin) {
      if (active)
        return Promise.reject(
          new ApplicationWaitRefusal({
            error: 'Another application wait is already active in this tab.',
            code: 'wait_busy',
          }),
        );
      const run = new AbortController();
      active = run;
      const onParent = () => run.abort();
      parentSignal?.addEventListener('abort', onParent);
      if (parentSignal?.aborted) run.abort();
      return runWait(io, pin, run.signal).finally(() => {
        parentSignal?.removeEventListener('abort', onParent);
        if (active === run) active = null;
      });
    },
  };
}
