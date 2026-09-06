# Merge all open Relay PRs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This train cannot be merged by an agent: GitHub requires a human maintainer other than the author to approve the **latest push**. Execute the git/CI steps, then stop for the named reviewer.

**Goal:** Squash-merge every shippable open PR onto `main` without content conflicts, CI failures, React peer-dep mismatch, public-copy marker damage, or the Windows Bash startup regression.

**Architecture:** Land the delivery foundation first so the required `CI` check exists. After that squash, replay each remaining feature as a **unique tree delta** on current `main` (do not replay interleaved CI-bootstrap commits). Resolve the two known content conflicts with the recipes below. Close the superseded Dependabot PR instead of merging it.

**Tech Stack:** GitHub squash + linear history, pnpm 11, Node >= 24, Playwright Chromium, Vinext/Cloudflare Workers, `docs/public-copy.json` as the only source for the managed README block.

## Global Constraints

- Base branch is `main`. Squash merge only. No merge commits, no force-push to `main`.
- Required check context after Task 1: `CI`. CodeQL high/critical is blocking.
- One peer code-owner approval of the latest push; Cursor comments are not approval.
- Authors: `#14/#18/#13/#11/#15` → `sdcarlson` (reviewer `sykosyber`); `#12` → `sykosyber` (reviewer `sdcarlson` after the Windows fix is on the head).
- Unique-tree replay for branches that contain `aa3f2f4`: `git diff aa3f2f4 <pr-head>` as a single commit onto current `main`. Do **not** `git rebase --onto main aa3f2f4` on `#11` or `#13` (those branches still carry pre-foundation CI-bootstrap commits).
- Keep `react` / `react-dom` / `react-server-dom-webpack` at **19.2.8** together. Never land #10.
- When `RELAY_CI_STATE` is set, Vite must not pin port 3000.
- Never hand-edit the `<!-- relay:public:start -->` block; regenerate it from `docs/public-copy.json`.
- Fictional fixtures only. No credentials, personal applications, or private research.

## File Structure

No new application modules in this plan except the conflict-resolution contents already authored on the PR branches.

Hot files (changed by more than one PR):

- `package.json` / `pnpm-lock.yaml` — #10, #11, #12, #13, #14, #15
- `vite.config.ts` — #12, #14 (and #11/#13 inherit #14)
- `README.md` — #11, #12, #13, #14, #18
- `integrations/README.md` — #11, #12, #13
- `app/workspace.tsx` — #11 (TrackerImport mount), #15 (session gate)
- `tests/api.test.mjs` — #11, #12
- `tests/e2e/workspace.spec.ts` — #11, #13, #14
- `app/about/page.tsx` — #11, #13
- `docs/public-copy.json` — #13; Task 4 must add Tracker CSV

---

### Task 1: Close the unsafe Dependabot PR and merge the delivery foundation

**Files:** none locally; GitHub `#10` and `#14` only.

**Interfaces:**

- Consumes: current `main` `2372771`
- Produces: squash commit on `main` that is **not** SHA `aa3f2f4` but has the same tree as `origin/codex/delivery-foundation`. Required check context becomes `CI`. React trio is 19.2.8.

- [ ] **Step 1: Confirm #14 is still green on `aa3f2f4`**

Run:

```sh
gh pr view 14 --repo SyberLabs/relay --json headRefOid,mergeStateStatus,statusCheckRollup \
  --jq '{head:.headRefOid,state:.mergeStateStatus,checks:[.statusCheckRollup[]|{name,status,conclusion}]}'
```

Expected: `headRefOid` is `aa3f2f429280ce72a073c926b10b9a8e7607377e`. Every App job (`Quality and release build`, `Integration (api|browser|production)`, `Dependency security`, `Bundled agent contracts`, `Security / CodeQL`, aggregate `CI`) is `SUCCESS`. If any job is not green, stop.

- [ ] **Step 2: Close #10 as superseded**

Comment, then close (do not merge):

