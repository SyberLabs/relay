import type { ShellPage } from './nav.ts';
import { isTerminal } from './outcomes.ts';

export const WORKSPACE_STAGES = [
  'onboarding',
  'context',
  'job_loop',
  'portfolio',
] as const;
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number];

export const PRIMARY_ACTIONS = [
  'sign_in',
  'add_job',
  'select_job',
  'review_held',
  'use_ready',
  'save_active',
  'record_ended',
] as const;
export type PrimaryAction = (typeof PRIMARY_ACTIONS)[number];

export type StageView = {
  page: ShellPage;
  signedOut: boolean;
  jobCount: number;
  selectedStatus: string | null;
  /** Dirty editors still confirm before leave; they do not change the legal action. */
  editorDirty?: boolean;
};

export function workspaceStage(view: StageView): WorkspaceStage {
  if (
    view.page === 'profile' ||
    view.page === 'advanced' ||
    view.page === 'review' ||
    view.page === 'preferences' ||
    view.page === 'plan'
  )
    return 'context';
  if (view.page === 'track') return 'portfolio';
  if (view.signedOut || view.jobCount === 0) return 'onboarding';
  if (!view.selectedStatus) return 'portfolio';
  return 'job_loop';
}

export function primaryAction(view: StageView): PrimaryAction {
  if (view.signedOut) return 'sign_in';
  const stage = workspaceStage(view);
  if (stage === 'onboarding') return 'add_job';
  if (stage === 'portfolio' || !view.selectedStatus) return 'select_job';
  const status = view.selectedStatus;
  if (status === 'Held') return 'review_held';
  if (status === 'Ready') return 'use_ready';
  if (status === 'Submitted' || status === 'Live loop') return 'save_active';
  if (status === 'Skip' || isTerminal(status)) return 'record_ended';
  return 'review_held';
}

export function stageLead(view: StageView): string {
  if (view.signedOut) return 'Sign in to load and save your application history.';
  const stage = workspaceStage(view);
  if (stage === 'onboarding')
    return 'Add a job to start. Your facts and Advanced tools are optional.';
  if (stage === 'portfolio')
    return 'Select a job to continue its review. Adding or importing is between jobs.';
  if (stage === 'context')
    return 'Reusable context for later jobs. It is not required to draft or accept.';
  return loopStepLead(view.selectedStatus);
}

export function loopStepLead(status: string | null): string {
  if (status === 'Ready')
    return 'This wording is accepted. Record a submission with a receipt when you send it yourself.';
  if (status === 'Submitted' || status === 'Live loop')
    return 'Save notes and follow-up drafts. Saving keeps this application status.';
  if (status === 'Skip')
    return 'This job is set aside. Choose another job, or return it to the review queue.';
  if (status && isTerminal(status))
    return 'This application has ended. Import cannot reopen it.';
  return 'Review research and accept the exact wording for this job.';
}

export function headerAddJobIsPrimary(view: StageView): boolean {
  return view.page === 'workspace' && primaryAction(view) === 'select_job';
}
