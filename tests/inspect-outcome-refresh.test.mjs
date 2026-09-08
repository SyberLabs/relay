import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

function compile(text) {
  return stripTypeScriptTypes(text, { mode: 'transform' })
    .trim()
    .replace(/;$/, '');
}

function bind(text, deps) {
  // oxlint-disable-next-line typescript/no-implied-eval -- compile actual Workspace callbacks
  return new Function(...Object.keys(deps), 'return (' + compile(text) + ');')(
    ...Object.values(deps),
  );
}

function inspectOutcomeEffect(src) {
  const token = 'useEffect(() => {\n    if (!inspectJobId) return;';
  const start = src.indexOf(token);
  assert.notEqual(start, -1, 'inspect outcome effect');
  const bodyStart = start + 'useEffect('.length;
  const end = src.indexOf(
    '\n  }, [inspectJobId, inspectOperationId, inspectRecorded, inspectState]);',
    bodyStart,
  );
  assert.notEqual(end, -1, 'inspect outcome effect end');
  return src.slice(bodyStart, end) + '\n  }';
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function setup(src, extra = {}) {
  const state = { message: '' };
  const deps = {
    inspectJobId: 'job-1',
    inspectOperationId: 'op-1',
    inspectRecorded: 'submitted',
    inspectState: 'authorized',
    outcomeSeenRef: { current: '' },
    outcomeBusyRef: { current: false },
    selectedRef: { current: 'job-1' },
    refreshRef: { current: async () => [{ id: 'job-1' }] },
    setMessage: (value) => {
      state.message =
        typeof value === 'function' ? value(state.message) : value;
    },
    ...extra,
  };
  return { state, deps, effect: bind(inspectOutcomeEffect(src), deps) };
}

void test('a failed terminal workspace refresh is retried once and only then marked seen', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  let calls = 0;
  const { state, deps, effect } = setup(src, {
    refreshRef: {
      current: async () => {
        calls += 1;
        if (calls === 1) throw Error('Unable to load.');
        return [{ id: 'job-1', status: 'Submitted' }];
      },
    },
  });
  const cleanup = effect();
  await flush();
  assert.equal(calls, 2);
  assert.equal(deps.outcomeSeenRef.current, 'job-1:op-1:submitted');
  assert.equal(state.message, '');
  assert.equal(deps.outcomeBusyRef.current, false);
  cleanup?.();
});

void test('a single terminal refresh rejection does not suppress a later live refresh', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  let calls = 0;
  const { state, deps, effect } = setup(src, {
    refreshRef: {
      current: async () => {
        calls += 1;
        throw Error('Unable to load.');
      },
    },
  });
  const cleanup = effect();
  await flush();
  assert.equal(calls, 2);
  assert.equal(deps.outcomeSeenRef.current, '');
  assert.equal(state.message, 'Unable to load.');
  cleanup?.();
  deps.refreshRef.current = async () => {
    calls += 1;
    return [{ id: 'job-1', status: 'Submitted' }];
  };
  const again = bind(inspectOutcomeEffect(src), deps);
  again();
  await flush();
  assert.equal(calls, 3);
  assert.equal(deps.outcomeSeenRef.current, 'job-1:op-1:submitted');
});

void test('overlapping terminal refresh is skipped and a stale ignore is not marked seen', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  const first = deferred();
  let calls = 0;
  const { deps, effect } = setup(src, {
    refreshRef: {
      current: async () => {
        calls += 1;
        if (calls === 1) return first.promise;
        throw Error('should not overlap');
      },
    },
  });
  const cleanup = effect();
  await Promise.resolve();
  effect();
  assert.equal(calls, 1);
  first.resolve(undefined);
  await flush();
  assert.equal(deps.outcomeSeenRef.current, '');
  assert.equal(calls, 1);
  cleanup?.();
});

void test('terminal refresh stays honest when the job is not selected', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  let calls = 0;
  const { deps, effect } = setup(src, {
    selectedRef: { current: '' },
    refreshRef: {
      current: async () => {
        calls += 1;
        return [{ id: 'job-1' }];
      },
    },
  });
  effect();
  await flush();
  assert.equal(calls, 0);
  assert.equal(deps.outcomeSeenRef.current, '');
});

void test('non-terminal inspect does not refresh the workspace', async () => {
  const src = readFileSync('app/workspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  let calls = 0;
  const { deps, effect } = setup(src, {
    inspectRecorded: null,
    inspectState: 'authorized',
    refreshRef: {
      current: async () => {
        calls += 1;
        return [{ id: 'job-1' }];
      },
    },
  });
  effect();
  await flush();
  assert.equal(calls, 0);
  assert.equal(deps.outcomeSeenRef.current, '');
});