```text
Superseded by #14, which already ships react 19.2.8, react-dom 19.2.8, and react-server-dom-webpack 19.2.8 together. This Dependabot PR only bumps RSC to 19.2.8 while leaving react at 19.2.6, which violates the 19.2.8 peer range and conflicts with the delivery lockfile. Remaining lower-severity development-tool advisories stay on #16.
```

- [ ] **Step 3: Human approval and squash-merge #14**

Reviewer `sykosyber` approves the latest `aa3f2f4` push. Squash-merge with commit message:

```text
Establish protected CI/CD and authenticated production releases (#14)

Closes #2.
```

- [ ] **Step 4: Verify main advanced and CI ran on the squash**

```sh
git fetch origin main
git log -1 --oneline origin/main
gh run list --repo SyberLabs/relay --branch main --limit 3
```

Expected: `origin/main` is **not** `2372771`. The `CI` workflow on that push is green (or still running; wait). `#2` is closed.

- [ ] **Step 5: Record the squash SHA for later replays**

```sh
FOUNDATION=$(git rev-parse origin/main)
echo "$FOUNDATION"
```

Use this SHA as `origin/main` for every later rebase. Do not use `aa3f2f4` as the new base.

---

### Task 2: Rebase and squash-merge the docs-only context playbooks (#18)

**Files:**

- Keep from #18: `context-management/**` (14 files) and the two-line GrokCell README pointer
- Do not rewrite #14 hosting/delivery README paragraphs

**Interfaces:**

- Consumes: Task 1 `origin/main`
- Produces: `context-management/` on main; README GrokCell section links to it

- [ ] **Step 1: Rebase #18 onto the new main**

```sh
git fetch origin main docs/context-management
git checkout -B docs/context-management origin/docs/context-management
git rebase origin/main
git push --force-with-lease origin docs/context-management
```

Expected: rebase is clean, or at most a two-line README auto-merge in the `## GrokCell bot templates` section. If GitHub reports a conflict, keep **both** the #14 contributing/delivery links and this paragraph immediately under `## GrokCell bot templates`:

```markdown
For model-specific research practices, reusable handoffs, and a proposed evaluation plan, see [Context management for Relay](context-management/README.md). The guide distinguishes documented provider capabilities from Relay's implemented integrations.
```

- [ ] **Step 2: Wait for the new required `CI` check**

Expected: Quality, integration, dependency, bundled agent contracts, and CodeQL pass. This is the first docs-only PR through the foundation gate.

- [ ] **Step 3: `sykosyber` approves the rebased head and squash-merges #18**

---

### Task 3: Replay ChatGPT/Codex handoffs (#13) as one commit on current main

**Files:** unique tree vs `aa3f2f4` (do not replay `976f983` / `cdd00ca` / bootstrap CI):

- Create: `docs/OPENAI-RELEASE.md`, `docs/PUBLIC-COPY.md`, `docs/public-copy.json`, `integrations/OPENAI.md`, `integrations/codex.mjs`, `lib/assistant-handoff.ts`, `scripts/sync-public-copy.mjs`, `tests/assistant.test.mjs`, `tests/e2e/assistant.spec.ts`, `tests/public-copy.test.mjs`
- Modify: `.github/pull_request_template.md`, `.github/workflows/ci.yml` (add `pnpm public-copy:check`), `README.md`, `app/about/page.tsx`, `app/connections.tsx`, `integrations/OBSIDIAN.md`, `integrations/README.md`, `integrations/relay.mjs`, `lib/integration-files.ts`, `package.json` (`public-copy:*` scripts), `tests/e2e/workspace.spec.ts`

**Interfaces:**

- Consumes: Task 2 `origin/main` (foundation + context-management)
- Produces: public-copy markers in README; `pnpm public-copy:check` is part of Quality

- [ ] **Step 1: Confirm #13 CI is green before replaying**

```sh
gh pr checks 13 --repo SyberLabs/relay
```

Expected: `CI` success on `feat/openai-handoffs-public-copy`. If `Integration (production)` or aggregate `CI` failed on the latest head, fix #13 **on its current branch** before this replay.

