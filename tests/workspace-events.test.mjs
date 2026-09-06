import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_PAGE_MAX,
  HISTORY_PAGE_SIZE,
  INITIAL_EVENT_LIMIT,
  acceptedDraftFromEvents,
  historyPageSize,
  mergeReviewEvents,
} from '../lib/workspace-events.ts';

void test('history pages stay owner-bounded and default to 50', () => {
  assert.equal(INITIAL_EVENT_LIMIT, 200);
  assert.equal(historyPageSize(undefined), HISTORY_PAGE_SIZE);
  assert.equal(historyPageSize(0), HISTORY_PAGE_SIZE);
  assert.equal(historyPageSize(-1), HISTORY_PAGE_SIZE);
  assert.equal(historyPageSize(1.5), HISTORY_PAGE_SIZE);
  assert.equal(historyPageSize(1), 1);
  assert.equal(historyPageSize(50), 50);
  assert.equal(historyPageSize(500), HISTORY_PAGE_MAX);
});

void test('selected-job history can retrieve an older accepted draft after 200 newer events', () => {
  const older = {
    id: 'old',
    created: '2026-01-01T00:00:00.000Z',
    kind: 'Draft accepted',
    detail: JSON.stringify({ status: 'Ready', draft: 'Exact older wording' }),
  };
  const newer = Array.from({ length: 201 }, (_, i) => ({
    id: `new-${i}`,
    created: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    kind: 'Review saved',
    detail: JSON.stringify({ status: 'Live loop', draft: `later ${i}` }),
  }));
  const initial = newer
    .slice()
    .sort((a, b) => (a.created < b.created ? 1 : -1))
    .slice(0, INITIAL_EVENT_LIMIT);
  assert.equal(initial.length, 200);
  assert.equal(acceptedDraftFromEvents(initial), null);
  const page = mergeReviewEvents(initial, [older]);
  assert.equal(acceptedDraftFromEvents(page), 'Exact older wording');
});
