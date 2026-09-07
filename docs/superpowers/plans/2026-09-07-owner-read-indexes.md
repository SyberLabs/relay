# Owner read indexes and POST size caps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-scoped workspace list queries use dedicated non-unique indexes, and outcomes/preferences POST bodies over 2,000,000 characters return 413 without changing stored state.

**Architecture:** Hand-written additive `0006` migration (no drizzle-kit). Copy the drafts/profile size checks onto the two uncapped mutation routes. Do not change SQL query strings or owner predicates.

**Tech Stack:** SQLite/D1, Drizzle schema, Node test runner, existing orchestration HTTP suite.

## Global Constraints

- Issue [#149](https://github.com/SyberLabs/relay/issues/149). Spec: `docs/superpowers/specs/2026-09-07-owner-read-indexes-design.md`.
- Non-unique `index()` only. Append beside existing `uniqueIndex`. Do not declare `refusals_owner_created`.
- Do not run `drizzle-kit generate`. No snapshots. No `DROP INDEX`. No `IF NOT EXISTS`.
- Size checks copy drafts/profile exactly. Workspace keeps `Import too large`.
- Fictional fixtures. Do not claim byte/memory DoS is closed.
- One issue-linked PR. Cannot self-merge.

---

### Task 1: Failing EXPLAIN tests, then indexes

**Files:**

- Create: `drizzle/0009_owner_read_indexes.sql`
- Modify: `db/schema.ts` (append indexes on jobs, observations, events)
- Modify: `drizzle/meta/_journal.json` (idx 6)
- Test: `tests/import.test.mjs`

**Interfaces:**

- Consumes: live SQL in `app/api/workspace/route.ts`
- Produces: four named indexes listed in the spec

- [ ] **Step 1: Write the failing EXPLAIN tests** at the end of `tests/import.test.mjs` (see spec testing section). Helper: join `EXPLAIN QUERY PLAN` `detail` rows.

- [ ] **Step 2: Run** `pnpm test -- tests/import.test.mjs` (or `node --test tests/import.test.mjs`). Expected: FAIL — `SCAN events` / missing index names.

- [ ] **Step 3: Add schema extras, `0006` SQL, journal row** exactly as the spec SQL block.

- [ ] **Step 4: Re-run the same test.** Expected: PASS.

- [ ] **Step 5: Commit** indexes + unit tests + spec/plan if not already committed.

### Task 2: Failing size-cap tests, then `jsonCharsTooLarge`

**Files:**

- Modify: `lib/request-origin.ts`
- Modify: `app/api/outcomes/route.ts`
- Modify: `app/api/preferences/route.ts`
- Test: `tests/request-origin.test.mjs`

- [ ] **Step 1: Add unit tests** for `jsonCharsTooLarge` (header `2000001`; length `2000001`; `2000000` allowed) and that both mutation routes call it. Do not POST 2MB through wrangler (gateway 256KB).

- [ ] **Step 2: Run** `node --test tests/request-origin.test.mjs`. Expected: FAIL — export missing.

- [ ] **Step 3: Implement the helper and call it from both POST handlers** after origin refusal, before `JSON.parse`.

- [ ] **Step 4: Re-run.** Expected: PASS.

- [ ] **Step 5: Commit.**

### Task 3: Review, PR, CI

- [ ] Diff-review + security-review on the branch.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- [ ] Push `feat/149-owner-read-indexes`, open PR `Closes #149`, request Mateo.
- [ ] Autopilot: comments and CI. Do not merge.