- [ ] **Step 2: Build a single unique-delta commit on current main**

```sh
git fetch origin main feat/openai-handoffs-public-copy
git checkout -B feat/openai-handoffs-public-copy origin/main
git diff aa3f2f429280ce72a073c926b10b9a8e7607377e origin/feat/openai-handoffs-public-copy | git apply --3way
git add -A
git diff --cached --stat
git commit -m "$(cat <<'EOF'
Add ChatGPT and Codex draft handoffs and shared public-copy maintenance

Keep #21 open until post-merge public-copy sync and Pages verification.
EOF
)"
git push --force-with-lease origin feat/openai-handoffs-public-copy
```

Expected `git apply` is clean. Cached stat is the 21-file unique delta, **not** a re-add of `.github/workflows/ci.yml` from scratch. If `README.md` overlaps the Task 2 GrokCell pointer, keep the context-management sentence under `## GrokCell bot templates` **outside** `<!-- relay:public:end -->`.

- [ ] **Step 3: Run the foundation gates locally on the replayed tree**

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm public-copy:check
pnpm build
pnpm exec playwright install chromium
pnpm test:api
pnpm test:e2e
pnpm test:production
```

Expected: all pass. `pnpm test` discovers `tests/assistant.test.mjs` and `tests/public-copy.test.mjs` automatically via `scripts/ci/run-unit.mjs`.

- [ ] **Step 4: `sykosyber` approves the **new** head (last-push rule) and squash-merges #13**

Do **not** close #21. After merge, Seth runs the downstream public-copy workflows documented in `docs/PUBLIC-COPY.md`.

---

### Task 4: Replay CSV import (#11) and resolve the two documentation conflicts

**Files:**

- Create: `app/tracker-import.tsx`, `lib/tracker-csv.ts`, `tests/tracker-csv.test.mjs`, `tests/fixtures/tracker-example.csv`
- Modify: `app/globals.css`, `app/workspace.tsx` (TrackerImport mount), `app/about/page.tsx`, `package.json` (`csv-parse@7.0.2`), `pnpm-lock.yaml`, `pnpm-workspace.yaml` (`nodeLinker: hoisted`), `tests/api.test.mjs`, import/editor/domain/obsidian/connector tests, `tests/e2e/workspace.spec.ts`
- Conflict: `README.md`, `integrations/README.md`

**Interfaces:**

- Consumes: Task 3 main (public-copy markers exist)
- Produces: CSV importer; public-copy.json lists Tracker CSV; `pnpm public-copy:check` still passes

- [ ] **Step 1: Mark #11 ready for review after the delta exists**

#11 is draft until #14 is on main. After Task 1 it can be marked ready; do that after this replay so reviewers see the conflict-free head.

- [ ] **Step 2: Apply the unique CSV tree onto current main**

```sh
git fetch origin main relay-csv-mvp
git checkout -B relay-csv-mvp origin/main
git diff aa3f2f429280ce72a073c926b10b9a8e7607377e origin/relay-csv-mvp | git apply --3way
```

Expected conflicts: `README.md` and `integrations/README.md` only. `package.json` should already combine `csv-parse` with `public-copy:*` if apply merged scripts; if `package.json` conflicts, keep **all** Task 3 scripts plus:

```json
"csv-parse": "7.0.2"
```

in `dependencies`, and in `pnpm-workspace.yaml` keep both:

```yaml
nodeLinker: hoisted
allowBuilds:
  esbuild: true
  workerd: true
```

Then regenerate the lockfile with `pnpm install` (never hand-merge `pnpm-lock.yaml`).

- [ ] **Step 3: Resolve `integrations/README.md` by keeping both sections**

Replace the conflict with ChatGPT/Codex first, Tracker CSV second:

```markdown
## ChatGPT and Codex to Relay

