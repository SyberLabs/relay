# Relay development context

Owner: Seth. Read this router once, then the current stage. These are development instructions; job-search assistant handoffs live in [context-management](../../context-management/README.md).

| Task | Stage contract |
| --- | --- |
| Scope a feature or investigate options | [01-plan](01-plan/CONTEXT.md) |
| Implement or debug an agreed outcome | [02-build](02-build/CONTEXT.md) |
| Review a diff or prepare a pull request | [03-review](03-review/CONTEXT.md) |
| Stage, release, or recover a version | [04-release](04-release/CONTEXT.md) |

Read [AGENTS.md](../../AGENTS.md), [abuse controls](../abuse-controls.md), and [delivery](../delivery.md) for every change. A fresh session must read current files. Within a session, reuse unchanged context; re-read after an edit, checkout change, compaction loss, or conflicting evidence. `node scripts/agent-context.mjs build` lists the selected documents, sizes, and content hashes; `--print` emits a portable packet only when those documents are not already loaded. Neither mode includes the issue, code, tools, or conversation history.

Find the affected symbol with `rg` in the relevant area, then read its callers, contract, and tests. Expand when evidence crosses that boundary.

| Concern | Start here |
| --- | --- |
| Job state, acceptance, imports | `lib/domain.ts`, `lib/import-upsert.ts`, `lib/editor.ts`, `tests/domain.test.mjs`, `tests/import.test.mjs` |
| Assistant packets and connectors | `lib/assistant-handoff.ts`, `integrations/README.md`, `tests/connectors.test.mjs` |
| Identity, quotas, CAPTCHA | `deploy/worker.mjs`, `docs/threat-model.md`, `tests/security.test.mjs`, `tests/auth.test.mjs` |
| Data, ownership, migrations | `db/schema.ts`, `lib/store.ts`, `drizzle/`, `tests/api.test.mjs` |
| UI and public copy | `app/`, `docs/PUBLIC-COPY.md`, `tests/e2e/` |
| CI and releases | `.github/workflows/`, `scripts/ci/`, `scripts/release/`, `tests/deployment.test.mjs` |

Use the [checkpoint](checkpoint.md) on interruption, compaction, or handoff. Keep working notes in ignored `private-data/development/<issue>/`; use fictional data even there when possible. GitHub remains authoritative for issue state and approvals. See [design and evaluation](README.md) only when changing this workflow.
