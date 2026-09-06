# Merge all open Relay PRs without conflicts or regressions

**Date:** 2026-09-06
**Base:** `origin/main` `2372771` (Record completed assisted Notion and Grok Bot trial)
**Inventory:** 7 open PRs, 13 open issues, 1 already-merged PR (#1 GrokCell templates)

## Goal

Land every open pull request on `main` in an order that GitHub will squash-merge cleanly, that preserves Relay's review/acceptance contracts, and that does not introduce known defects (Windows Bash guard, mismatched React versions, CI port pinning, public-copy marker damage).

Merging every PR does **not** close every issue. Hosting, product experiments, and follow-up bugs have no open implementation PRs.

## Constraints (from the delivery foundation)

These are already specified in PR #14 and will become binding the moment that PR squash-merges:

- Linear history; **squash merge only**
- One peer approval, code-owner review, **approval of the latest push**, resolved conversations
- Required status check context is exactly `CI` (GitHub Actions)
- CodeQL blocks high/critical alerts
- Cursor automation comments; it cannot approve or merge
- `#14` author is `sdcarlson` so `sykosyber` must approve; `#12` author is `sykosyber` so `sdcarlson` must approve after the Windows fix is on the PR head

Because GitHub squash creates a **new** commit, branches that already contain `#14` (`aa3f2f4`) will **not** fast-forward after `#14` lands. Replaying their unique tree delta onto the squash commit is required. Do not `git rebase --onto main aa3f2f4` across the interleaved CI-bootstrap commits on `#11` and `#13` (those commits reintroduce deleted workflows).

## Open pull requests

| PR | Branch | Role | vs current main | Known defect |
| --- | --- | --- | --- | --- |
| [#14](https://github.com/SyberLabs/relay/pull/14) | `codex/delivery-foundation` | Protected CI/CD, identity gateway, React 19.2.8 | MERGEABLE, 8 App jobs green | None material. Closes #2. |
| [#18](https://github.com/SyberLabs/relay/pull/18) | `docs/context-management` | Docs-only context playbooks | MERGEABLE, grokcell validate green | None. README +2 in GrokCell section. |
| [#13](https://github.com/SyberLabs/relay/pull/13) | `feat/openai-handoffs-public-copy` | ChatGPT/Codex handoffs + public-copy CI | Contains `#14`; App CI must be green on the head that merges | Do not merge until aggregate `CI` is green. Keep #21 open after merge. |
| [#11](https://github.com/SyberLabs/relay/pull/11) | `relay-csv-mvp` | Tracker CSV import (DRAFT) | Contains `#14`; App CI green | Conflicts with #13 on `README.md` and `integrations/README.md` only. Closes #17. |
| [#12](https://github.com/SyberLabs/relay/pull/12) | `cursor/fix-local-dev-handoff-1d43` | Node 24 / port 3000 / local auth | MERGEABLE vs main today; **will conflict with #14** | #19: Bash guard fails on Windows. Fix already prepared at `cb4d7df` on `codex/qa-19-windows-node-guard`. |
| [#15](https://github.com/SyberLabs/relay/pull/15) | `cursor/stale-refresh-session-expiry-4577` | Stale refresh + 401 clears private state | BEHIND main by `2372771`; conflicts with #14 `package.json` | After #14, drop the test-script edit: `scripts/ci/run-unit.mjs` auto-discovers `tests/*.test.mjs`. Closes #7. |
| [#10](https://github.com/SyberLabs/relay/pull/10) | dependabot `react-server-dom-webpack` 19.2.6→19.2.8 | Dependency bump | BEHIND; conflicts with #14 lockfile | **Superseded and unsafe:** #14 already ships `react`, `react-dom`, and `react-server-dom-webpack` **together** at 19.2.8. #10 leaves react at 19.2.6 while the 19.2.8 RSC package peers `react@^19.2.8`. Close, do not merge. |

## Open issues mapped to PRs

| Issue | Merge action |
| --- | --- |
| #2 Ship delivery foundation | Close via #14 |
| #7 Stale workspace / 401 | Close via #15 |
| #17 Tracker CSV | Close via #11 |
| #19 Windows Bash Node guard | Close via #12 after cherry-picking `cb4d7df` |
| #21 ChatGPT/Codex + public copy | Implemented by #13; **keep open** until post-merge public-copy sync and Pages check |
| #16 Remaining esbuild advisories | After #14; new PR, not in this train |
| #9 Null-URL assistant handoffs | After #13; new PR |
| #8 Selected-job events beyond global 200 | After #14; new PR, independent of CSV/OpenAI |
| #20 Grok Bot command-review blocker | Environment/tooling; not a Relay merge |
| #3 Cloudflare hosting | Owner account work; not a merge |
| #4 Two-account isolation | Depends on #3 and #15 |
| #6 Backup/recovery rehearsal | Depends on #3 |
| #5 Product experiment | Research, not code |

## Simulated merge evidence (2026-09-06)

Throwaway merges against `2372771` / `aa3f2f4`:

- `#14` onto main: **fast-forward** to `aa3f2f4`
- `#18` onto `#14`: **clean** auto-merge of `README.md`
- `#13` onto `#14`: **fast-forward** of the unique 21-file delta
- `#11` onto `#14+#13`: conflicts **only** `README.md` and `integrations/README.md`; `package.json` auto-merged with both `csv-parse@7.0.2` and `public-copy:*` scripts; `app/about/page.tsx` and `tests/e2e/workspace.spec.ts` auto-merged
- `#12` onto `#14`: conflicts `package.json` and `vite.config.ts`
- `#15` onto `#14`: conflicts **only** `package.json` (`app/workspace.tsx` auto-merged)
- `#10` onto `#14`: conflicts `package.json` and `pnpm-lock.yaml` (do not resolve; close)

## Approaches considered

1. **GitHub number order (#10→#18)** — Rejected. #10 is a React peer-dep regression. #11/#13 dump the delivery foundation as a feature squash. #12/#15 fight the new `package.json` scripts.
2. **Single integration branch** — Rejected. Mixes owners, invalidates last-push approvals, and hides the #11/#13 README contract (`public-copy.json` markers vs CSV positioning).
3. **Sequential squash with unique-tree replay (recommended)** — Merge #14 first so `CI` exists. Replay each later PR as **one commit of `git diff aa3f2f4 <pr-head>`** (or a normal rebase for branches that do not contain #14). Resolve the two known content conflicts with the recipes in the implementation plan.

## Recommended train

```
main 2372771
  1. squash #14     → closes #2; required check becomes CI
  2. rebase  #18    → docs; first post-foundation CI exercise
  3. replay  #13    → ChatGPT/Codex; keep #21 open
  4. replay  #11    → CSV; resolve README + integrations/README; closes #17
  5. rebase  #12    + cherry-pick cb4d7df → local-dev; closes #19
  6. rebase  #15    without package.json test rewrite → closes #7
  close #10 as superseded
```

Do not pin Vite to port 3000 when `RELAY_CI_STATE` is set. Integration CI starts Vinext with `--port <ephemeral>` (`scripts/ci/run-integration.mjs`). A local-only port pin plus `strictPort` would make `pnpm test:e2e` fail.

Do not rewrite the `<!-- relay:public:start -->` … `<!-- relay:public:end -->` block by hand when landing #11. Add Tracker CSV to `docs/public-copy.json`, run `pnpm public-copy:sync`, and keep #11's "Why Relay" / "Where Relay fits" **outside** the markers.

## Success criteria

- All six shippable PRs squash-merged; #10 closed
- `main` history is linear
- On the final `main`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm public-copy:check`, `pnpm build`, `pnpm test:api`, `pnpm test:e2e`, `pnpm test:production` pass
- Windows Node guard is `node scripts/ensure-node.mjs` (no Bash)
- React trio stays 19.2.8
- 401 still clears private workspace state; CSV import still mounts only when signed in
- Issues #2, #7, #17, #19 closed by their PRs; #21 remains until external sync is verified
