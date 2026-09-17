# Supervised runtime: send-path choices and T-stage status

**Issue:** [#168](https://github.com/SyberLabs/relay/issues/168)
**Date:** 2026-09-11
**Recorded by:** Mateo Robles
**Contract owner:** Seth Carlson
**Not approval.** This is a product/design record of choices already in force. GitHub issues and [application coordination](../../agent-applications.md) remain authoritative. Do not treat this file as a new send contract, a public-copy source, or permission to reopen T0–T6.

## Problem

The destination is a **supervised application runtime**: an agent fills an employer form; a human authorizes send. People read three different “do not POST” rules as one sentence, then conclude Relay refuses to apply. Those rules are not the same. Mixing them makes T2 look pointless and hides the actual next product call.

User problem [#168](https://github.com/SyberLabs/relay/issues/168) names: fewer human actions per submitted application. The plant is about 15–25 clicks; the mock is about 3. Product-market fit stays unvalidated until people return on their own ([#5](https://github.com/SyberLabs/relay/issues/5)).

## Decision

Keep **A**, **B**, and **C** as separate named requirements. Do not collapse them. Do not treat **D** as implied by A–C.

| Id              | Choice                   | What it is                                                                                                                                                                                  | What it is not                                                                                                                                           |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**           | No Relay POST            | The Cloudflare Worker is not an HTTP client to the employer. Submit is a click in a browser that already has the ATS session.                                                               | “Relay does not apply.” The operative **does** apply.                                                                                                    |
| **B**           | Extension mailbox        | `/api/applications` and `/api/workspace` run from a signed-in Relay-origin page (`credentials: 'same-origin'`). `chrome-extension://` mutations stay 403. No `chrome.cookies`.              | A ban on filling forms.                                                                                                                                  |
| **C**           | T2 fixture-only fill     | Until a named ATS adapter exists, the first-party extension writes only a fictional fixture (including the **Submit fictional application** control). A live **Apply now** page is refused. | The same rule as A. Fixture-only is a T2 slice so optional `https://*/*` cannot type into a random live form.                                            |
| **D (deleted)** | Worker-hosted applicator | Store employer cookies or ATS API keys on Relay and POST from the Worker.                                                                                                                   | Not authorized. [#112](https://github.com/SyberLabs/relay/issues/112) called this a **new** contract, not implied by draft acceptance or Inspect Accept. |

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

| Surface                                  | Role                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| Workspace Inspect                        | Human send authorization for one armed digest             |
| `/apply` overlay                         | Operative summary only; no Accept                         |
| First-party MV3 (`extensions/operative`) | Recommended T2 execution surface; mailbox + isolated fill |
| `window.relay` / WebMCP                  | Same-tab hosts that cannot load the extension             |
| Employer page                            | The only HTTP POST of the application form                |

## Requirement owners

Elon’s rule: a requirement has a **person’s name**, not a department. Question it; do not inherit it from “security” or `AGENTS.md` as a bureau.

| Requirement                                                       | Named owner                                                         | Source                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Worker does not POST the employer form                        | Seth Carlson                                                        | [agent-applications.md](../../agent-applications.md) (Owner: Seth); [#112](https://github.com/SyberLabs/relay/issues/112); [#128](https://github.com/SyberLabs/relay/pull/128); [abuse-controls.md](../../abuse-controls.md); public copy |
| B — no `chrome-extension://` Relay mutations, no `chrome.cookies` | Seth Carlson                                                        | [#177](https://github.com/SyberLabs/relay/issues/177); `lib/request-origin.ts`                                                                                                                                                            |
| C — T2 fixture-only fill                                          | Seth Carlson                                                        | [#177](https://github.com/SyberLabs/relay/issues/177) owner; fill inspects destination + **Submit fictional application**                                                                                                                 |
| Inspect Accept is send permission; draft Ready is not             | Seth Carlson                                                        | [#135](https://github.com/SyberLabs/relay/issues/135); [inspect-accept-send design](2026-09-07-inspect-accept-send-design.md)                                                                                                             |
| T0–T6 sequence                                                    | Seth Carlson (program); Mateo Robles (implementer)                  | [#168](https://github.com/SyberLabs/relay/issues/168)                                                                                                                                                                                     |
| Peer merge / production approval                                  | The other maintainer; production is a separate environment approval | [delivery.md](../../delivery.md)                                                                                                                                                                                                          |

`docs/PUBLIC-COPY.md` labels Mateo as Product and Seth as lead engineer. [delivery.md](../../delivery.md) says Seth owns product decisions. For **A–C**, the paper trail is Seth’s. Mateo can question them; changing them is a Seth scope change.

Seth’s order on #112: question required clicks → delete packet/UI busywork → simplify onto existing state → measure → automate only the loop that already works. Worker→ATS POST is step 5 on a loop that does not exist (no ATS session in Relay; [#111](https://github.com/SyberLabs/relay/issues/111) still open).

## T-stage status (2026-09-17)

Program home: [#168](https://github.com/SyberLabs/relay/issues/168) (closed 2026-09-17; 7/7 children). T0–T6 are on `main`. T6 is the last line of **this** program and is not a named ATS adapter.

| Stage  | Intent (user-visible)                                                                                                                                                                          | Issue / PR                                                                                                     | State                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T0** | Answering a blocked question in the plant works. No illegal `remember:true` on `choice:'answer'`. Job notes stay on the job.                                                                   | [#169](https://github.com/SyberLabs/relay/issues/169) / [#170](https://github.com/SyberLabs/relay/pull/170)    | **On main**                                                                                                                                                                                                                                                                                                                           |
| **T1** | A reusable blocked answer may propose an owner-scoped `profile_facts` row with a `field_key`. Human verification still required before drafts use it. Job-only wording does not create a fact. | [#172](https://github.com/SyberLabs/relay/issues/172) / [#173](https://github.com/SyberLabs/relay/pull/173)    | **On main**                                                                                                                                                                                                                                                                                                                           |
| **T2** | Unpacked Chrome MV3 operative runs the Inspect handshake on a **fictional fixture**.                                                                                                           | [#177](https://github.com/SyberLabs/relay/issues/177) / [#179](https://github.com/SyberLabs/relay/pull/179)    | **On main.** Packed host permissions stay localhost. Fixture-only fill until a named ATS adapter exists.                                                                                                                                                                                                                              |
| **T3** | Agents API is the cognitive runtime behind Relay’s supervised action protocol. `memory` is the default; `live` stays off. The agent cannot verify facts, accept drafts, authorize send, or `begin`. | [#183](https://github.com/SyberLabs/relay/issues/183) / [#184](https://github.com/SyberLabs/relay/pull/184)    | **On main.** Custom durable `resume(run_id)` was not built; OpenAI session + `requires_action` is the parked-question path. Production vars stay empty.                                                                                                                                                                               |
| **T4** | Split remaining `app/workspace.tsx` into a Runtime hook plus views. Same behavior, no new surface.                                                                                             | [#195](https://github.com/SyberLabs/relay/issues/195) / [#198](https://github.com/SyberLabs/relay/pull/198)    | **On main**                                                                                                                                                                                                                                                                                                                           |
| **T5** | Collapse plant copy onto the two-screen model: **Runtime** (`/`) and **Tracker** (`/track`). Applications/facts/Advanced are secondary.                                                        | [#196](https://github.com/SyberLabs/relay/issues/196) / [#199](https://github.com/SyberLabs/relay/pull/199)    | **On main**                                                                                                                                                                                                                                                                                                                           |
| **T6** | Stop using heuristic fact-overlap as pick/gate copy. Fold `/plan`, `/preferences`, and `/review` under Advanced; keep the APIs; bookmarks redirect.                                            | [#197](https://github.com/SyberLabs/relay/issues/197) / [#200](https://github.com/SyberLabs/relay/pull/200)    | **On main** (`7688457`, 2026-09-17). Overlap is research-only (`whyPicked`, Posting comparison) and is not an Accept gate. T6 is not “we apply to Greenhouse.”                                                                                                                                                                         |

**Immediate next:** keep current-facing docs on this product ([#201](https://github.com/SyberLabs/relay/issues/201)). Remaining send-path work is a **named ATS adapter** (host, fields, submit control) still under A, B, Inspect Accept, and one Submit — a new Seth-owned issue, not a T-stage. Do not self-approve. Do not enable `live`. Do not Worker-POST ATS. Do not promote production. Do not start Autopilot ([#112](https://github.com/SyberLabs/relay/issues/112)). Shipping T6 does not close product-market fit ([#5](https://github.com/SyberLabs/relay/issues/5)). GitHub closed [#174](https://github.com/SyberLabs/relay/issues/174) as completed via T5 [#199](https://github.com/SyberLabs/relay/pull/199); that is not one-step live send, and this file does not reopen #174.

**After this program:** Windows App Control vs Playwright persistent Chromium is [#194](https://github.com/SyberLabs/relay/issues/194). Hosting/first deployment is [#3](https://github.com/SyberLabs/relay/issues/3). Authenticated ChatGPT/Grok agent path is [#111](https://github.com/SyberLabs/relay/issues/111) / [#117](https://github.com/SyberLabs/relay/issues/117) / [#144](https://github.com/SyberLabs/relay/issues/144). Greenhouse reCAPTCHA is adapter-adjacent ([#142](https://github.com/SyberLabs/relay/issues/142)).

## Decisions that finished T6, and what still is not a T-stage

T6 is finished as the last line of **this** program. That does not, by itself, ship a real ATS adapter. The table is the named decision record so we do not pretend T6 is “done applying.”

| Decision                                                                                                   | Owner                                                                                                   | Needed to finish T6?                                 | Needed for a real employer Submit?                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Merge T2 after every live #179 finding                                                                     | Seth (approve); Mateo (implement the four blockers)                                                     | Done (on main)                                       | Yes, as the hands; still fixture until an adapter exists         |
| Write T3 issue: durable run / parked / `resume(run_id, answer)`                                            | Seth (contract); Mateo (implement)                                                                      | Replaced by Agents API #183 / #184                   | Helps (blocked questions park on `requires_action`)              |
| T3 storage: new table vs existing blocker/preparation                                                      | Seth                                                                                                    | Agents session + D1 digest/permit/receipt            | Same                                                             |
| T4 split `workspace.tsx`                                                                                   | Seth (when); Mateo                                                                                      | **Done**; #195 / #198                                | No                                                               |
| T5 vocabulary → Runtime + Tracker                                                                          | Seth                                                                                                    | **Done**; #196 / #199                                | No                                                               |
| T6: Runtime + Tracker are the real product, then delete `/plan` `/preferences` `/review` as primary routes | Seth                                                                                                    | **Done** (this _was_ T6); #197 / #200            | No                                                               |
| Named ATS adapter (host, fields, submit control) still under A, B, Inspect, one Submit                     | Seth — **not in T3–T6**                                                                                 | No                                                   | **Yes** — this is the missing product slice for live Apply now   |
| Change A: Worker POSTs to employers                                                                        | Seth, new contract, abuse/cost rewrite                                                                  | No                                                   | Optional alternative to adapters-in-browser; currently **D**     |
| Autopilot unattended send                                                                                  | Seth; blocked on [#111](https://github.com/SyberLabs/relay/issues/111) plus an explicit future contract | No                                                   | No; excluded                                                     |
| Chrome Web Store / Firefox                                                                                 | Seth                                                                                                    | No                                                   | No                                                               |
| Revocable per-agent credentials                                                                            | Seth, [#111](https://github.com/SyberLabs/relay/issues/111)                                             | No                                                   | Needed for agent-first unattended mode, not for owner-session T2 |
| Ten real employer confirmations                                                                            | Seth’s pilot; not a T-stage                                                                             | No                                                   | Pilot evidence; ten fixtures are not ten applications            |
| Voluntary return (#5)                                                                                      | Experiment owner on #5                                                                                  | No                                                   | PMF; shipping T6 cannot claim it                                 |

## Design consequences

- **Inspect remains the send UX.** One checkmark cannot mean both “these draft words are exact” and “submit at the employer.”
- **Receipts are operative-observed.** Relay does not scrape the ATS to confirm.
- **One execute permit.** `executing` is never permission to submit again. **Not-submitted requires affirmative evidence that no send occurred.** A lost response, crash, tab closure, or failed receipt read after Submit may have begun stays **uncertain**. `lib/application-automation.ts` excludes `not-submitted` from the prior-start block, so recording `not-submitted` without that evidence can issue another permit. Do not group those outcomes.
- **Public copy** may name the unpacked Chrome operative and must keep “Relay does not POST the employer form.” It must not claim a store listing, Autopilot, or a real ATS adapter until those ship.
- **CI:** the operative spec uses a separate persistent Chromium context and, in the full browser job, its own D1 so the 10 starts/owner/UTC day cap and empty-workspace tests stay honest. That is a test constraint, not a product cap change.

## Explicitly not this document

- Re-opening merged T0–T6 issues or PRs as if the program were still in flight.
- Treating T6 as a Greenhouse/Lever adapter, Worker POST, Durable Object, Browser Rendering, or paid models.
- Changing `docs/public-copy.json` for the Advanced fold (public capabilities are unchanged).
- Enabling `live`, promoting production, starting Autopilot (#112), or reopening #174 without Seth. #5 and #194 stay open.

## Sources

- [#168](https://github.com/SyberLabs/relay/issues/168) sequence and exclusions
- [#112](https://github.com/SyberLabs/relay/issues/112) comment: question clicks → delete busywork → simplify → measure → automate last; Seth owns scope
- [#128](https://github.com/SyberLabs/relay/pull/128) externally executed applications
- [agent-applications.md](../../agent-applications.md), [abuse-controls.md](../../abuse-controls.md)
- [inspect-accept-send design](2026-09-07-inspect-accept-send-design.md), [plant UI](2026-09-07-application-runtime-plant-design.md), [interaction stages](2026-09-07-interaction-stages-design.md)
- [#177](https://github.com/SyberLabs/relay/issues/177) / [PR #179](https://github.com/SyberLabs/relay/pull/179) (merged; fixture-only operative)
- [#183](https://github.com/SyberLabs/relay/issues/183) / [PR #184](https://github.com/SyberLabs/relay/pull/184) (Agents API memory runtime; `live` off)
- [#195](https://github.com/SyberLabs/relay/issues/195) / [#196](https://github.com/SyberLabs/relay/issues/196) / [#197](https://github.com/SyberLabs/relay/issues/197) (T4–T6 children)
- [#198](https://github.com/SyberLabs/relay/pull/198) / [#199](https://github.com/SyberLabs/relay/pull/199) / [#200](https://github.com/SyberLabs/relay/pull/200) (T4–T6 on main)
- [#201](https://github.com/SyberLabs/relay/issues/201) (current-facing docs vs shipped Runtime / Tracker / Advanced fold)
