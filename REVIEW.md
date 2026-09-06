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

## Round 2 (approved `8ba8400` snapshot based on `2372771`)

Surgical UI on copy/paste, Relay vs source status labels, redundant accepted actions, and dirty navigation. Independent fictional QA only; the earlier assisted real trial on port 3101 was not repeated or mutated.

Astra 6 High review then required four corrections, implemented here without publication:

1. Exact acceptance uses the current job identity/version, no conflict, matching `accepted_draft`, and an unchanged draft and blocker. Queue hint shares that condition. External Ready refresh → conflict → revert to the old base is not labeled accepted.
2. Pasted input is bounded by UTF-8 byte size (1.8 MB), with a cheap character bound first. A valid JSON envelope under the character limit and over the byte limit is rejected. The 20,000-character draft bound is unchanged.
3. Docs distinguish outbound `relay.packet.v1` copy/download from inbound `relay.draft.v1` paste/load. Prior assisted-trial Bot JSON remains a hand transcription. No fresh installed-Bot roundtrip is claimed.
4. Remaining `pnpm audit` after the approved React 19.2.8 / Vite 8.0.16 patch: **19 advisories (8 high, 8 moderate, 3 low)** in esbuild, image-size, sharp, undici, and ws. Baseline was 22 (10 high, 9 moderate, 3 low). Evidence: `work/round2-postpatch-audit.json`. No further dependency updates in this round.

- `pnpm test`: **55 passed, 0 failed**. Coverage adds the conflict-revert acceptance case and a multibyte paste envelope over 1.8 MB bytes. No source-string tests.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`: passed on Vite 8.0.16. Build kept the framework route-classification notice.
- Direct dependencies moved only to `react`/`react-dom`/`react-server-dom-webpack` 19.2.8 and `vite` 8.0.16. Lockfile also resolved Vite’s `rolldown` 1.0.1 → 1.0.3 and required `@oxc-project/types` 0.133.0. No overrides.
- Migrations 0000, 0001, and 0002 applied to this checkout’s `.wrangler/state`. Dev server: `http://localhost:3102/` (listens on `[::1]:3102`).
- Initial fictional browser pass is retained at ignored `private-data/work/round2-browser-qa-initial.json`. Tightened corrections pass (`private-data/work/round2-corrections-browser-qa.json`): copy serializer matched download (Windows clipboard CRLF vs file LF, normalized equality); induced clipboard rejection showed the fallback and left download available; valid paste staged exact text with no database write; prose/wrong-job/stale/oversized paste left editor and stored state unchanged; unchanged Ready on All opportunities disabled Save/Accept with no extra version or event; word edit dropped the accepted hint; Save revoked Ready; explicit reaccept stored the new text; external Ready v2 plus revert did not label stale text accepted; blocker-only dirty cancel/save; current-filter no-op; same-job reselect; dirty job/filter cancel/confirm; delayed file load across a job switch left the later editor unchanged; held in-flight Maple save did not overwrite the Northstar editor. Source Ready rendered beside Relay Held.
- Not done here: `tests/api.test.mjs`, live Claude, installed Bot transport, production deploy, commit, or push. Port 3101 / live-trial database were not used.

## PR24 integration with merged main `e037ebf`

Uncommitted merge on `codex/round2-draft-handoffs`: head under review is `8ba8400` plus exact `e037ebf468fd1203bd2667ada244137d91794c99`. Merge base `2372771`. Content conflicts were only `package.json` and `pnpm-lock.yaml`; both were resolved to the complete `e037ebf` files. Round2 application, helper, and test files were not rewritten.

Fresh checks on this runtime (Node 24.19.0, pnpm 11.19.0, frozen lockfile, owned `node_modules`): `git diff --check` exit 0; `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm test` via `scripts/ci/run-unit.mjs` **64 passed, 0 failed** (discovered `auth`, `connectors`, `deployment`, `domain`, `editor`, `import`, `obsidian`; `api.test.mjs` excluded by design); `pnpm build` exit 0 on Vite 8.0.16 with the framework route-classification notice; `pnpm audit --audit-level high` exit 0, remaining **2 advisories (1 moderate, 1 low)** in esbuild; `pnpm test:api` PASS; `pnpm test:production` PASS. Local `pnpm test:e2e` did not launch: Playwright 1.63 looks for `chromium_headless_shell-1243` under the Cursor sandbox browser cache; tracked e2e tests were not changed. Canonical remote CI remains required.

Fictional browser regression (not an installed-Bot trial): ignored `private-data/work/round2-main-integration-browser-qa.json` and `.png`. Copy matched download after Windows CRLF normalization (382 vs 370); induced clipboard failure kept download; paste staged exact text with no writes; invalid/wrong-job/stale/oversized inputs left the editor unchanged; exact acceptance disabled redundant Save/Accept; word and blocker edits remained reviewable; Ready external-conflict reversion was not labeled accepted; same-job/current-filter preserved the editor; dirty cancel/discard worked; delayed file read and a held in-flight save left the later editor intact.

The historical 55-test / 19-advisory / no-overrides snapshot above describes `8ba8400`, not this integrated runtime. No production, live Claude, fresh installed-Bot roundtrip, or independent adoption is claimed.

## Coverage limits

Original code review (base `6f88ea2`) did not include browser interactions or real-provider accounts; connector responses were mocked. The later local assisted trial above does not validate live Claude, production deployment, independent user adoption, unattended production, or external submissions. Lost observations need source reimport. Acceptance repair is limited to missing/mismatched accepted text. No deployment was performed. Ignored implementation and verification logs remain under `work/`.

## Native Bot copy/paste trial (2026-09-06)

On `7cfec262e02a2d255e233b0f335e056cab24a13e`, 2026-09-06 01:41:19–01:43:01 UTC, an isolated fictional Relay UI packet was copied into the installed native Grok Bot, and the observed JSON reply was pasted into Relay by hand. Paste staged the exact text without saving; an explicit save and reload preserved it. The record stayed Held, unaccepted, and unsubmitted. Automatic Bot file transfer and the Bot VM command environment remain unverified. This was a narrow local check on fictional isolated data.

## Three-record Notion and native Bot trial (2026-09-06)

A three-record trial ran on `e9e6030cae4c413ffde9ab83615bac7955de10bb`, 2026-09-06 02:29:53–02:31:21 UTC, using three distinct Held records from real historical Notion research. The rows were fetched read-only through the connected Notion tool, then previewed and imported into isolated local browser storage. Three actual context packets were copied into the installed native Grok Bot. Three actual replies were observed and transcribed by hand into files. Loading those files staged drafts without persistence. An explicit save and reload preserved the exact text. Stale original replies were rejected. A repeat import deduplicated. The workspace ended with three jobs and three sources, all Held, with no accepted draft.

The original live-trial workspace was not used or mutated. There were no Notion writes, acceptances, employer messages, submissions, or deployments. Historical source notes do not verify that those roles are still open or a current fit. Automatic Bot file transfer and the standalone Notion command connector remain unverified. This does not show the whole product, independent adoption, a provider-side browser, production use, or actual submissions.
