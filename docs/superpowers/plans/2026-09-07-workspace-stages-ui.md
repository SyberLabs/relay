# Workspace stages UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workspace home the legal next action for the current stage, so returning users continue a job loop instead of a generic dashboard.

**Architecture:** Pure helpers in `lib/workspace-stage.ts` derive stage and primary action from existing page, auth, job count, and selected status. The shell and workspace chrome consume those helpers. No new statuses, tables, or workflow router.

**Tech Stack:** TypeScript, React (Vinext), Node test runner, Playwright Chromium.

## Global Constraints

- Cite issue #109 and spec `docs/superpowers/specs/2026-09-07-interaction-stages-design.md`.
- No new job statuses, schema, gateway, or paid upstream work.
- Context is optional; empty workspace adds a job without visiting Profile.
- Exact acceptance, import-as-evidence, dirty-editor confirm, stale viewer, owner isolation unchanged.
- No manifesto slogans from `tests/ui-copy.test.mjs`.
- Public copy only if shipped capabilities change.
- Node 24, pnpm 11.19.0.

---

### Task 1: Stage and primary-action helpers

**Files:**
- Create: `lib/workspace-stage.ts`
- Test: `tests/workspace-stage.test.mjs`

**Interfaces:**
- Produces: `workspaceStage`, `primaryAction`, `stageLead`, `loopStepLead`

- [ ] Write failing unit tests for signed-out, empty, no selection, Held, Ready, Submitted, Live loop, Skip, terminal, profile/advanced → context, track → portfolio.
- [ ] Implement helpers from existing `isTerminal` and `ShellPage`.
- [ ] `pnpm test` includes the new file.

### Task 2: Shell — portfolio vs context

**Files:**
- Modify: `app/shell.tsx`, `lib/nav.ts`, `tests/nav.test.mjs`, `tests/e2e/workspace.spec.ts`, `tests/e2e/pilot.spec.ts`

- [ ] Split sidebar into Job list (hidden on empty workspace), Outcomes (`Track outcomes`), Reusable context (`Your facts`, `Advanced`).
- [ ] Hints name portfolio vs optional context.
- [ ] Update tests that lock the `Pages` group.

### Task 3: Workspace chrome

**Files:**
- Modify: `app/workspace.tsx`

- [ ] Header lead from `stageLead`. Add job is primary only when no job is selected; both header actions secondary in the job loop.
- [ ] Hide stats and example-replay during onboarding; replay only when no job is selected.
- [ ] Empty onboarding copy: add a job; facts are optional.
- [ ] Selected-job panel shows `loopStepLead`. Connections only when a job is selected.
- [ ] Fit miss still links to Profile without blocking save/accept.

### Task 4: Handoff is loop copy

**Files:**
- Modify: `app/connections.tsx`, `tests/e2e/assistant.spec.ts`

- [ ] Replace “Connect your tools” with job-loop handoff wording.
- [ ] Keep packet/load/preview behavior and non-auto-accept.

### Task 5: Stage e2e + delivery

**Files:**
- Create: `tests/e2e/workspace-stages.spec.ts`
- Modify: existing e2e as needed

- [ ] Empty: Add job without Profile; job list filters absent until a job exists.
- [ ] Held: Accept exact draft is the primary job control; Add job is not primary; Advanced is not the home heading.
- [ ] Dirty editor still confirms before facts/advanced.
- [ ] Run delivery checks; public-copy only if needed.
