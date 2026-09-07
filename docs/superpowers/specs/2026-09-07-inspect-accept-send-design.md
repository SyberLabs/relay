# Inspect Accept sends a complete armed application

**Issue:** [#135](https://github.com/SyberLabs/relay/issues/135)
**Date:** 2026-09-07
**Decision owner:** Mateo Robles

## Problem

The human and the operative currently share a dense dashboard and a separate `/applications` ledger. The human cannot see a single **Inspect** cell that fills in as the operative types. **Accept** still means “these exact draft words are approved,” not “send this application now.” The operative cannot wait in a ready state for that click, then submit at the employer.

The intended product is:

- The **operative** works on the employer page with a small CLI overlay, filling every required field and file, and streaming that payload into Relay so the human Inspect view updates.
- The **human** sees a high-level Inspect overview (destination, fields filled, unknowns, ready/armed).
- **Accept is enabled only when the payload is complete and the operative is armed to send.** Clicking it is the send authorization. The waiting operative then performs the employer submit once and reports the receipt.

This replaces the older line that Relay is only a research/review product and never a coordinated sender. Abuse, owner isolation, exact payloads, one execution, and no automatic retry remain in force.

## Decision

Do **A**, then **B**, then **C**. Never **D**.

- **A (this issue):** This spec and the implementation plan. No schema or UI ships here.
- **B (implementation):** Live preparation + arm + Accept-requires-armed + existing `begin`/`complete` on the immutable operation. Inspect Accept on the selected job. Tests first.
- **C (implementation):** Overlay route and WebMCP/CLI verbs that drive B from the employer VM.
- **D (deleted):** Relay HTTP-posting to an employer, injecting a script into a cross-origin employer page, Accept without an armed waiter, mutating `Submitted` without a receipt, retrying `executing`, or treating draft `Ready` as send permission.

Who clicks the employer’s Submit control? The **operative**, in the employer origin, after Relay returns `execute: true`. Who is allowed to obtain that permit? Only after the **human** Accepts **this** frozen payload while the operative’s arm is live.

## Why the current ledger is not enough

`application_operations` from #128 is the right **evidence** object: immutable destination, fields, files, digest, one `begin`, receipt. It is the wrong **live fill** object: insert is all-or-nothing, there is no heartbeat, and the human clicks **Begin this application once** on `/applications` instead of Accept on Inspect.

Keep operations immutable. Add a **preparation** row the operative overwrites while filling. Freeze it into an operation when the operative arms. Accept authorizes that operation. The operative calls `begin` and submits.

## Handshake

```text
Human Inspect                         Relay                         Operative overlay
     |                                  |                                  |
     |  poll inspect DTO                |  prepare (fields/files)          |
     |<---------------------------------|----------------------------------|
     |  Accept disabled (incomplete)    |                                  |
     |                                  |  arm (complete + heartbeat)      |
     |  Accept enabled                  |  wait_accept loop                |
     |  click Accept ------------------>|  approve if armed_until > now    |
     |                                  |  authorized -------------------->|
     |                                  |  begin => execute:true --------->|
     |                                  |                     employer Submit
     |  west: submitted                 |  complete + receipt              |
```

Relay never fetches the employer URL. A lost `begin` response is inspected on GET; `executing` is not permission to submit again.

## States

Preparation (one row per owner+job, overwritten):

| `ready` | `armed_until` | Meaning |
| --- | --- | --- |
| false | past/empty | Filling. Inspect shows progress. Accept off. |
| true | past/empty | Frozen payload exists, operative not present. Accept off. |
| true | > now | Armed. Accept on. |

Operation (existing, unchanged meanings except how they are entered):

| `state` | Meaning |
| --- | --- |
| `proposed` | Frozen, waiting for Accept. (`authority` is `review-required`.) |
| `authorized` | Human Accepted this digest. |
| `executing` | `begin` consumed the one permit. |
| `submitted` | Receipt recorded; job status becomes Submitted. |
| `uncertain` | Employer result unknown; do not retry. |
| `not-submitted` | Explicit evidence no send occurred; new proposal allowed. |
| `cancelled` | Human/operative abandoned before `begin`. |

Policy `review: all` is the Inspect path: freeze always lands `proposed`, never auto-`authorized`. Policy `review: sensitive` ordinary-field shortcut is **not** used for Inspect Accept; sending still requires the human click when the surface is Inspect.

## Storage

New table `application_preparations` (migration `0009_*`):

- Primary key `(owner, job_id)` — at most one live fill per job.
- `actor` text, `job_version` integer, `destination` text, `fields` text (JSON array `{label,value,unknown}`), `files` text (JSON array same shape as the manifest, or empty until attached), `operation_id` text null, `ready` integer, `armed_until` text, `updated` text.
- Bounds: `fields` length ≤ 100, unique labels, each value ≤ 20,000 characters; files ≤ 2 and existing byte/sha256 rules; `length(CAST(fields AS BLOB))+length(CAST(files AS BLOB))` ≤ 240,000.
- Trigger: owner may hold at most 500 preparation rows (same job cap). Overwrite in place; do not grow history here. History is `application_operations`.
- Owner isolation on every read/write. No other owner’s preparation is visible.

Freezing copies the exact JSON into `proposeApplication`. After freeze, changing a field requires a **new** operation id; the old `proposed`/`authorized` row is cancelled if still pre-`begin`. `executing` cannot be cancelled or overwritten.

## API

All routes stay on `/api/applications`, authenticated owner, origin check, existing body cap 248,000. `viewer` must match. New actions:

| `action` | Weight | Effect |
| --- | --- | --- |
| `prepare` | 10 (mutation) | Upsert preparation for `job`. Replaces the whole `fields`/`files`/`destination` snapshot. Sets `ready=0`, clears `armed_until`, does not insert an operation. Client should batch (one snapshot per second while filling), not one request per keystroke. |
| `arm` | **1 (presence)** | If snapshot is complete (every field nonempty, no `unknown: true`, destination HTTPS, files checksums valid), freeze via `proposeApplication` if no current operation for this digest, set `ready=1`, set `armed_until = now+20s`. Repeat `arm` to extend the window without changing the digest. Different content → new operation id (client supplies). |
| `approve` | 10 (mutation) | **Change:** succeed only if `state='proposed'` **and** that job’s `armed_until > now`. Same digest check as today. Does not call `begin`. |
| `begin` / `complete` / `uncertain` / `not-submitted` / `cancel` | existing | Unchanged semantics. |

`GET /api/applications?job=<id>` returns the **inspect DTO** for the owner’s selected job (no file bytes):

```ts
type InspectView = {
  job_id: string;
  destination: string | null;
  fields: { label: string; filled: boolean; unknown: boolean }[];
  files: { name: string; sha256: string }[];
  missing: string[];
  ready: boolean;
  armed: boolean;
  operation_id: string | null;
  digest: string | null;
  state: string | null;
  accept_enabled: boolean; // ready && armed && state === 'proposed'
};
```

Exact field values for the expanded Inspect detail use existing `GET /api/applications?id=<operation>` after freeze. During fill, `GET ...&job=` may include values in a second authenticated payload `fields[].value` so the human can read answers before Accept; do not put file bytes on the poll.

Gateway: classify `action=arm` as weight 1 and cap **6 arm requests per user per minute**. A 2s heartbeat would blow the mutation quota; the operative arms every **10s**, window **20s**. Document this in `docs/abuse-controls.md` before shipping B.

## CLI verbs (overlay / WebMCP)

Relay does not generate essay text. `r.write` returns stored exact text or asks the agent to produce it, then `prepare`s it.

| Verb | Relay call | Employer DOM |
| --- | --- | --- |
| `r.next` | Existing workspace jobs in the policy allowlist, `Held`/`Ready`, no executing op | Navigate to `job.url` |
| `r.write(label)` | If preparation has a nonempty value for `label`, return it. Else 409 `unknown` with that label; agent writes using `relay_read_profile`, then `prepare` | Paste returned text into the matching control |
| `r.block(label)` | `prepare` with `unknown: true` for that label | Stop; do not invent |
| `r.arm` | `arm` | Do not submit |
| `r.wait_accept` | Poll `GET ?job=` until `state=authorized` or cancelled/timeout (client-side, ≤5 min, 500ms–1s) | Do not submit |
| `r.send` | `begin`; only if `execute===true`, click employer Submit **once**; then `complete` with observed receipt | Submit control |
| `r.close` | `cancel` if pre-`begin`; else stop | Leave the page |
| `r.status_change` | **Not a free status write.** Map `submitted` → `complete`, `uncertain` → `uncertain`, `not-submitted` → `not-submitted`. Anything else 400. | — |

`r.send` is illegal unless `state=authorized`. The overlay must not click Submit because the human Accepted in the UI without `begin`.

## Inspect UI (human)

Selected job on `/` (later plant chrome can wrap this; the first UI slice is a details region named Inspect):

- List field labels with filled / unknown marks; destination host; file names.
- Copy: Accept sends **this** application at the employer via the waiting operative. It is not draft-wording Ready.
- **Accept** button: enabled iff `accept_enabled`. POST `approve` with `id`+`digest`.
- If `ready && !armed`: “Operative is not on the page.” Accept disabled.
- If unknowns: south **Blocked** list; Accept disabled. Human types the answer → `prepare` that field `unknown: false` (human mutation), operative must re-`arm`.
- After `authorized` before `submitted`: “Accepted — waiting for the operative to send.”
- After `submitted`: west tracking / existing Submitted filter.

**Skip** remains set-aside (`save('Skip')`) and `cancel`s a pre-`begin` operation. It does not send.

Draft **Accept exact draft** (`Ready`) stays a **separate** control or is removed from Inspect in the UI slice so one checkmark cannot mean two things. Inspect’s ✓ is send authorization only.

## Overlay placement

Relay cannot inject a widget into `employer.example` (cross-origin). Do not plan a content-script extension in B/C.

**C** ships `/apply` as a compact authenticated overlay page (≈320×240, no plant chrome) that renders the CLI transcript and Inspect summary for `?job=`. The operative’s VM shows the employer page and this Relay page both visible (split or corner window). The agent copies `r.write` output into the employer control. Window layout is the VM’s job; Relay only provides a small page.

## Failure paths

| Event | Result |
| --- | --- |
| Accept while `armed_until` expired | 409; Accept stays off until next `arm` |
| `prepare` after freeze, different digest | New operation id; previous `proposed`/`authorized` cancelled if pre-`begin` |
| `prepare` while `executing` | 409; do not change payload |
| `begin` twice | 409; inspect saved state; do not click Submit again |
| `begin` response lost | GET; if `executing`, do not submit again; record `uncertain` or `complete` from observation |
| Employer CAPTCHA / login | `r.block`; do not Accept-send |
| Human Accept, then operative crash before `begin` | Stays `authorized`, not sent. Re-`arm` then `begin`. Capacity not consumed until `begin` |
| Human Accept, `begin` ok, crash during Submit | `executing`; human/operative record `uncertain` or `not-submitted` with evidence; no second `begin` |
| Other owner’s job id | 404 empty inspect |

## Abuse and cost

No Relay-funded model, crawl, or email. Writer work stays in the caller’s assistant. Arm weight 1, 6/min. Prepare remains a mutation (batch snapshots). Existing 10 starts/UTC day, one executing op per owner, 500 operations, 240k manifests stay. Refuse paths tested.

## Public copy and engineering contracts

When B ships, update `docs/public-copy.json` so shipped capability text names: a human Accept on a complete armed payload authorizes the waiting operative to send once. Update `AGENTS.md` and `docs/agent-applications.md` to the handshake above. Do not claim Relay submitted the HTTP form.

## Testing when B/C exist

- Prepare incomplete → `accept_enabled` false; `arm` 409.
- Unknown field → `arm` 409; Inspect Blocked.
- Arm, wait 21s, approve 409; arm again, approve 200, state `authorized`.
- Approve then `begin` → `execute: true`; second `begin` 409.
- Two owners: A cannot read B’s preparation.
- E2E: overlay/`prepare` fills three fields; Inspect shows three filled; Accept disabled until arm; Accept; mock operative `begin`+`complete`; job Submitted; file bytes round-trip.
- Existing #128 e2e still can propose from `/applications` **or** is updated so Inspect is the only approve path; do not leave two conflicting Begin buttons.

Rollback: revert B; keep `0009` if preparations exist (empty table is harmless). Do not drop `application_operations`.
