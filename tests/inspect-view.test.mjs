import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInspectPoll,
  beginInspectPoll,
  createInspectPollGate,
  inspectOperativeStatus,
  inspectShowsAuthorizedWaiting,
  inspectShowsExecuting,
  inspectShowsReadyNotArmed,
  inspectShowsUncertain,
  selectInspectJob,
} from '../lib/inspect-view.ts';

function snapshot(jobId, extra = {}) {
  return {
    job_id: jobId,
    preparation_revision: 'revision-' + jobId,
    destination: 'https://employer.example/jobs/' + jobId,
    fields: [
      {
        label: 'Full name',
        filled: true,
        unknown: false,
        value: 'Avery Example',
      },
    ],
    files: [],
    ready: true,
    armed: true,
    operation_id: 'op-' + jobId,
    digest: 'd-' + jobId,
    state: 'proposed',
    accept_enabled: true,
    viewer: 'owner-a',
    ...extra,
  };
}

void test('job switch ignores the previous job poll so Accept cannot keep its fields', () => {
  const gate = createInspectPollGate();
  selectInspectJob(gate, 'job-a');
  const pollA = beginInspectPoll(gate);
  selectInspectJob(gate, 'job-b');
  const applied = applyInspectPoll(
    gate,
    { jobId: 'job-a', generation: pollA },
    { ok: true, data: snapshot('job-a') },
  );
  assert.equal(applied.type, 'ignore');
});

void test('GET whose job_id is not the selected job is ignored', () => {
  const gate = createInspectPollGate();
  selectInspectJob(gate, 'job-b');
  const generation = beginInspectPoll(gate);
  const applied = applyInspectPoll(
    gate,
    { jobId: 'job-b', generation },
    { ok: true, data: snapshot('job-a') },
  );
  assert.equal(applied.type, 'ignore');
});

void test('an older poll does not replace a newer poll for the same job', () => {
  const gate = createInspectPollGate();
  selectInspectJob(gate, 'job-a');
  const older = beginInspectPoll(gate);
  const newer = beginInspectPoll(gate);
  const latest = applyInspectPoll(
    gate,
    { jobId: 'job-a', generation: newer },
    {
      ok: true,
      data: snapshot('job-a', {
        fields: [],
        accept_enabled: false,
        armed: false,
      }),
    },
  );
  const stale = applyInspectPoll(
    gate,
    { jobId: 'job-a', generation: older },
    { ok: true, data: snapshot('job-a') },
  );
  assert.equal(latest.type, 'view');
  assert.equal(latest.view.accept_enabled, false);
  assert.equal(stale.type, 'ignore');
});

void test('a failed live poll clears the view so Accept disables', () => {
  const gate = createInspectPollGate();
  selectInspectJob(gate, 'job-a');
  const generation = beginInspectPoll(gate);
  const applied = applyInspectPoll(
    gate,
    { jobId: 'job-a', generation },
    { ok: false, data: { error: 'Application history is unavailable.' } },
  );
  assert.equal(applied.type, 'clear');
});

void test('a failed older poll does not clear a newer view', () => {
  const gate = createInspectPollGate();
  selectInspectJob(gate, 'job-a');
  const older = beginInspectPoll(gate);
  const newer = beginInspectPoll(gate);
  const latest = applyInspectPoll(
    gate,
    { jobId: 'job-a', generation: newer },
    { ok: true, data: snapshot('job-a') },
  );
  const failed = applyInspectPoll(
    gate,
    { jobId: 'job-a', generation: older },
    { ok: false },
  );
  assert.equal(latest.type, 'view');
  assert.equal(failed.type, 'ignore');
});

void test('matching job poll applies the snapshot', () => {
  const gate = createInspectPollGate();
  selectInspectJob(gate, 'job-b');
  const generation = beginInspectPoll(gate);
  const data = snapshot('job-b');
  const applied = applyInspectPoll(
    gate,
    { jobId: 'job-b', generation },
    { ok: true, data },
  );
  assert.equal(applied.type, 'view');
  assert.equal(applied.view.job_id, 'job-b');
  assert.equal(applied.view.accept_enabled, true);
  assert.equal(applied.viewer, 'owner-a');
});

void test('authorized waiting wins over ready-not-armed copy', () => {
  const view = snapshot('job-a', {
    ready: true,
    armed: false,
    state: 'authorized',
    accept_enabled: false,
  });
  assert.equal(inspectShowsReadyNotArmed(view), false);
  assert.equal(inspectShowsAuthorizedWaiting(view), true);
});

void test('ready not armed shows only when the operative left before authorize', () => {
  const view = snapshot('job-a', {
    ready: true,
    armed: false,
    state: 'proposed',
    accept_enabled: false,
  });
  assert.equal(inspectShowsReadyNotArmed(view), true);
  assert.equal(inspectShowsAuthorizedWaiting(view), false);
});

void test('submitted hides ready-not-armed and authorized-waiting copy', () => {
  const view = snapshot('job-a', {
    ready: true,
    armed: false,
    state: 'submitted',
    accept_enabled: false,
  });
  assert.equal(inspectShowsReadyNotArmed(view), false);
  assert.equal(inspectShowsAuthorizedWaiting(view), false);
});

void test('authorized waiting is only authorized, not executing or uncertain', () => {
  const authorized = snapshot('job-a', {
    ready: true,
    armed: false,
    state: 'authorized',
    accept_enabled: false,
  });
  const executing = snapshot('job-a', {
    ready: true,
    armed: true,
    state: 'executing',
    accept_enabled: false,
  });
  const uncertain = snapshot('job-a', {
    ready: true,
    armed: false,
    state: 'uncertain',
    accept_enabled: false,
  });
  assert.equal(inspectShowsAuthorizedWaiting(authorized), true);
  assert.equal(inspectShowsAuthorizedWaiting(executing), false);
  assert.equal(inspectShowsAuthorizedWaiting(uncertain), false);
  assert.equal(inspectShowsExecuting(executing), true);
  assert.equal(inspectShowsExecuting(authorized), false);
  assert.equal(inspectShowsExecuting(uncertain), false);
  assert.equal(inspectShowsUncertain(uncertain), true);
  assert.equal(inspectShowsUncertain(authorized), false);
  assert.equal(inspectShowsUncertain(executing), false);
});

void test('uncertain hides ready-not-armed copy', () => {
  const view = snapshot('job-a', {
    ready: true,
    armed: false,
    state: 'uncertain',
    accept_enabled: false,
  });
  assert.equal(inspectShowsReadyNotArmed(view), false);
  assert.equal(inspectShowsUncertain(view), true);
});

void test('overlay operative status distinguishes armed waiting executing uncertain', () => {
  assert.equal(inspectOperativeStatus(snapshot('job-a')), 'armed');
  assert.equal(
    inspectOperativeStatus(
      snapshot('job-a', {
        armed: false,
        state: 'authorized',
        accept_enabled: false,
      }),
    ),
    'waiting',
  );
  assert.equal(
    inspectOperativeStatus(
      snapshot('job-a', {
        armed: true,
        state: 'executing',
        accept_enabled: false,
      }),
    ),
    'executing',
  );
  assert.equal(
    inspectOperativeStatus(
      snapshot('job-a', {
        armed: false,
        state: 'uncertain',
        accept_enabled: false,
      }),
    ),
    'uncertain',
  );
  assert.equal(
    inspectOperativeStatus(
      snapshot('job-a', {
        armed: false,
        state: 'submitted',
        accept_enabled: false,
      }),
    ),
    null,
  );
  assert.equal(inspectOperativeStatus(null), null);
});