Use **Prepare for ChatGPT** or **Prepare for Codex** in the connection panel, then return the assistant's JSON response for review. Codex also supports `codex-run` through your signed-in CLI. [Read the complete ChatGPT and Codex guide](OPENAI.md) for commands, setup and data boundaries. These are explicit handoffs, not an installed hosted ChatGPT app.

## Tracker CSV → Relay

Use **Import a tracker CSV** in the workspace for a user-managed Simplify export or another comma-separated tracker file. This path needs no account connection or credentials.

1. Export only the opportunities you want to review, or prepare a copy containing those rows. Keep the original export.
2. Choose the file and name the source tracker. Confirm the company, role and employer posting URL columns. Relay suggests recognizable headers but requires you to review them. Map source status and research notes if wanted; all omitted columns are listed.
3. Choose **Preview tracker records**. The file is read locally; only the mapped fields are sent to your Relay workspace for the match preview. Review each title, URL, source status and note. Preview does not save records.
4. Choose **Import … research records** to save the previewed data. Matching URLs add source history to existing jobs. New jobs start Held; existing status, draft and acceptance remain in Relay. The server rechecks matches at import time.

Source status is recorded in the observation's notes. An Applied, Interview, Offer, Rejected, Withdrawn or Ready value never changes Relay status. This is research import, not full pipeline migration or two-way synchronization. Changing a source status creates a new observation; repeating unchanged research does not duplicate it. Keep the source tracker name consistent across exports for stable observation identity. Renaming the source creates a separate source identity. Different roles sharing a company/title are not merged on those names; use the original employer posting URL to match across tools. URLs on different job boards may remain separate.

Files must be UTF-8, comma-separated, smaller than 2 MB, with one unique header row and 1–200 opportunity rows. Quoted commas, escaped quotes and multiline notes are supported. The limit is 50 columns, 500 characters for the combined company/role title and 20,000 for the resulting research including its source label/status. Blank lines are ignored. Missing posting URLs, duplicate headers, malformed rows and oversized values reject the batch with an error; no partial import occurs. Add missing employer URLs to your copy before trying again.

