# Posting vs verified facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show derived hit/miss/unknown posting requirements against verified facts on the selected job, without writing status, scores, or resume files.

**Architecture:** Pure functions in `lib/fit.ts` extract required lines and compare them to usable facts using the same number and vocabulary overlap idea as draft citations. Workspace `GET` returns those facts; the client derives gates and clears them on 401.

**Tech Stack:** TypeScript, existing D1 fact ledger, React workspace, Node test runner.

## Global Constraints

- Node >= 24, pnpm, `pnpm test` unit gate
- Fictional fixtures only; no personal resumes
- No new tables or migrations
- Gates never change job status or acceptance
- Copy must not call this an employer score
- `applyExpired` must keep a `[]` dependency array so existing source-compiled expiry tests still match

---

### Task 1: Requirement extraction and coverage

**Files:**
- Create: `lib/fit.ts`
- Test: `tests/fit.test.mjs`

**Interfaces:**
- Consumes: `contentWords`, `numbersIn`, `usableFact`, `Fact` from `lib/profile.ts`
- Produces: `extractRequirements(text: string): string[]`, `postingText(job: { name: string }, sources: { notes: string }[]): string`, `assessPosting(posting: string, facts: Fact[], now: string): { gates: Gate[]; reason: 'notes' | 'facts' | 'compared' }` where `Gate = { text: string; status: 'hit' | 'miss' | 'unknown'; factId: string | null }`

- [ ] **Step 1: Write the failing tests** in `tests/fit.test.mjs` for: requirements section bullets, must-cue lines, preferred section ignored, Kubernetes hit, years miss when the number is absent, proposed facts unused, empty notes, cap 20, postingText joins name and notes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/fit.test.mjs`
Expected: FAIL because `../lib/fit.ts` cannot be imported

- [ ] **Step 3: Write `lib/fit.ts`** to the interfaces above. Do not add a score. Deduplicate lines. Cap at 20.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/fit.test.mjs`
Expected: PASS

---

### Task 2: Owner-scoped facts on workspace GET, cleared on expiry

**Files:**
- Modify: `app/api/workspace/route.ts` GET
- Modify: `lib/workspace-refresh.ts` (`WorkspaceReply`, `RefreshOutcome`, `ExpiredPrivateWorkspace`, `processRefresh`, `expiredPrivateWorkspace`)
- Modify: `app/workspace.tsx` (facts state, applyExpired, refresh)
- Modify: `tests/workspace-refresh.test.mjs` and `tests/refresh-expiry.test.mjs` key lists to include `facts`

**Interfaces:**
- Consumes: `loadFacts`, `usableFact`
- Produces: GET `{ jobs, sources, events, facts }` where `facts` is verified and unexpired; `processRefresh` records include `facts: unknown[]` defaulting to `[]`; expired workspace includes `facts: []`

- [ ] **Step 1: Write/extend failing tests** that `expiredPrivateWorkspace()` includes `facts: []` and `processRefresh` on a body with facts returns them, and without facts returns `[]`.

- [ ] **Step 2: Run `node --disable-warning=ExperimentalWarning --test tests/workspace-refresh.test.mjs`** and confirm the new assertions fail (or current applyExpired still works).

- [ ] **Step 3: Implement GET + refresh plumbing.** Keep `applyExpired` dependency array `[]`. Call `setFacts(next.facts)` from `expiredPrivateWorkspace()`. On records, `setFacts(outcome.facts)`.

- [ ] **Step 4: Re-run workspace-refresh and refresh-expiry tests.** Expected: PASS

---

### Task 3: Selected-job evidence panel

**Files:**
- Modify: `app/workspace.tsx` selected-job detail
- Modify: `app/globals.css` only if existing `.notice` / `.source` / `.badge` are not enough

**Interfaces:**
- Consumes: `assessPosting`, `postingText`, selected job, filtered sources, facts, ISO now
- Produces: visible list with Hit / Miss / Unknown text (not color-only). Empty: import posting notes, or verify facts. Never a percentage. Miss does not disable Set aside or change status.

- [ ] **Step 1: Add the panel under the status/actions, above source history.** Heading: "Posting vs verified facts". Explain it is not an employer score.

- [ ] **Step 2: Run `pnpm test` and `pnpm exec tsc --noEmit`.** Expected: PASS

---

Self-review: spec slice 1 is extraction, coverage, derived GET facts, UI evidence, 401 clear. No resume variant, no score, no migration. Types `Gate`, `assessPosting`, `facts` on refresh are consistent across tasks.
