import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminal, statusAfter, validateOutcome } from '../lib/outcomes.ts';
import { mergeJobStatus, states, validateEdit } from '../lib/domain.ts';

const NOW = '2026-09-05T00:00:00.000Z';

/* ---------------- outcomes ---------------- */

void test('terminal states are local only and never valid for import', () => {
  // The whole existing import status matrix depends on this staying true.
  for (const terminal of ['Offer', 'Accepted', 'Closed'])
    assert.ok(
      !states.includes(terminal),
      `${terminal} must not be an importable status`,
    );
});

void test('rediscovery cannot resurrect a job that already ended', () => {
  for (const terminal of ['Offer', 'Accepted', 'Closed'])
    for (const incoming of states)
      assert.equal(
        mergeJobStatus(terminal, incoming),
        terminal,
        `${incoming} must not reopen ${terminal}`,
      );
});

void test('the existing five-status merge behaviour is unchanged', () => {
  assert.equal(mergeJobStatus(undefined, 'Ready'), 'Held');
  assert.equal(mergeJobStatus('Submitted', 'Held'), 'Submitted');
  assert.equal(mergeJobStatus('Held', 'Submitted'), 'Submitted');
  assert.equal(mergeJobStatus('Live loop', 'Submitted'), 'Live loop');
  assert.equal(mergeJobStatus('Submitted', 'Live loop'), 'Live loop');
  assert.equal(mergeJobStatus('Skip', 'Held'), 'Skip');
});

void test('a submission cannot be recorded without a receipt', () => {
  assert.throws(
    () => validateOutcome({ status: 'Ready' }, { kind: 'submitted' }),
    /needs a receipt/,
  );
  const ok = validateOutcome(
    { status: 'Ready' },
    { kind: 'submitted', receipt: 'confirmation #A-8813', occurred: NOW },
  );
  assert.equal(ok.receipt, 'confirmation #A-8813');
  assert.equal(ok.occurred, NOW);
});

void test('outcomes must follow the process they describe', () => {
  assert.throws(
    () =>
      validateOutcome(
        { status: 'Held' },
        { kind: 'submitted', receipt: 'ref-1' },
      ),
    /Accept the exact draft/,
  );
  assert.throws(
    () => validateOutcome({ status: 'Held' }, { kind: 'rejected' }),
    /Record the submission first|Record the submission before/,
  );
  assert.throws(
    () => validateOutcome({ status: 'Closed' }, { kind: 'response' }),
    /already ended/,
  );
  assert.doesNotThrow(() =>
    validateOutcome({ status: 'Submitted' }, { kind: 'response' }),
  );
  const accepted = validateOutcome({ status: 'Offer' }, { kind: 'accepted' });
  assert.equal(accepted.kind, 'accepted');
  assert.doesNotThrow(() =>
    validateOutcome({ status: 'Offer' }, { kind: 'withdrawn' }),
  );
  assert.throws(
    () => validateOutcome({ status: 'Accepted' }, { kind: 'accepted' }),
    /already ended/,
  );
});

void test('each outcome maps to the status it actually implies', () => {
  assert.equal(statusAfter('submitted'), 'Submitted');
  assert.equal(statusAfter('screen'), 'Live loop');
  assert.equal(statusAfter('offer'), 'Offer');
  assert.equal(statusAfter('accepted'), 'Accepted');
  assert.equal(statusAfter('rejected'), 'Closed');
  assert.equal(statusAfter('ghosted'), 'Closed');
  assert.ok(isTerminal('Closed') && !isTerminal('Live loop'));
});

void test('a job that has ended stays editable for notes but not for status', () => {
  assert.doesNotThrow(() =>
    validateEdit(
      { version: 1, status: 'Closed' },
      { version: 1, status: 'Closed', draft: 'Thank-you note', blocker: '' },
    ),
  );
  assert.throws(
    () =>
      validateEdit(
        { version: 1, status: 'Closed' },
        { version: 1, status: 'Held', draft: '', blocker: '' },
      ),
    /without changing the application status/,
  );
});

void test('ordinary workspace saves cannot set a terminal outcome', () => {
  for (const status of ['Offer', 'Accepted', 'Closed'])
    assert.throws(
      () =>
        validateEdit(
          { version: 1, status: 'Held' },
          { version: 1, status, draft: '', blocker: '' },
        ),
      /Record the outcome with a receipt/,
    );
});
