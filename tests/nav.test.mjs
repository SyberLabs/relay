import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_LINKS,
  PORTFOLIO_PAGE_LINKS,
  CONTEXT_PAGE_LINKS,
  isAdvancedSection,
  jobFromSearch,
  pageIsCurrent,
  plantSearchAction,
  queueFromSearch,
  queueHref,
  queueTitle,
  workspaceHref,
} from '../lib/nav.ts';

void test('queueFromSearch reads a known filter and keeps caller fallbacks', () => {
  assert.equal(queueFromSearch('?queue=All'), 'All');
  assert.equal(queueFromSearch('queue=Ready'), 'Ready');
  assert.equal(queueFromSearch('?queue=Live%20loop'), 'Live loop');
  assert.equal(queueFromSearch(''), 'Held');
  assert.equal(queueFromSearch('?queue=Unknown'), 'Held');
  assert.equal(queueFromSearch('?other=All'), 'Held');
  assert.equal(queueFromSearch('', 'All'), 'All');
  assert.equal(queueFromSearch('?queue=Unknown', 'All'), 'All');
});

void test('queue labels and hrefs open Track instead of the plant', () => {
  assert.equal(queueTitle('Held'), 'Review queue');
  assert.equal(queueTitle('All'), 'All opportunities');
  assert.equal(queueHref('All'), '/track');
  assert.equal(queueHref('Held'), '/track?queue=Held');
  assert.equal(queueHref('Ready'), '/track?queue=Ready');
});

void test('job query params stay bound and plant queue queries leave the plant', () => {
  assert.equal(jobFromSearch('?job=abc'), 'abc');
  assert.equal(jobFromSearch('job=' + 'x'.repeat(201)), null);
  assert.equal(jobFromSearch('?job=%20'), null);
  assert.equal(jobFromSearch(''), null);
  assert.equal(workspaceHref('job-1'), '/?job=job-1');
  assert.deepEqual(plantSearchAction('?queue=All'), {
    redirectTo: '/track',
    stripTo: null,
    jobId: null,
  });
  assert.deepEqual(plantSearchAction('?queue=Ready'), {
    redirectTo: '/track?queue=Ready',
    stripTo: null,
    jobId: null,
  });
  assert.deepEqual(plantSearchAction('?queue=Held'), {
    redirectTo: null,
    stripTo: '/',
    jobId: null,
  });
  assert.deepEqual(plantSearchAction('?queue=Held&job=abc'), {
    redirectTo: null,
    stripTo: '/?job=abc',
    jobId: 'abc',
  });
  assert.deepEqual(plantSearchAction('?job=abc'), {
    redirectTo: null,
    stripTo: null,
    jobId: 'abc',
  });
  assert.deepEqual(plantSearchAction('?queue=Unknown&job=abc'), {
    redirectTo: null,
    stripTo: null,
    jobId: 'abc',
  });
});

void test('page links expose applications, facts, jobs and advanced', () => {
  assert.deepEqual(
    PAGE_LINKS.map((item) => item.href),
    ['/applications', '/profile', '/track', '/advanced'],
  );
  assert.deepEqual(
    PAGE_LINKS.map((item) => item.label),
    ['Applications', 'Your facts', 'Track jobs', 'Advanced'],
  );
  assert.deepEqual(
    PORTFOLIO_PAGE_LINKS.map((item) => item.page),
    ['applications', 'track'],
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
