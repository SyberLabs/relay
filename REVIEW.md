# Relay completed review

Reviewed base: `6f88ea2` on 2026-09-05. Scoped implementation and independent verification are complete.

Published to GitHub main:
- Backend: `cc83bf55be720421602d70f40ca1256149d1b235`.
- Editor/API: `94b2afb2c5b1264552f4cfff61c4ef9de5713420`.

## Required behavior and completed fixes

Relay must preserve job history, attach edits to the version actually reviewed, and record acceptance only for the exact draft explicitly accepted in this workspace. Imported research supplies evidence; existing interviews and valid local decisions survive rediscovery.

1. **Interview precedence and preview.** One merge policy gives Live loop priority over Submitted, gives both priority over preparatory states, and otherwise preserves the existing local decision. Import and preview use consistent state progression across repeated rows. All 25 existing/incoming status pairs are verified against real route SQL and preview classification.
2. **Explicit local acceptance.** A new imported Ready record becomes Held while its source observation retains Ready. New acceptance requires the explicit local operation for the exact draft. Valid local acceptance survives duplicate imports; editing the accepted draft revokes acceptance. Migration repair demotes missing/mismatched acceptance and advances the version while preserving valid API-created acceptance, including whitespace-only blockers.
3. **Editor session and version.** Draft and blocker belong to an editor session and its loaded base version. Refresh preserves unsaved work; stale saves return HTTP 409 without changing stored state or history. Save acknowledgements preserve edits made in flight and cannot bless stale text after switching away and back. Packets carry the editor's actual base version. Asynchronous file results apply atomically only when their target session and editor snapshot still match.
4. **Observation identity.** Observation uniqueness includes job_key, so distinct jobs with identical source fields retain separate histories. Migration 0002 preserves existing rows; exact repeats deduplicate, changed notes remain distinct, and owners remain isolated. Previously discarded observations require source reimport.

Secondary fixes validate optional createdTime values before database work and reject non-local API test targets before the first fetch. No new abstraction or dependency was needed.

## Final verification

- `pnpm test`: **35 passed, 0 failed**, covering the 25-pair status matrix, migration preservation, import acceptance, observation identity, editor transitions, and mocked connectors.
- Standalone TypeScript (`node node_modules/typescript/bin/tsc --noEmit`), `pnpm lint`, and `pnpm build`: passed. Build retained the framework's existing route-classification notice.
- Migration 0002: all three statements applied successfully to a fictional local database. Fresh in-memory migration tests also verified row preservation.
- Existing local API checks (`node tests/api.test.mjs`): passed, including stale-save HTTP 409 and unchanged stored text, acceptance, status, version, and review events.
- Extended live local API checks: passed for both interview import orders, imported Ready normalization and retained source status, distinct-job histories, exact-repeat deduplication, acceptance surviving reimport, acceptance revoked by editing, stale-save history preservation, within-batch preview progression, and malformed timestamps rejected without writes.
- The actual Workspace `onDraft` callback was executed with a deferred updater: it reports no synchronous success flag, applies a matching target, and preserves a changed selection. Unit tests additionally cover same-job reselection, newer bases, edits during saves/file reads, and atomic file application. This was callback verification, not browser interaction testing.
- The local development server was stopped and confirmed unavailable after verification. No dependencies were added or upgraded; package.json only extends the test command.

## Independent review and execution

Independent review caught and resolved stale acknowledgements after A-to-B-to-A selection, file guards outside the latest editor update, false synchronous failure from queued updates, overly broad SQLite trimming of valid acceptance, and stale validation returning 400 instead of 409. Each correction was rechecked before publication.

Code implementation used the verified Cursor Grok 4.6 Extra High conversation throughout. Planning and independent review used Astra 6 High. First-principles and Karpathy guidance applied, along with the user's automatic fresh-context handoff at the 50% threshold. The user authorized incremental main-branch publishing and current README documentation; both implementation commits above were remotely verified.

## Local assisted browser trial

On `3b1efd7`, a local assisted trial accepted an exact saved draft in the browser, reloaded, and reimported the original two research observations. The accepted draft, Ready status, two observations (deduplicated), and review history were retained. No external applications, messages, or Notion writes. Source rows came through the connected Notion tool, not the standalone Notion CLI. Installed Grok Bot JSON was transcribed by hand into a validated file; automatic Bot file transfer was not tested. After this checkout fast-forwarded to `59ec7ac`, a read-only browser reopen still showed the accepted record.

## Coverage limits

Original code review (base `6f88ea2`) did not include browser interactions or real-provider accounts; connector responses were mocked. The later local assisted trial above does not validate live Claude, production deployment, independent user adoption, unattended production, or external submissions. Lost observations need source reimport. Acceptance repair is limited to missing/mismatched accepted text. No deployment was performed. Ignored implementation and verification logs remain under `work/`.
