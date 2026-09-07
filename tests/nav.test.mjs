import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_LINKS,
  PORTFOLIO_PAGE_LINKS,
  CONTEXT_PAGE_LINKS,
  isAdvancedSection,
  pageIsCurrent,
  queueFromSearch,
  queueHref,
  queueTitle,
} from '../lib/nav.ts';

void test('queueFromSearch reads a known filter and defaults to the review queue', () => {
  assert.equal(queueFromSearch('?queue=All'), 'All');
  assert.equal(queueFromSearch('queue=Ready'), 'Ready');
  assert.equal(queueFromSearch('?queue=Live%20loop'), 'Live loop');
  assert.equal(queueFromSearch(''), 'Held');
  assert.equal(queueFromSearch('?queue=Unknown'), 'Held');
  assert.equal(queueFromSearch('?other=All'), 'Held');
});

void test('queue labels and workspace hrefs stay next to the list they change', () => {
  assert.equal(queueTitle('Held'), 'Review queue');
  assert.equal(queueTitle('All'), 'All opportunities');
  assert.equal(queueHref('Held'), '/');
  assert.equal(queueHref('All'), '/?queue=All');
});

void test('page links expose applications, facts, outcomes and advanced', () => {
  assert.deepEqual(
    PAGE_LINKS.map((item) => item.href),
    ['/applications', '/profile', '/track', '/advanced'],
  );
  assert.deepEqual(
    PORTFOLIO_PAGE_LINKS.map((item) => item.page),
    ['track'],
  );
  assert.deepEqual(
    CONTEXT_PAGE_LINKS.map((item) => item.page),
    ['profile', 'advanced'],
  );
  assert.equal(pageIsCurrent('profile', 'profile'), true);
  assert.equal(pageIsCurrent('workspace', 'profile'), false);
  assert.equal(isAdvancedSection('plan'), true);
  assert.equal(pageIsCurrent('review', 'advanced'), true);
  assert.equal(pageIsCurrent('track', 'advanced'), false);
});