Try [the fictional CSV](../tests/fixtures/tracker-example.csv). These sample headers are a Relay test fixture, not a captured Simplify export. The [Simplify tracker guide](https://help.simplify.jobs/en/articles/2140179-using-the-job-tracker) documents CSV export; compatibility with an actual account export remains unverified. This release claims no Simplify partnership, API access, account sync or application sending.
```

Keep the existing Notion section's **Connect your tools** wording from #13.

- [ ] **Step 4: Resolve README without breaking public-copy**

Do **not** take #11's replacement of the tagline inside the managed block. Add CSV to canonical copy, regenerate the block, then place #11's longer product explanation **after** `<!-- relay:public:end -->`.

In `docs/public-copy.json`:

1. Append to `capabilities`:

```json
"Import a tracker CSV through explicit column mapping and a record preview. Source statuses remain research; existing Relay status and accepted drafts are preserved."
```

2. Append to `integrations`:

```json
{
  "name": "Tracker CSV",
  "description": "Explicit column mapping and preview of a local comma-separated tracker file as research.",
  "guide": "integrations/README.md"
}
```

3. Run:

```sh
pnpm public-copy:sync
pnpm public-copy:check
```

Expected: the generated Integrations list includes Tracker CSV; `pnpm public-copy:check` exits 0.

4. Immediately after `<!-- relay:public:end -->` (after the development/delivery links is also fine), keep #11's `## Why Relay` section and `## Where Relay fits with existing tools` section verbatim from `origin/relay-csv-mvp` (they must stay **outside** the markers). Keep the Task 2 context-management sentence under GrokCell.

- [ ] **Step 5: Confirm `app/workspace.tsx` still mounts TrackerImport**

The unique CSV hunk is:

```tsx
import { TrackerImport } from './tracker-import';
```

and

```tsx
{!signedOut && loaded && <TrackerImport onImported={refresh} />}
```

If `git apply` dropped them, restore both. `app/about/page.tsx` must mention both ChatGPT/Codex **and** tracker CSV (the two about-page hunks auto-merged in simulation).

- [ ] **Step 6: Commit, push, run gates, approve, squash-merge**

```sh
git add -A
git commit -m "$(cat <<'EOF'
Add reviewed tracker CSV imports to the MVP

Closes #17.
EOF
)"
git push --force-with-lease origin relay-csv-mvp
```

Run the same local gate list as Task 3 Step 3, plus confirm `tests/tracker-csv.test.mjs` is in `pnpm test` output. Convert the PR from draft to ready. `sykosyber` approves the new head. Squash-merge. Expected: #17 closes.

---

### Task 5: Rebase local-dev (#12), apply the Windows Node guard, merge Vite with CI ports

**Files:**

- Create: `.nvmrc`, `.node-version`, `scripts/ensure-node.mjs`
- Delete: `scripts/ensure-node.sh` (never land the Bash guard)
- Modify: `package.json` scripts only (do not revert dependencies), `vite.config.ts`, `README.md` local-run section, `integrations/GROK_BOT.md`, `integrations/README.md`, `tests/api.test.mjs`

**Interfaces:**

- Consumes: Task 4 main
- Produces: `pnpm dev` on `http://localhost:3000/` locally; CI still uses ephemeral `--port`; Node check is `node scripts/ensure-node.mjs`

- [ ] **Step 1: Rebase #12 onto current main**

```sh
git fetch origin main cursor/fix-local-dev-handoff-1d43 codex/qa-19-windows-node-guard
git checkout -B cursor/fix-local-dev-handoff-1d43 origin/cursor/fix-local-dev-handoff-1d43
git rebase origin/main
```

Expected conflicts: `package.json`, `vite.config.ts`. `tests/api.test.mjs` may auto-merge with CSV API tests; if not, keep **both** the header-or-cookie local auth acceptance from #12 and the CSV cases from #11.

- [ ] **Step 2: Resolve `package.json` by adding scripts, never downgrading deps**

Keep Task 4 dependencies (`jose`, `csv-parse`, `react@19.2.8`, `vinext@1.0.0-beta.9`, `@playwright/test`, `@vitejs/plugin-rsc@0.5.34`, `vite@8.0.16`). Scripts must be:

```json
{
  "ensure-node": "node scripts/ensure-node.mjs",
  "predev": "node scripts/ensure-node.mjs",
  "dev": "vinext dev --port 3000",
  "build": "vinext build",
  "prestart": "node scripts/ensure-node.mjs",
  "start": "wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 8787 --persist-to .wrangler/state",
  "lint": "oxlint app lib db tests scripts deploy",
  "format": "oxfmt",
  "db:generate": "drizzle-kit generate",
  "test": "node scripts/ci/run-unit.mjs",
  "typecheck": "tsc --noEmit",
  "test:api": "node scripts/ci/run-integration.mjs api",
  "test:e2e": "node scripts/ci/run-integration.mjs browser",
  "test:production": "node scripts/ci/run-production.mjs",
  "relay": "node integrations/relay.mjs",
  "public-copy:sync": "node scripts/sync-public-copy.mjs --target project --root .",
  "public-copy:check": "node scripts/sync-public-copy.mjs --target project --root . --check"
}
```

Do **not** restore `bash scripts/ensure-node.sh`. Do **not** restore the old explicit `node --test tests/domain.test.mjs ...` test script.

- [ ] **Step 3: Replace the Bash guard with the prepared Node script**

```sh
git checkout origin/codex/qa-19-windows-node-guard -- scripts/ensure-node.mjs
git rm -f scripts/ensure-node.sh 2>/dev/null || true
```

`scripts/ensure-node.mjs` must be:

```javascript
const requiredMajor = 24;
const major = Number(process.versions.node.split('.')[0]);

if (major < requiredMajor) {
  console.error(`Relay needs Node >= ${requiredMajor}; this command is using ${process.version}.`);
  console.error('Install Node 24 or newer and put it first on PATH, then run pnpm install --frozen-lockfile and pnpm dev.');
  process.exitCode = 1;
} else {
  console.log(`Node ${process.version}`);
}
```

README local-run snippet must say `node scripts/ensure-node.mjs`, not `bash scripts/ensure-node.sh`.

- [ ] **Step 4: Resolve `vite.config.ts` so CI ephemeral ports still work**

`scripts/ci/run-integration.mjs` starts Vinext with `--hostname 127.0.0.1 --port <ephemeral>` and sets `RELAY_CI_STATE`. Local `pnpm dev` must pin 3000. Merged `server` / `preview` / `persistState` / plugin block:

```typescript
const parsedDevPort = Number.parseInt(process.env.PORT || '3000', 10);
const DEV_PORT =
  Number.isInteger(parsedDevPort) && parsedDevPort > 0 && parsedDevPort < 65536
    ? parsedDevPort
    : 3000;

// inside defineConfig return:
server: process.env.RELAY_CI_STATE
  ? { strictPort: true }
  : {
      host: 'localhost',
      port: DEV_PORT,
      strictPort: true,
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
preview: process.env.RELAY_CI_STATE
  ? undefined
  : {
      host: 'localhost',
      port: DEV_PORT,
      strictPort: true,
    },
plugins: [
  vinext(),
  sites(),
  cloudflare({
    persistState: process.env.RELAY_CI_STATE
      ? { path: process.env.RELAY_CI_STATE }
      : { path: '.wrangler/state' },
    viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    config: localBindingConfig,
  }),
  ...(process.env.RELAY_CI_STATE
    ? []
    : [
        {
          name: 'relay-dev-url',
          configureServer(server: ViteDevServer) {
            const httpServer = server.httpServer;
            httpServer?.once('listening', () => {
              const address = httpServer.address();
              const port =
                typeof address === 'object' && address
                  ? address.port
                  : DEV_PORT;
              server.config.logger.info(
                `Relay: http://localhost:${port}/  (Vite URL. Ignore any workerd 127.0.0.1:NNNN bind.)`,
              );
            });
          },
        },
      ]),
],
```

Keep the existing `import { defineConfig, type ViteDevServer } from 'vite'` typing from #12. Do **not** use #12's unconditional `persistState: { path: '.wrangler/state' }` (that would ignore `RELAY_CI_STATE` and break isolated CI databases).

- [ ] **Step 5: Author `sykosyber` pushes the resolved head; `sdcarlson` approves that push**

Seth already asked not to push `cb4d7df` himself so last-push approval stays valid. After CI is green:

```sh
git commit  # if rebase stopped for conflicts
git push --force-with-lease origin cursor/fix-local-dev-handoff-1d43
```

Local verification:

```sh
node scripts/ensure-node.mjs
# expected: Node v24.x.x
pnpm lint && pnpm typecheck && pnpm test && pnpm public-copy:check && pnpm build
pnpm test:api && pnpm test:e2e && pnpm test:production
```

Squash-merge. Closes #19. If GitHub does not auto-close #19, comment `Fixed by #<merged-pr>` and close it.

