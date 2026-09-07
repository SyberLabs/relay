# Invited-pilot trust boundaries

Owner: Seth Carlson. Implementation: #78. Baseline inspected: `bae278130f2031aab1249aa88f7bf54b46741460`, September 6, 2026. This work changes navigation and presentation, not claim algorithms, handoff contracts, status transitions or storage.

The pilot supports one job, reusable candidate facts, an external assistant handoff, human review and exact-text acceptance, then later reuse. `/profile` stores facts confirmed by the user; the browser handoff still uses a separate unsaved text box. `/advanced` preserves access to `/review`, `/preferences` and `/plan`. Job filters, outcomes, source history and review history remain visible in the workspace.

## What each check establishes

- **Candidate confirmation:** stored `Verified` means a user confirmed the fact. Relay does not independently verify its accuracy. Agent citations require that state and an unexpired fact.
- **Agent draft logging:** `validateDraftLog` in `lib/profile.ts` validates cited IDs and applies selected claim patterns, vocabulary overlap and numbers pooled across cited facts. This does not establish semantic entailment. Passing can miss unsupported claims; failure can reflect wording differences.
- **Browser return:** `draftFromResult` / `draftFromPastedJson` in `lib/integration-files.ts` check the envelope, bounded text and job key/version, plus provider-dependent ID checks. `lib/editor.ts` protects against a changed editor or session. These do not check citations or truth. The success message retains instructions to reload if the editor changed during loading.
- **Workspace save and acceptance:** `/api/workspace` uses owner and version checks and `validateEdit`; it does not call the agent draft-log gate. Acceptance records exact wording. Editing requires fresh acceptance under the existing rules. Protected application statuses and import history remain unchanged.
- **Requirement matches:** `lib/fit.ts` compares selected posting lines with user-confirmed, unexpired facts using word/number overlap. The displayed labels describe matching evidence, not qualifications.
- **Advanced planning:** `/api/plan` feeds reply-rate estimates, adjusted for posting age, into `expectedMax`. It has no demonstrated reply-to-offer conversion model. The UI presents an experimental score and suppresses the old offer-assurance reason text; the API's existing fields and calculations remain unchanged.

## Fictional limitation probes

Direct calls to the unchanged functions on September 6 produced these results. Every fact below had empty evidence, stored status `Verified`, and no expiry. The probe time was `2026-09-06T00:00:00.000Z`.

1. `validateDraftLog` allowed **“I increased pipeline latency by 20%.”** citing only **“I reduced pipeline latency by 20%.”** Shared words and numbers do not preserve meaning.
2. It allowed **“I led a team of 40 engineers.”** citing **“I led a team of 6 engineers.”** and **“I reviewed 40 invoices.”** The number pool does not bind a number to its original fact or subject.
3. It allowed **“I am a licensed architect.”** with no citations. The selected claim patterns do not cover every factual assertion.
4. `assessJob({name: 'Fictional Engineer'}, [{notes: 'Requirements:\nMinimum 5 years of Python experience.'}], facts, now)` returned internal `miss` when the only fact was **“I have 7 years of Python experience.”** Exact numeric matching does not reason about minimums.

These are observed limitations, not desired invariants. No regression test requires these incorrect outcomes to continue, and no failing test is retained to demonstrate them. UI behavior tests use ordinary fictional evidence to check the revised labels and keep the existing security/acceptance suites intact.

## Follow-up requirements after merge

**First-job owner:** start with `app/workspace.tsx`, `app/connections.tsx`, `tests/e2e/pilot.spec.ts` and the existing import/editor tests. The pilot still needs an explicitly scoped first-real-job entry flow; this PR adds no form. Preserve current import preview, posting identity, source observations, stale editor checks and exact acceptance. Keep Advanced secondary and source/review history accessible.

**Profile-handoff owner:** start with `app/profile/page.tsx`, `app/connections.tsx`, `tests/e2e/assistant.spec.ts` and `tests/e2e/pilot.spec.ts`. Replace duplicate typing only in that task: let the person explicitly select saved, confirmed, unexpired facts; show exactly what will be shared; define how provenance/version and later changes are represented before changing the shared packet contract. Cover selection, expiry, changed profile/editor, sign-out and cross-job leakage. Do not infer that browser text passed draft-log checks.

**Future check/planning work:** separately specify claim-pattern coverage, fact-to-number association, negation and numeric requirement comparisons before changing the heuristics. Define the distinction between reply estimates and offer probabilities before making outcome claims; legacy `/api/plan` reason strings still need a contract-aware correction for non-UI consumers. Shared agent descriptions in `app/agent-tools.ts` and packet/prompt terminology also need the handoff owner's contract-aware review; their current verification language must not be treated as a guarantee. No semantic engine, new provider integration, telemetry or schema is introduced here.

Maintain public text through `docs/public-copy.json` and `pnpm public-copy:sync`. No external profile refresh, Site creation or deployment belongs to this draft PR. Deployment files and `docs/hosting.md` remain release-owned; `docs/pilot/` remains experiment-owned.

## Local verification, September 6, 2026

Windows, Node 24.19.0, pnpm 11.19.0; isolated `codex/78-pilot-trust` worktree based on `bae2781`. All test records were fictional. Each integration runner migrated its own local database and owned its ports/processes.

- Frozen dependency install, lint, typecheck, production build, public-copy sync/check and `git diff --check` passed.
- `pnpm test`: 296 passed; two Unix process-signal tests skipped on Windows; zero failures.
- `pnpm test:e2e`: 19 Chromium tests passed. Includes saved-fact confirmation/reuse, evidence labels, dirty navigation, exact acceptance/reacceptance, source/review history, assistant JSON/file return limits, stale packets, CSV/import preservation, session expiry, all Advanced routes, batch review without acceptance, saved planning budget, and Advanced access at 390px width.
- `pnpm test:api`, `pnpm test:calibration`, `pnpm test:orchestration`, `pnpm test:cli` and `pnpm test:production` passed. Production includes a separate two-session Chromium owner-isolation test plus built rendering/assets, identity, expiry, origin and stale-write checks.
- `pnpm audit --audit-level high` passed, reporting one low and one moderate advisory (existing follow-up #16).
- Manual local-browser inspection exercised fictional bootstrap, job selection, exact acceptance/history and Advanced planning. No external assistant was called and no real participant outcome was measured.

The first integration launch was stopped by Vinext's one-development-server-per-checkout lock while the preview ran; subsequent suites ran sequentially with the preview paused. Initial browser failures exposed stale test labels and a test filling the preferences budget before initial data finished loading; tests now wait for the loaded state and verify the persisted budget. No retries, suppressed failures or changes to the core checks were added. This local verification does not replace required GitHub checks or peer approval.
