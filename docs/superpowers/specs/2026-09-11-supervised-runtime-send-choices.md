# Supervised runtime: send-path choices and T-stage status

**Issue:** [#168](https://github.com/SyberLabs/relay/issues/168)
**Date:** 2026-09-11
**Recorded by:** Mateo Robles
**Contract owner:** Seth Carlson
**Not approval.** This is a product/design record of choices already in force. GitHub issues and [application coordination](../../agent-applications.md) remain authoritative. Do not treat this file as a new send contract, a public-copy source, or permission to change T2–T6.

## Problem

The destination is a **supervised application runtime**: an agent fills an employer form; a human authorizes send. People read three different “do not POST” rules as one sentence, then conclude Relay refuses to apply. Those rules are not the same. Mixing them makes T2 look pointless and hides the actual next product call.

User problem [#168](https://github.com/SyberLabs/relay/issues/168) names: fewer human actions per submitted application. The plant is about 15–25 clicks; the mock is about 3. Product-market fit stays unvalidated until people return on their own ([#5](https://github.com/SyberLabs/relay/issues/5)).

## Decision

Keep **A**, **B**, and **C** as separate named requirements. Do not collapse them. Do not treat **D** as implied by A–C.

| Id | Choice | What it is | What it is not |
| --- | --- | --- | --- |
| **A** | No Relay POST | The Cloudflare Worker is not an HTTP client to the employer. Submit is a click in a browser that already has the ATS session. | “Relay does not apply.” The operative **does** apply. |
| **B** | Extension mailbox | `/api/applications` and `/api/workspace` run from a signed-in Relay-origin page (`credentials: 'same-origin'`). `chrome-extension://` mutations stay 403. No `chrome.cookies`. | A ban on filling forms. |
| **C** | T2 fixture-only fill | Until a named ATS adapter exists, the first-party extension writes only a fictional fixture (including the **Submit fictional application** control). A live **Apply now** page is refused. | The same rule as A. Fixture-only is a T2 slice so optional `https://*/*` cannot type into a random live form. |
| **D (deleted)** | Worker-hosted applicator | Store employer cookies or ATS API keys on Relay and POST from the Worker. | Not authorized. [#112](https://github.com/SyberLabs/relay/issues/112) called this a **new** contract, not implied by draft acceptance or Inspect Accept. |

Who clicks the employer Submit control? The **operative**, in the employer origin, after `begin` returns `execute: true`. Who may obtain that permit? Only after the **human** Accepts **this** frozen payload while the arm is live. Relay records the operative-observed receipt; it does not independently verify the employer.

## Why A exists (product and physics)

Relay’s Worker has the owner’s **Relay** session. It does not have the owner’s Greenhouse, Lever, Workday, or company-careers session. A server POST to an ATS would require one of:

- employer cookies or tokens stored in Relay,
- an ATS API integration,
- or Relay becoming the applicant of record (our IP, our legal send, captcha/CSRF/file handling per host).

That is a hosted applicator. Cost, SSRF, credential storage, and “we submitted this as you” all change. Abuse controls already say application work does not call or enqueue an upstream provider; external assistants supply their own browser execution.

The cheap, correct Submit is the page the human is already logged into. T2’s extension is that hand, in Chromium, under Inspect. Same-tab `window.relay` / WebMCP remains for hosts that cannot load the extension.

**Dumb reading of A (kill it):** never apply to jobs.  
**Named reading of A (keep it):** do not make our Worker the applicant until a named owner accepts cookies-in-Relay, outbound ATS POSTs, and that legal/cost surface.

## Why B exists (trust boundary)

Inspect Accept is send authorization for one digest. If the service worker could `fetch` those APIs from `chrome-extension://`, or read `chrome.cookies`, the extension origin becomes a second, weaker client. `refuseUntrustedOrigin` stays: missing origin or exact request origin only. Overlay `/apply` still has no Accept. Policy authorization is not human draft acceptance.

## Why C exists (T2 design, not the end state)

T2 ([#177](https://github.com/SyberLabs/relay/issues/177), [PR #179](https://github.com/SyberLabs/relay/pull/179)) proves the handshake on a form we control:

```text
prepare → arm → wait → human Inspect Accept → begin execute:true once → fixture Submit once → complete
```

Value of the fixture: execute-once, disconnect-does-not-submit, incomplete fields never start, and origin isolation — without spraying keystrokes at a live ATS we cannot map.

A real **Apply now** is refused because the extension can be granted optional `https://*/*`. Start + fill on whatever tab is focused would type the frozen payload into **any** HTTPS form. T2 has no Greenhouse/Lever field map. Dumping “Full name” into whatever `<input>` exists would be a wrong application.

C is deletable **when** a named adapter exists (this host, these fields, this submit control) still under A, B, Inspect Accept, and one Submit. That adapter is **not** T3–T6 as written in #168.

## Architecture

```text
Human (workspace Inspect)          Relay Worker                 Operative browser              Employer origin
        |                               |                               |                              |
        |  poll inspect DTO             |  prepare / arm / wait         |                              |
        |<------------------------------|<------------------------------|                              |
        |  Accept disabled until armed   |                               |                              |
        |  click Accept ---------------->|  approve this digest        |                              |
        |                               |  authorized ------------------>|                              |
        |                               |  begin => execute:true ----->|  click Submit once --------->|
        |  submitted / uncertain        |  complete + observed receipt |                              |
```

Relay never fetches the employer URL. A lost `begin` is inspected on GET. `executing` is not permission to submit again. Uncertain stays uncertain.

| Surface | Role |
| --- | --- |
| Workspace Inspect | Human send authorization for one armed digest |
| `/apply` overlay | Operative summary only; no Accept |
| First-party MV3 (`extensions/operative`) | Recommended T2 execution surface; mailbox + isolated fill |
| `window.relay` / WebMCP | Same-tab hosts that cannot load the extension |
| Employer page | The only HTTP POST of the application form |

## Requirement owners

Elon’s rule: a requirement has a **person’s name**, not a department. Question it; do not inherit it from “security” or `AGENTS.md` as a bureau.

| Requirement | Named owner | Source |
| --- | --- | --- |
| A — Worker does not POST the employer form | Seth Carlson | [agent-applications.md](../../agent-applications.md) (Owner: Seth); [#112](https://github.com/SyberLabs/relay/issues/112); [#128](https://github.com/SyberLabs/relay/pull/128); [abuse-controls.md](../../abuse-controls.md); public copy |
| B — no `chrome-extension://` Relay mutations, no `chrome.cookies` | Seth Carlson | [#177](https://github.com/SyberLabs/relay/issues/177); `lib/request-origin.ts` |
| C — T2 fixture-only fill | Seth Carlson | [#177](https://github.com/SyberLabs/relay/issues/177) owner; fill inspects destination + **Submit fictional application** |
| Inspect Accept is send permission; draft Ready is not | Seth Carlson | [#135](https://github.com/SyberLabs/relay/issues/135); [inspect-accept-send design](2026-09-07-inspect-accept-send-design.md) |
| T0–T6 sequence | Seth Carlson (program); Mateo Robles (implementer) | [#168](https://github.com/SyberLabs/relay/issues/168) |
| Peer merge / production approval | The other maintainer; production is a separate environment approval | [delivery.md](../../delivery.md) |

`docs/PUBLIC-COPY.md` labels Mateo as Product and Seth as lead engineer. [delivery.md](../../delivery.md) says Seth owns product decisions. For **A–C**, the paper trail is Seth’s. Mateo can question them; changing them is a Seth scope change.

Seth’s order on #112: question required clicks → delete packet/UI busywork → simplify onto existing state → measure → automate only the loop that already works. Worker→ATS POST is step 5 on a loop that does not exist (no ATS session in Relay; [#111](https://github.com/SyberLabs/relay/issues/111) still open).

## T-stage status (2026-09-11)

Program home: [#168](https://github.com/SyberLabs/relay/issues/168). Children exist for T0–T2 only. T3–T6 are sequence lines on the parent, not child issues yet.

| Stage | Intent (user-visible) | Issue / PR | State |
| --- | --- | --- | --- |
| **T0** | Answering a blocked question in the plant works. No illegal `remember:true` on `choice:'answer'`. Job notes stay on the job. | [#169](https://github.com/SyberLabs/relay/issues/169) / [#170](https://github.com/SyberLabs/relay/pull/170) | **On main** |
| **T1** | A reusable blocked answer may propose an owner-scoped `profile_facts` row with a `field_key`. Human verification still required before drafts use it. Job-only wording does not create a fact. | [#172](https://github.com/SyberLabs/relay/issues/172) / [#173](https://github.com/SyberLabs/relay/pull/173) | **On main** |
| **T2** | Unpacked Chrome MV3 operative runs the Inspect handshake on a **fictional fixture**. | [#177](https://github.com/SyberLabs/relay/issues/177) / [#179](https://github.com/SyberLabs/relay/pull/179) | **Open.** CI green on `3e0b152`. **Not mergeable:** Seth **REQUEST_CHANGES** — `permissions.request` must be the first async on Start (grant HTTPS Relay origin, then `loadJobs`). Fixture-only fill P1s were addressed in product code; this grant-then-load path is still outstanding. |
| **T3** | A blocked question parks a durable run; `resume(run_id, answer)` continues it. Discarding a modal is not the product. | Sequence on #168 only | **Not issued** |
| **T4** | Split `app/workspace.tsx`. Same behavior, no new surface. | Sequence on #168 only | **Not issued** |
| **T5** | Collapse plant copy, job statuses, and drafting decisions onto the two-screen model (Runtime + Tracker). | Sequence on #168; vocabulary already sketched in [interaction stages](2026-09-07-interaction-stages-design.md) | **Not issued** |
| **T6** | Retire the heuristic fact-overlap gate; fold or delete `/plan`, `/preferences`, and `/review` **as routes** only after Runtime and Tracker are the real product. | Sequence on #168 | **Not issued.** T6 is not “we apply to Greenhouse.” |

**Immediate next (T2, still #177):** implement grant-then-load so Start on deployed HTTPS Relay can list jobs, then Seth re-reviews. Do not start T3–T6 on that PR.

**Next after T2 merge:** open a T3 child under #168 with a resume contract (what is `run_id`, where it lives, how it relates to `jobs.blocker` and Inspect unknowns, refusal/idempotency, no auto-retry of `executing`). T4 is a file split, not a product feature. T5 is copy/state naming. T6 deletes extra routes only when T5’s two screens are true.

## Decisions required to finish T6

T6 is the last line of **this** program. Finishing it does not, by itself, ship a real ATS adapter. List every named decision so we do not pretend T6 is “done applying.”

| Decision | Owner | Needed to finish T6? | Needed for a real employer Submit? |
| --- | --- | --- | --- |
| Merge T2 after grant-then-load | Seth (approve); Mateo (implement the P1) | Indirect (T3 assumes a first-party operative exists) | Yes, as the hands; still fixture until an adapter exists |
| Write T3 issue: durable run / parked / `resume(run_id, answer)` | Seth (contract); Mateo (implement) | **Yes** | Helps (blocked ATS questions should park, not die) |
| T3 storage: new table vs existing blocker/preparation | Seth | **Yes** | Same |
| T4 split `workspace.tsx` | Seth (when); Mateo | **Yes** (sequence says so) | No |
| T5 vocabulary → Runtime + Tracker | Seth | **Yes** | No |
| T6: Runtime + Tracker are the real product, then delete `/plan` `/preferences` `/review` as primary routes | Seth | **Yes** (this *is* T6) | No |
| Named ATS adapter (host, fields, submit control) still under A, B, Inspect, one Submit | Seth — **not in T3–T6** | No | **Yes** — this is the missing product slice for live Apply now |
| Change A: Worker POSTs to employers | Seth, new contract, abuse/cost rewrite | No | Optional alternative to adapters-in-browser; currently **D** |
| Autopilot unattended send | Seth; blocked on [#111](https://github.com/SyberLabs/relay/issues/111) plus an explicit future contract | No | No; excluded |
| Chrome Web Store / Firefox | Seth | No | No |
| Revocable per-agent credentials | Seth, [#111](https://github.com/SyberLabs/relay/issues/111) | No | Needed for agent-first unattended mode, not for owner-session T2 |
| Ten real employer confirmations | Seth’s pilot; not a T-stage | No | Pilot evidence; ten fixtures are not ten applications |
| Voluntary return (#5) | Experiment owner on #5 | No | PMF; shipping T6 cannot claim it |

## Design consequences

- **Inspect remains the send UX.** One checkmark cannot mean both “these draft words are exact” and “submit at the employer.”
- **Receipts are operative-observed.** Relay does not scrape the ATS to confirm.
- **One execute permit.** Lost responses, captcha, and crashes go to `uncertain` / `not-submitted`, never a second `begin` while `executing`.
- **Public copy** may name the unpacked Chrome operative and must keep “Relay does not POST the employer form.” It must not claim a store listing, Autopilot, or a real ATS adapter until those ship.
- **CI:** the operative spec uses a separate persistent Chromium context and, in the full browser job, its own D1 so the 10 starts/owner/UTC day cap and empty-workspace tests stay honest. That is a test constraint, not a product cap change.

## Explicitly not this document

- Implementing Seth’s T2 grant-then-load P1.
- Opening T3–T6 issues (Seth should write T3’s contract before implementation).
- Authorizing a Greenhouse/Lever adapter, Worker POST, Durable Object, Browser Rendering, or paid models.
- Changing `docs/public-copy.json`.

## Sources

- [#168](https://github.com/SyberLabs/relay/issues/168) sequence and exclusions
- [#112](https://github.com/SyberLabs/relay/issues/112) comment: question clicks → delete busywork → simplify → measure → automate last; Seth owns scope
- [#128](https://github.com/SyberLabs/relay/pull/128) externally executed applications
- [agent-applications.md](../../agent-applications.md), [abuse-controls.md](../../abuse-controls.md)
- [inspect-accept-send design](2026-09-07-inspect-accept-send-design.md), [plant UI](2026-09-07-application-runtime-plant-design.md), [interaction stages](2026-09-07-interaction-stages-design.md)
- [#177](https://github.com/SyberLabs/relay/issues/177) / [PR #179](https://github.com/SyberLabs/relay/pull/179) (including Seth’s grant-then-load REQUEST_CHANGES)