---

### Task 6: Rebase session-expiry (#15) and drop the obsolete test-script edit

**Files:**

- Create: `lib/workspace-refresh.ts`, `tests/workspace-refresh.test.mjs`
- Modify: `app/workspace.tsx` (generation tickets, 401 clears private state)
- Do **not** modify `package.json` `test` script

**Interfaces:**

- Consumes: Task 5 `refresh` callback and TrackerImport `onImported={refresh}`
- Produces: stale GET/POST ignored; 401 expires epoch so in-flight 200s cannot restore jobs

- [ ] **Step 1: Rebase onto current main**

```sh
git fetch origin main cursor/stale-refresh-session-expiry-4577
git checkout -B cursor/stale-refresh-session-expiry-4577 origin/cursor/stale-refresh-session-expiry-4577
git rebase origin/main
```

Expected: `package.json` conflicts. `app/workspace.tsx` should auto-merge TrackerImport with the session gate (different hunks in simulation). If it does not, keep **all** of:

```tsx
import { TrackerImport } from './tracker-import';
```

```tsx
{!signedOut && loaded && <TrackerImport onImported={refresh} />}
```

```tsx
{showImport && !signedOut && (
```

```tsx
{report && !signedOut && (
```

```tsx
{jobs.length > 0 && !signedOut && (
```

