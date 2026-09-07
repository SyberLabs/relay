import test from 'node:test';
import assert from 'node:assert/strict';
import {
  headerAddJobIsPrimary,
  loopStepLead,
  primaryAction,
  stageLead,
  workspaceStage,
} from '../lib/workspace-stage.ts';

void test('unsigned or empty workspace is onboarding', () => {
  assert.equal(
    workspaceStage({
      page: 'workspace',
      signedOut: true,
      jobCount: 0,
      selectedStatus: null,
    }),
    'onboarding',
  );
  assert.equal(
    workspaceStage({
      page: 'workspace',
      signedOut: false,
      jobCount: 0,
      selectedStatus: null,
    }),
    'onboarding',
  );
  assert.equal(
    primaryAction({
      page: 'workspace',
      signedOut: true,
      jobCount: 0,
      selectedStatus: null,
    }),
    'sign_in',
  );
  assert.equal(
    primaryAction({
      page: 'workspace',
      signedOut: false,
      jobCount: 0,
      selectedStatus: null,
    }),
    'add_job',
  );
});

void test('jobs with no selection are portfolio, not the job loop', () => {
  assert.equal(
    workspaceStage({
      page: 'workspace',
      signedOut: false,
      jobCount: 2,
      selectedStatus: null,
    }),
    'portfolio',
  );
  assert.equal(
    primaryAction({
      page: 'workspace',
      signedOut: false,
      jobCount: 2,
      selectedStatus: null,
    }),
    'select_job',
  );
});

void test('selected job status picks the loop action', () => {
  const base = {
    page: 'workspace',
    signedOut: false,
    jobCount: 1,
  };
  assert.equal(workspaceStage({ ...base, selectedStatus: 'Held' }), 'job_loop');
  assert.equal(primaryAction({ ...base, selectedStatus: 'Held' }), 'review_held');
  assert.equal(primaryAction({ ...base, selectedStatus: 'Ready' }), 'use_ready');
  assert.equal(
    primaryAction({ ...base, selectedStatus: 'Submitted' }),
    'save_active',
  );
  assert.equal(
    primaryAction({ ...base, selectedStatus: 'Live loop' }),
    'save_active',
  );
  assert.equal(primaryAction({ ...base, selectedStatus: 'Skip' }), 'record_ended');
  assert.equal(
    primaryAction({ ...base, selectedStatus: 'Closed' }),
    'record_ended',
  );
  assert.equal(
    primaryAction({ ...base, selectedStatus: 'Offer' }),
    'record_ended',
  );
});

void test('profile and advanced are optional context, track is portfolio', () => {
  const signedIn = {
    signedOut: false,
    jobCount: 3,
    selectedStatus: 'Held',
  };
  assert.equal(workspaceStage({ ...signedIn, page: 'profile' }), 'context');
  assert.equal(workspaceStage({ ...signedIn, page: 'advanced' }), 'context');
  assert.equal(workspaceStage({ ...signedIn, page: 'review' }), 'context');
  assert.equal(workspaceStage({ ...signedIn, page: 'preferences' }), 'context');
  assert.equal(workspaceStage({ ...signedIn, page: 'plan' }), 'context');
  assert.equal(workspaceStage({ ...signedIn, page: 'track' }), 'portfolio');
});

void test('context is not required before adding a job', () => {
  assert.match(
    stageLead({
      page: 'workspace',
      signedOut: false,
      jobCount: 0,
      selectedStatus: null,
    }),
    /optional/i,
  );
  assert.doesNotMatch(
    stageLead({
      page: 'workspace',
      signedOut: false,
      jobCount: 0,
      selectedStatus: null,
    }),
    /confirm facts first/i,
  );
});

void test('loop copy names the legal next work without sending applications', () => {
  assert.match(loopStepLead('Held'), /accept/i);
  assert.match(loopStepLead('Ready'), /receipt/i);
  assert.match(loopStepLead('Submitted'), /status/i);
  assert.match(loopStepLead('Closed'), /cannot reopen/i);
  assert.doesNotMatch(loopStepLead('Held'), /send/i);
});

void test('dirty editor does not change stage or the legal primary action', () => {
  const held = {
    page: 'workspace',
    signedOut: false,
    jobCount: 1,
    selectedStatus: 'Held',
    editorDirty: true,
  };
  assert.equal(workspaceStage(held), 'job_loop');
  assert.equal(primaryAction(held), 'review_held');
  assert.equal(headerAddJobIsPrimary(held), false);
});

void test('header Add job is primary only between jobs', () => {
  const workspace = {
    page: 'workspace',
    signedOut: false,
    jobCount: 2,
  };
  assert.equal(
    headerAddJobIsPrimary({ ...workspace, selectedStatus: null }),
    true,
  );
  assert.equal(
    headerAddJobIsPrimary({ ...workspace, selectedStatus: 'Held' }),
    false,
  );
  assert.equal(
    headerAddJobIsPrimary({
      page: 'workspace',
      signedOut: false,
      jobCount: 0,
      selectedStatus: null,
    }),
    false,
  );
});
