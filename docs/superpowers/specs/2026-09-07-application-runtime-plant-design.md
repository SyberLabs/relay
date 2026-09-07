# Application runtime plant UI

**Issue:** [#137](https://github.com/SyberLabs/relay/issues/137)
**Date:** 2026-09-07
**Decision owner:** Seth Carlson (product direction: attached `main-interface-1(1).html`)
**Implementation:** this change
**Cites:** [#134](https://github.com/SyberLabs/relay/issues/134) plant vs overlay, [#103](https://github.com/SyberLabs/relay/issues/103)/[#109](https://github.com/SyberLabs/relay/issues/109) stages, [#112](https://github.com/SyberLabs/relay/issues/112)/[#128](https://github.com/SyberLabs/relay/issues/128) application ledger

## Problem

A returning person cannot see Relay as a processing unit. Jobs, facts, tools, the editor, Applications, Track, and handoff compete as peer sidebar chrome. The agreed interface is the Application Runtime plant: one core application, inbound queue, sent receipts, blocked questions, context the agent writes with, live state, and an autopilot control.

The HTML mock is the visual and interaction source of truth. Copy that says Relay does not coordinate applications is outdated for this surface; the ledger in `docs/agent-applications.md` remains the send contract.

## Existing behavior

The workspace is a light dashboard: left sidebar of nine status filters plus Applications/facts/track/advanced, a job list, and a selected-job editor. Exact draft acceptance, import-as-evidence, blocker review, Connections (Obsidian/Notion/WebMCP packets), and `/applications` permits already exist. Jobs already store company, location, remote, pay band, and source. Fit is heuristic evidence gates, not a qualification or ATS score.

## Mock vs Relay (reconciliation)

| Mock                                              | Relay today                                                                                      | Ship                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross: N context, W sent, core, E queue, S stuck  | Sidebar + two-column grid                                                                        | Plant chrome on `/`. Other pages keep a dark shell with the same tokens.                                                                                                    |
| Autopilot auto-sends ≥75% fit                     | Application policy `enabled` + `review`; send is propose → approve → begin → receipt             | Toggle writes that policy. Auto-loads the next Held job. Does **not** accept wording or call `begin`.                                                                       |
| Approve and send                                  | Accept exact draft (Ready); send is `/applications`                                              | Held primary remains **Accept exact draft**. Ready shows **Approve and send** as a link to `/applications`. No employer POST.                                               |
| Inspect (why, resume diff, cover, form certainty) | Editor + evidence gates + sources + history                                                      | Inspect modal plus the existing editor inside Core so review tests still see the draft. Resume “diff” only reports saved vs accepted wording; it does not invent tailoring. |
| Fit %                                             | Evidence gates; tests forbid “match percentage” / “ATS score”                                    | Show **fit** as hits / compared gates. Inspect keeps the heuristic disclaimer.                                                                                              |
| Find more jobs / four boards                      | Import research JSON + Simplify tracker CSV; public Greenhouse/Lever pull is read-only discovery | **Find more jobs** opens the existing import dock (`aria-label="Import research"`). No fake crawl.                                                                          |
| Tools: Greenhouse, Lever, Indeed, LinkedIn        | Simplify CSV, Notion CLI, Obsidian notes, WebMCP, application policy                             | Tools modal lists those four plus daily maximum and “stop on unknown” (`review=all`).                                                                                       |
| Profile / resume variants / style sliders         | Fact ledger, resume extract, style rules                                                         | Modals read/write those APIs. No new variant table or slider schema.                                                                                                        |
| Stuck mid-submit                                  | `jobs.blocker` + BlockerReview                                                                   | South lane is jobs with a blocker that are not sent/ended. Clicking opens the job and the blocked-answer modal.                                                             |
| One job in core                                   | Selected editor                                                                                  | Selected job is core; Hold clears selection (job stays Held). Skip is existing Set aside.                                                                                   |
| Activity log                                      | `message` notices                                                                                | Sticky log line plus the existing polite notice.                                                                                                                            |
| Agent overlay on employer pages                   | Out of scope (#135)                                                                              | Not in this issue.                                                                                                                                                          |

## Features the mock has that Relay lacked (now in scope)

1. Plant layout with animated rails, live lamp, and working/idle body state.
2. Context tiles (Profile, Resume, Style kit, Tools) as first-class home actions.
3. Sent and Stuck plates always visible next to Up next.
4. Core facts: role, org/source, fit, location, listed pay, draft progress.
5. Inspect modal: why this job, evidence map, exact draft, accept/skip.
6. Autopilot control bound to the real policy.
7. Blocked-answer modal that can save a profile fact (existing “remember”) and resume the job.
8. Dark industrial visual system (Space Grotesk / IBM Plex Mono tokens).

## Explicitly not built here

- Employer form fill, arm/heartbeat, or Inspect-accept-sends (#135).
- New job statuses, tables, or gateway routes.
- OAuth to job boards, Notion, or Obsidian.
- Automatic draft acceptance or automatic `begin`.
- Resume variant files or voice sliders persisted as new columns.
- A second product or overlay injected into employer origins.

## Lane mapping

- **Up next:** current queue filter (default Held), minus the selected job, minus blocked jobs. Search still filters this list. `#workspace-queue` stays this plate.
- **Sent:** Submitted, Live loop, Skip, Offer, Accepted, Closed.
- **Stuck:** non-empty `blocker`, and status is not sent/ended/skip.
- **Core:** `selected` job, or empty “load next”.
- Sidebar **Job list** filters remain, compacted into the top bar, so existing journeys can still choose Ready/All/Submitted.

## Contracts unchanged

Every read/write is the authenticated owner. Imports cannot set Ready or reopen a closed job. Changing accepted text requires a new save. Stale editor packets cannot overwrite newer work. Policy-authorized is never labeled human-reviewed. Autopilot failure (no allowed jobs, expired policy) opens Tools and writes nothing extra.

## Tests

- Unit: `lib/runtime.ts` lane membership, pay/location/source formatting, fit percent (null when nothing compared), draft progress, hold/skip do not mark Submitted.
- Existing workspace compile tests still parse `applyExpired` / `refresh` / `saveFirstJob` in `app/workspace.tsx`.
- Browser: empty add-job; import; accept exact draft; blocked review; dirty navigation; plant plates visible; autopilot does not create an application operation.

## Public copy

No new shipped capability (Relay still does not POST to employers). Leave `docs/public-copy.json` unchanged unless review finds user-visible capability text that is now false.
