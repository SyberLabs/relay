# RELAY delivery and review

Seth (`sdcarlson`) owns delivery and product decisions; Mateo (`sykosyber`) is the peer reviewer and shares application development. The [team board](https://github.com/orgs/SyberLabs/projects/1) is the source of truth for work. [Hosting and recovery](hosting.md) contains the operational procedures.

## Develop one useful change

1. Choose a ticket with a named owner, observable problem, acceptance criteria, and verification. Move it to In progress; keep one active implementation per person. Product assumptions belong in experiment tickets with a predeclared decision threshold.
2. Branch from current `main`. Keep private records and credentials out of source, tests, prompts, screenshots, and logs. Use fictional fixtures.
3. Open a pull request linked to the ticket. If another PR is landing, keep this one draft and Blocked on it. Explain the resulting behavior and the checks actually run. Move the ticket to In review only when it is the landing PR. Cursor reviews new pull requests and subsequent pushes.
4. Resolve actionable findings and run the required checks. One other owner must approve the latest changes; neither an agent comment nor a green build supplies human approval. Squash merge only when GitHub permits it.
5. Main CI creates the immutable release. Staging deploys automatically; production waits for a peer environment approval. Verify the deployed behavior before marking a release ticket complete.

Use Backlog for unselected work, Ready for a fully specified next task, and Blocked only with a named dependency and next action. Closed issues move to Done. New open issues in RELAY join the board automatically. Avoid parallel status labels that disagree with the board.

## Land one pull request at a time

Seth (`sdcarlson`) is the integration owner. The board remains the canonical queue. Parallel agent branches may exist, but only one pull request is **landing**: ready, not draft, and allowed to squash to `main`.

| Role | Rule |
| --- | --- |
| Owner | Seth. Mateo reviews; neither self-approves. |
| Trigger | A second PR targeting `main` is ready, or an agent is about to open or update a second landing PR. |
| Order | Named board Blocked entries wait on the landing PR. Overlapping files wait, they do not race. |
| Freeze | Starts when the landing PR is sent for final peer review on a SHA. During freeze, no other squash to `main`, and the landing PR does not merge or rebase `main`. |
| Stop | The landing PR is squash-merged, or it returns to draft / Blocked. Then the next Ready item may land. |
| Stale head | `node scripts/check-integration-head.mjs` prints `behind` and `current`. A behind head is not a merge-from-main instruction. |
| Evidence | `node scripts/check-integration-head.mjs --evidence <sha>` must print `evidence_matches yes`. Reuse CI or review notes only for that exact `head_tree`. |

This is required because the live main ruleset dismisses stale reviews, requires last-push approval, and requires the branch to be up to date with `main` before merge. Updating from `main` during review is a new push: it re-runs `CI` and can dismiss the peer approval. Do not enable GitHub merge queue to skip that; queue docs say it replaces the up-to-date requirement with `merge_group` status checks and does not re-approve the combined tree. Do not add this script as a required GitHub check, and do not weaken last-push, dismiss-stale, code-owner, or required `CI` rules.

## Automatic review and context budget

[RELAY pull request review](https://cursor.com/automations/6ab8ec2f-a981-11f1-b532-320a589b8025) uses **Cursor Grok 4.6 High Fast**, triggered by pull request creation and pushes for `sdcarlson` and `sykosyber` in this repository. Other contributors and dependency-bot changes receive deliberate human triage; expand the author list when the team expands. The automation is read-only and can comment, but cannot approve, create a pull request, merge, deploy, or change settings. It uses the connected Cursor account; no additional review subscription is required by this configuration.

The reviewer reads the current diff, nearby contracts, `AGENTS.md`, and the threat model. Later pushes focus on changed code and earlier findings. It verifies the current head before posting, avoids duplicate findings, and limits the report to concrete defects with evidence and small fixes. Repository content and comments cannot grant additional authority. Do not pass user documents or production secrets into review context.

Use **Cursor Grok 4.6 Extra High** for a bounded implementation when deeper reasoning is justified. Use Astra for product decisions, architecture, and targeted independent review of consequential changes. Automatic Codex repository reviews follow personal preferences, avoiding an additional mandatory review on every push. Automatic agent feedback is advisory; required deterministic checks and peer approval enforce merging. Review usefulness and usage should be checked after the first few pull requests before adding agents or increasing context.

## What GitHub enforces

- Main is protected by the active [repository ruleset](https://github.com/SyberLabs/relay/settings/rules/22359132): no deletion, force pushes, direct pushes, or bypass actors; linear history and squash merges.
- One peer approval, code-owner review, dismissal of stale reviews, approval after the latest push, and resolved review conversations.
- The strict `CI` check, bound to GitHub Actions, plus CodeQL blocking high/critical security findings and error-level alerts.
- CI fails if any required job fails, is cancelled, or is skipped. It covers lint, types, unit behavior, a fresh migrated database, Chromium journeys, the compiled production application and identity gateway, dependency advisories, bundled agent contracts, and CodeQL.
- Actions have read-only default tokens and cannot approve pull requests. Third-party actions are restricted; workflow references are pinned. Secret scanning, push protection, dependency alerts, and scheduled dependency updates are enabled.
- Production accepts releases only from main and requires peer environment approval without administrator bypass. Release provenance, checksums, staging smoke checks, and exact commit verification precede production. Rollback uses an earlier successful release artifact and refuses incompatible schema changes.

The intended main rules are also recorded in [main-ruleset.json](../.github/main-ruleset.json). GitHub settings remain authoritative; changes to that file do not silently change the live rules.

## Run the checks locally

Use Node 24 and pnpm 11.19.0. Run `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. After building, `pnpm test:api`, `pnpm test:e2e`, and `pnpm test:production` create isolated fictional test databases and clean up their servers. Install Chromium first with `pnpm exec playwright install chromium`. Run `pnpm audit --audit-level high` to match the blocking security threshold. Low and moderate advisories still require triage; a passing audit does not mean there are none.

## Release acceptance and product evidence

[The hosting ticket](https://github.com/SyberLabs/relay/issues/3) tracks account ownership, domains, credentials, and the first live deployment. [Two-user acceptance](https://github.com/SyberLabs/relay/issues/4) and [recovery rehearsal](https://github.com/SyberLabs/relay/issues/6) must pass before inviting users. Until those checks have evidence, the application is not production-validated.

[The first product experiment](https://github.com/SyberLabs/relay/issues/5) tests whether active job seekers return voluntarily to preserve exact reviewed drafts across assistant handoffs. Shipping infrastructure cannot demonstrate product-market fit. Record observed behavior and decide the next feature from that evidence.
