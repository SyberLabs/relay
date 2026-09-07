# Owner-scoped read indexes and mutation size caps

**Issue:** [#149](https://github.com/SyberLabs/relay/issues/149)
**Date:** 2026-09-07
**Decision owner:** Seth Carlson

Red-teamed in two independent passes plus a third pass on this text, then re-checked against current `main` (`cd69537`, migrations through `0008`). Round 1: [security](e518e7a1-ff6c-4e45-87d7-75fcf487f28c), [D1/indexes](d0a346b9-1485-4ce2-a1e5-5150370a9495). Round 2: [patched spec](3b61bffd-30af-45e6-a92f-af7b4d67b994). Round 3: [written spec](1154237a-901c-4773-b5d7-2a29908d5c6a).

## Problem

D1 is one single-threaded SQLite database. Throughput is `1 / query duration`. Workspace list queries filter `WHERE owner=?` but `events` has no owner index, and the unique indexes on `jobs` / `observations` do not match `ORDER BY updated` / `ORDER BY created`. As any applicant’s history grows, those queries scan rows they do not need.

`/api/outcomes` and `/api/preferences` parse POST bodies with no route-level size check. The production gateway already rejects non-workspace bodies over 256,000 actual bytes (`deploy/security.mjs` `bodyGuard`). Workspace, drafts, and profile still have a 2,000,000-character route check for the vinext/local path that does not run that gateway. Outcomes and preferences do not.

This is not a product-scale problem. The invited pilot does not need replicas, queues, or per-user databases. It does need the indexes the live SQL already wants, and the same advisory body cap on the two uncapped mutation routes.

## Decision

Do **A**. Never **B** or **C**.

- **A (this issue):** Four non-unique owner-leftmost indexes, plus the existing drafts/profile 2MB checks copied onto outcomes and preferences.
- **B (deleted):** Redis, queues, per-user D1, read replicas, pagination of the job list, slimming `SELECT *`, a shared request-body helper, indexes on drafts / refusals / review_batches, declaring the pre-existing `refusals_owner_created` schema drift.
- **C (deleted):** Claiming the copied cap closes `docs/threat-model.md` “bound request sizes.” It does not. `Content-Length` is attacker-controlled; `request.text()` still buffers; `raw.length` is UTF-16 units, not bytes.

Who owns “scalability”? Nobody with a load number. The physics owner is D1 query duration. Indexes and a copied cap are the work.

## Approaches considered

1. **Scale platform.** Per-user D1, replicas, queues. High cost, no users. Rejected.
2. **Shared `requestTooLarge()` helper across five POST routes.** Same behavior, more files. Rejected for this issue.
3. **Surgical indexes + copied cap (chosen).** Additive SQL. Match drafts/profile. No new tables.

## Slice (this implementation)

### Indexes

Non-unique `CREATE INDEX` only. `index()` in `db/schema.ts`, never `uniqueIndex`. Many rows share one ISO `now` (import batches, outcome + event inserts). A UNIQUE index on `(owner, created)` or `(owner, updated)` would collide and, for observations, interact with `INSERT OR IGNORE`.

| Name                         | Columns                    | Live SQL                                                                                                            |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `events_owner_created`       | `(owner, created)`         | `SELECT * FROM events WHERE owner=? ORDER BY created DESC LIMIT ?`                                                  |
| `events_owner_job_created`   | `(owner, job_id, created)` | `SELECT * FROM events WHERE owner=? AND job_id=? ORDER BY created DESC LIMIT ?` and the same with `AND created < ?` |
| `observations_owner_created` | `(owner, created)`         | `SELECT * FROM observations WHERE owner=? ORDER BY created`                                                         |
| `jobs_owner_updated`         | `(owner, updated)`         | `SELECT * FROM jobs WHERE owner=? ORDER BY updated DESC,name`                                                       |

Keep both new event indexes. One cannot serve both `ORDER BY created` shapes. Do not add `(owner, updated, name)`. ASC indexes; SQLite scans backward for `DESC`. Jobs may still `USE TEMP B-TREE FOR LAST TERM OF ORDER BY` (`name` inside identical `updated` values). That is accepted.

`events` already has non-unique `security_events_owner (owner)` from `0006_strong_stark_industries.sql`. Do not drop it. Append `events_owner_created` and `events_owner_job_created` beside it. The ordered workspace query must use `events_owner_created`, not `security_events_owner`.

Append the new `index()` entries beside existing `uniqueIndex` extras. Do not replace `jobs_owner_key` or `observations_owner_source`. Do not declare `refusals_owner_created` (0005 drift; out of scope).

Do not change the query strings. Indexes cannot return another owner’s rows unless someone removes `WHERE owner=?`.

### Migration

Hand-write `drizzle/0009_owner_read_indexes.sql` and append a `_journal.json` entry `{ "idx": 9, "version": "6", "tag": "0009_owner_read_indexes", "breakpoints": true }`. Current `main` already has `0006`–`0008` and snapshots through `0008`.

```sql
CREATE INDEX `events_owner_created` ON `events` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `events_owner_job_created` ON `events` (`owner`,`job_id`,`created`);--> statement-breakpoint
CREATE INDEX `observations_owner_created` ON `observations` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `jobs_owner_updated` ON `jobs` (`owner`,`updated`);
```

Do not run `drizzle-kit generate`. `db/schema.ts` still omits `refusals_owner_created`; generate would emit `DROP INDEX`. Do not add or rewrite snapshots. Do not `DROP INDEX`. Do not `UPDATE` rows. Do not use `CREATE INDEX IF NOT EXISTS`. First-pilot tables are tiny; `CREATE INDEX` is not a 30s risk on this data.

Shipping 0009 means artifact rollback to a pre-0009 commit is refused by the existing `drizzle/` diff gate. That is the current rollback rule, not a new one. Older Workers remain compatible with extra non-unique indexes.

### Body caps

Production already bounds actual bytes in `bodyGuard` (2,000,000 for `/api/workspace`, 256,000 elsewhere) and deletes `Content-Length` before the app. Wrangler CI therefore never delivers a 2,000,001-character body to outcomes/preferences. A 2MB orchestration POST is not a proof of the route check.

Add `jsonCharsTooLarge(contentLengthHeader, rawLength)` in `lib/request-origin.ts` (limit 2,000,000). `/api/outcomes` and `/api/preferences` call it after 401 and origin refusal, before `JSON.parse`, matching drafts/profile: header first, then `request.text()`, then length. 413 `{ error: 'Request too large.' }` with `Cache-Control: no-store`. Workspace keeps `Import too large`. Do not refactor drafts/profile in this issue.

This is vinext/local defense in depth, not the production admission cap. Do not describe outcomes/preferences DoS as closed. Residual: omitted/false `Content-Length` still buffers in `request.text()` on vinext; `raw.length` is UTF-16 units; production still uses `bodyGuard` byte limits.

Do not move 413 before auth. Unauthenticated huge POST stays 401.

### Testing

Fictional data only.

**Indexes (unit, `node:sqlite` after `applyMigrations` including 0006).** Assert substrings of `EXPLAIN QUERY PLAN`, not full plan text. Do not run EXPLAIN against remote D1 in CI.

1. `SELECT * FROM events WHERE owner=? ORDER BY created DESC LIMIT ?` contains `USING INDEX events_owner_created`, does not `SCAN events`, does not `USE TEMP B-TREE`, does not name `events_owner_job_created` or `security_events_owner`.
2. `SELECT * FROM events WHERE owner=? AND job_id=? ORDER BY created DESC LIMIT ?` contains `USING INDEX events_owner_job_created`, does not `USE TEMP B-TREE`.
3. `SELECT * FROM events WHERE owner=? AND job_id=? AND created < ? ORDER BY created DESC LIMIT ?` contains `USING INDEX events_owner_job_created` and `created<?`, does not `USE TEMP B-TREE`, does not use `events_owner_created`.
4. `SELECT * FROM observations WHERE owner=? ORDER BY created` contains `USING INDEX observations_owner_created`, does not `USE TEMP B-TREE`.
5. `SELECT * FROM jobs WHERE owner=? ORDER BY updated DESC,name` contains `USING INDEX jobs_owner_updated`. Do not forbid `USE TEMP B-TREE FOR LAST TERM OF ORDER BY`.
6. `sqlite_master`: the four names exist; `sql` matches the CREATE text above.

**Size caps (unit).** Matching `2000000` in source is not a test. Do not send a 2MB body through wrangler CI (gateway 413s at 256KB with a different error). Test `jsonCharsTooLarge`: header `2000001` is too large; empty header and length `2000001` is too large; `2000000` is allowed. Both mutation routes must call `jsonCharsTooLarge` (assert the import/call in `app/api/outcomes/route.ts` and `app/api/preferences/route.ts`). Signed-out POST remaining 401 is existing gateway/route behavior; do not add a duplicate suite for it.

## What it does not do

- Change owner predicates, event `detail` contents, or history retention
- Bound Worker memory or UTF-8 bytes
- Paginate jobs, observations, or events
- Add `refusals_owner_created` to `db/schema.ts`
- Alter rollback policy

## Contracts preserved

- Every read and write stays `owner=?` for the authenticated user.
- Imports remain evidence; they cannot approve or reset an active application.
- Accepted text stays exact and versioned. Indexes and size caps do not rewrite rows.
- Personal records stay out of Git, logs, and test fixtures.
- A stale editor still cannot overwrite newer work (version guards unchanged).