and the `sessionRef` / `applyExpired` / `processRefresh` / `processMutation` wiring from #15.

- [ ] **Step 2: Resolve `package.json` by taking `ours` (current main)**

```sh
git checkout --ours package.json
git add package.json
```

`scripts/ci/run-unit.mjs` already loads every `tests/*.test.mjs` except `api.test.mjs`, so `tests/workspace-refresh.test.mjs` is included without listing it in `package.json`. Confirm `test` remains `node scripts/ci/run-unit.mjs`.

- [ ] **Step 3: Run gates including the new unit file**

```sh
pnpm test
# expected: tests/workspace-refresh.test.mjs in the node:test listing; all pass
pnpm lint && pnpm typecheck && pnpm public-copy:check && pnpm build
pnpm test:api && pnpm test:e2e && pnpm test:production
```

Browser journeys must still: preview before import, CSV mapping (from #11), ChatGPT/Codex fixture return without acceptance (from #13), and signed-out UI must not show import/report/job queue.

- [ ] **Step 4: `sykosyber` approves the rebased head; squash-merge #15**

Closes #7.

---

### Task 7: Final main verification and leftover issues

**Files:** none; `origin/main` after Task 6.

**Interfaces:**

- Consumes: merged train
- Produces: evidence that main is green; a leftover-issue list (not mergeable in this train)

- [ ] **Step 1: Fast-forward a clean checkout to `origin/main` and run the full gate**

```sh
git fetch origin main
git checkout -B verify-main origin/main
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm public-copy:check
pnpm build
pnpm test:api
pnpm test:e2e
pnpm test:production
pnpm audit --audit-level high
```

Expected: all pass. Audit may still report GHSA-67mh-4wv8-2f99 and GHSA-g7r4-m6w7-qqqr (#16); that is allowed.

- [ ] **Step 2: Confirm closed vs still-open issues**

Closed by this train: #2, #7, #17, #19 (and #10 as superseded, not merged).

Keep open:

- #21 until organization/profile/website public-copy workflows and Pages rebuild succeed
- #16 esbuild advisories (new PR after compatible upstream)
- #9 null-URL assistant packets (new PR after #13 behavior is on main)
- #8 selected-job event pagination (new PR; independent)
- #20 Grok Bot command-review (not Relay application code)
- #3, #4, #6 hosting/isolation/recovery (credentials)
- #5 product experiment (research)

- [ ] **Step 3: Do not start #9/#8/#16 until this train is on main**

Those tickets share `app/connections.tsx`, `app/api/workspace/route.ts`, and lockfiles with this train. Implementing them in parallel re-creates the conflict pattern this plan exists to avoid.

---

## Self-review

1. **Spec coverage:** All 7 open PRs have a task or an explicit close. All 13 open issues are mapped. Simulated conflicts (`README.md`, `integrations/README.md`, `package.json`, `vite.config.ts`) have recipes. Squash SHA mismatch is handled by unique-tree replay.
2. **Placeholder scan:** Conflict resolutions include the actual scripts, public-copy JSON entries, Vite `RELAY_CI_STATE` branch, and `ensure-node.mjs` source.
3. **Type consistency:** `refresh` remains the workspace callback; TrackerImport keeps `onImported={refresh}`; session expiry still unmounts import UI via `signedOut`.

## Execution handoff

This plan is saved at `docs/superpowers/plans/2026-09-06-merge-all-open-prs.md`. Maintainers should execute it **inline** on each PR branch (not a new integration branch) so last-push approval stays on the real pull request.

Agents may perform the rebases, conflict resolutions, and local gates. They cannot approve or squash-merge.
