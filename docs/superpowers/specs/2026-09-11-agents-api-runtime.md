# Agents API as Relay's durable cognitive runtime

**Issue:** [#183](https://github.com/SyberLabs/relay/issues/183) (child of [#168](https://github.com/SyberLabs/relay/issues/168))
**Date:** 2026-09-11
**Recorded by:** Mateo Robles
**Contract owner:** Seth Carlson
**Not approval.** This is the spike and architecture record. GitHub issues, [application coordination](../../agent-applications.md), and [abuse controls](../../abuse-controls.md) remain authoritative. This file is not public copy and does not enable live OpenAI in staging or production.

## Problem

Relay was about to build commodity agent lifecycle machinery: keep the invocation alive, park, `resume(run_id, answer)`, reconstruct prompts, recover after disconnect. OpenAI's Agents API (public beta, 2026-09-10) now owns sessions, orchestration, context compaction, waiting (`requires_action`), and recovery. Building a second copy of that inside Relay is the wrong object.

The user problem is unchanged: fewer human actions per submitted application, with exact acceptance and one permitted Submit. Product-market fit stays unvalidated until people return on their own ([#5](https://github.com/SyberLabs/relay/issues/5)).

## Decision

Relay is a **supervised action protocol and persistent application state layer**. OpenAI's Agents API is **one interchangeable cognitive runtime**. A constrained browser operative performs **effects**.

Do not make Relay an OpenAI product. Do not wrap the entire Agents API. Abstract only the operations Relay itself needs.

### Three systems

| System                | What it is                                                                                | Decision                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain / truth**    | Jobs, observations, candidate facts, accepted text, versions, receipts, application state | Keep. Product semantics.                                                                                                                     |
| **Agent runtime**     | Keep-alive, blocked questions, `resume()`, waiting, orchestration, context, recovery      | **Do not build.** Use the selected runtime's durable session + `requires_action`.                                                            |
| **Physical effector** | Logged-in ATS browser, named adapter, fill, one permitted Submit                          | Keep, and narrow T2 to a **local browser actuator**. Agents API does not possess Workday cookies, MFA, captcha, field identity, or receipts. |

### Keep versus replace

| Direction                                             | Decision                                                  | Why                                                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T0 blocked-answer                                     | Keep                                                      | Domain/UI correctness                                                                                                               |
| T1 verified reusable facts                            | Keep                                                      | Relay-owned truth. The agent may propose; it cannot verify.                                                                         |
| T2 browser operative                                  | Keep, narrow                                              | Physical session is not commoditized                                                                                                |
| T3 custom durable run / `resume(run_id, answer)`      | **Replace**                                               | Session + `requires_action` is that feature                                                                                         |
| T4 split workspace                                    | Keep                                                      | Ordinary cleanup                                                                                                                    |
| T5 Runtime + Tracker UX                               | Keep; ontology is Relay's, sessions are an implementation | Product names stay Relay's                                                                                                          |
| T6 retire heuristic gates                             | Keep                                                      | Agents API does not make legacy complexity valuable                                                                                 |
| `relay_wait_for_application` as general orchestration | Shrink                                                    | Durable waiting belongs to the agent runtime. Same-tab host waiting may remain.                                                     |
| Exact acceptance / digest / permit                    | Keep                                                      | Trust model                                                                                                                         |
| Receipts / uncertainty                                | Keep                                                      | Side-effect correctness. **Not-submitted requires affirmative evidence**; an ambiguous crash after possible Submit stays uncertain. |
| ATS adapters                                          | Keep                                                      | Provider-specific physical interface                                                                                                |
| Worker → ATS POST                                     | Still reject                                              | Agents API does not solve cookies, CSRF, captcha, or applicant identity                                                             |

### Requirement E (add to A/B/C)

PR [#182](https://github.com/SyberLabs/relay/pull/182) named A/B/C. This spike adds **E**. A/B/C remain correct: the Worker is not the applicant; extension-origin writes stay 403; fixture-only fill until a named ATS adapter.

| Id    | Choice                       | What it is                                                                                                                                               | What it is not                                                                                |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **E** | No commodity agent lifecycle | Relay does not implement durable sessions, waiting, recovery, context compaction, or turn orchestration when the selected runtime already supplies them. | “Relay has no runtime UI.” Parked questions and Inspect Accept remain Relay product surfaces. |

### T3 restated

**T3 — validate Agents API as Relay's durable runtime.** Prove:

1. Agents Session ↔ Relay `owner_id` ↔ `job_id`
2. `requires_action` ↔ blocked human question
3. Disconnect ↔ successful resume with the same `turn_id` and `call_id`
4. Relay remains canonical for verified facts
5. Human acceptance remains **outside** agent authority

If that holds, cancel the custom T3 implementation on #168.

## Architecture

```text
                    RELAY (control plane)
         ┌──────────────────────────────────┐
         │ jobs, facts, drafts,            │
         │ exact acceptance, manifests,     │
         │ permits, receipts, uncertainty    │
         └──────────────┬───────────────────┘
                        │ function tools
                        ▼
         ┌──────────────────────────────────┐
         │ AgentRuntime                     │
         │  start / sendInput / getState    │
         │  cancel / returnToolResult        │
         │  subscribe                        │
         │                                  │
         │  OpenAIAgentsRuntime (first)    │
         │  MemoryRuntime (CI / kill-switch │
         │    default)                      │
         │  later: Grok / Claude possible    │
         └──────────────┬───────────────────┘
                        │ plan / effect
                        ▼
         ┌──────────────────────────────────┐
         │ Browser operative (actuator)    │
         │ named ATS adapter, fill,       │
         │ one permitted Submit             │
         └──────────────┬───────────────────┘
                        ▼
                    Employer
```

OpenAI is not the database of truth. If the session “remembers” a fact, Relay does not care. Canonical reads go through Relay tools and return the current verified record.

OpenAI is not the authority that an application may be sent. The agent may request authorization. It cannot manufacture authorization, verify a fact, accept a draft, or `begin`.

### Capability allowlist

Registered tools only:

- `relay_read_job` — verified facts, job identity, missing fields. Immediate.
- `relay_request_answer` — park until a human answers. Writes **Proposed** facts. Does not verify.
- `relay_prepare_application` — validate, freeze digest in D1, park until human Accept.
- `relay_record_progress` — bounded progress note. Event-only: does not increment `jobs.version` or overwrite `jobs.blocker`. Cannot change acceptance or send.

Never registered: `verify_fact`, `accept_draft`, `authorize_send`, `approve`, `begin`, `complete`, `execute`.

Session binding: `session_id` ↔ `owner_id` ↔ `job_id`. The agent does not receive the user's Relay cookie. This is the OpenAI-path answer to [#111](https://github.com/SyberLabs/relay/issues/111). It does **not** solve Grok Bot or Claude interoperability. Those remain separate runtimes behind the same tiny interface.

### Parked flows

Missing fact:

```text
agent → relay_request_answer({ field_key, question })
     → session requires_action
     → Runtime UI: "Agent needs your answer"
     → human answers (remember:true still illegal)
     → Relay writes Proposed profile state
     → tool_result with the same turn_id and call_id
     → same agent continues
```

Send (safety stays; orchestration shrinks):

```text
agent → relay_prepare_application(payload)
     → Relay validates + freezes digest in D1
     → REQUIRES_ACTION
     → Runtime UI: Inspect / existing Accept & send
     → human Accept (existing applications route; arm still required for Accept)
     → one-use permit
     → browser operative Submit once
     → receipt / uncertain
     → Relay records outcome
     → tool_result (begin: false)
     → agent continues; it still cannot begin
```

`relay_wait_for_application` is no longer the durable wait. The operative may still use it for a **still-running** host that must catch Accept in the same invocation. A killed agent process resumes from the Session, not from a Relay-owned run table.

## Product decision (not a refactor)

Old Relay: the user provides intelligence (file/CLI/browser handoff). Relay does not pay to run a model.

Agents API: Relay would fund an intelligence runtime. Extra Agents API fee is $0 during beta; you pay model tokens, tools, and hosted sandbox usage. **US data residency only. No Zero Data Retention**, even with a self-hosted sandbox.

This spike **defaults off**. `RELAY_AGENTS=` or `off` refuses. `memory` is the in-process scripted runtime for tests and local proof (no upstream). `live` additionally requires `RELAY_AGENTS_LIVE=1` plus an `OPENAI_API_KEY` Worker secret. Production GitHub vars stay empty. Hosted sandbox is refused: environment type is `none` (function tools only).

Seth must accept cost, privacy, and provider dependence before `live` is set anywhere. This PR does not set it.

## Admission (abuse controls)

| Control            | Spike value                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Kill switch        | `RELAY_AGENTS` empty/`off`; `RELAY_PAUSE=all` still stops work                                                      |
| Live opt-in        | `RELAY_AGENTS=live` **and** `RELAY_AGENTS_LIVE=1`                                                                   |
| Model allowlist    | `gpt-6-astra` for live; `relay-memory` for memory                                                                   |
| Environment        | `none` only. No `openai_hosted`, no `self_hosted`                                                                   |
| Input              | 32,000 UTF-8 characters                                                                                             |
| Tools              | 4 named functions; arguments ≤ 16,000 bytes                                                                         |
| Output reservation | 50 USD cents maximum per live turn, reserved **before** fetch                                                       |
| Currency           | $1/user/UTC day, $10 global/day, $50 global/month; env may only lower                                               |
| Attempts           | GET retrieve: 3 attempts, 60s timeout. POST create/events: one attempt, no automatic replay                         |
| Settle             | After create/events, bounded GET retrieve (15 × 2s). No `stream: true`. No webhooks.                                |
| Concurrency        | 1 `queued`/`in_progress` turn per owner, claimed in the INSERT; unique active-owner index                           |
| Idempotency        | parked/idle start returns the existing session; tool results keyed by owner+turn_id+call_id                         |
| Storage            | 50 sessions and 500 tool-call rows per owner                                                                        |
| Retry              | Never refund. Uncertain retains the reservation and **does not** replay POST create/events. GET retrieve may retry. |
| Worker ATS POST    | Still absent. Fetch, if any, is only `https://api.openai.com/v1/agents/`                                            |

## Recovery doctrine

Matches OpenAI's function-tool guidance and Relay's execution doctrine:

- Retrieve the session (or Relay D1 row) after disconnect.
- Live turns do **not** stream. After `POST /v1/agents/sessions` or `/events`, Relay GETs the session until it is `requires_action` (with `required_actions`), `idle`, `cancelled`, or `failed`, then stops. The workspace 3s poll reads D1 only. `POST /api/agents` `sync` retrieves OpenAI once when D1 is still `queued`/`in_progress`.
- Pending work is `required_actions` / our `pending` rows, not a history `function_call` item alone.
- `environment_connection` is refused. Relay cancels that turn and fails the row. It does not connect a sandbox.
- If a side effect already ran, replay the **saved** `tool_result`.
- If execution might have succeeded but no result was saved, mark **uncertain** and do not retry.

## Spike measurement

Measure only:

1. Custom orchestration code not added (no Relay `resume(run_id, answer)` primitive).
2. User actions still required: answer, Inspect Accept, operative Submit.
3. Recovery: kill the control instance, answer later, same turn/call continues.
4. Exactly-once / uncertainty: freeze is idempotent; uncertain does not re-freeze; `begin` count stays 0 until the operative path; OpenAI state cannot authorize Submit.

## Out of scope

T2 grant-then-load on [#179](https://github.com/SyberLabs/relay/pull/179). T4–T6. Real ATS adapters. Worker POST. Autopilot. Chrome store. Wrapping the whole OpenAI API. Hosted sandbox. Enabling `live` in staging/production. Paying OpenAI in CI. Merging #179 or #182. Webhooks. Streaming. Subagents. MCP on the OpenAI session.

## Sources

- [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview) — sessions, orchestration, context, recovery; US residency; no ZDR
- [Sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions) — turns, `environment.type: "none"` requires initial input, cancel, continue
- [Manage sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions/manage) — `required_actions`
- [Functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions) — `requires_action`, same `turn_id`/`call_id`, disconnect recovery, durable side-effect storage
- [Architecture](https://developers.openai.com/api/docs/guides/agents-api/architecture) — `environment.type: "none"` for function-tools-only; no sandbox
- Header: `OpenAI-Beta: agents=v1`; `POST https://api.openai.com/v1/agents/sessions`
- [abuse-controls.md](../../abuse-controls.md), [agent-applications.md](../../agent-applications.md), [#182](https://github.com/SyberLabs/relay/pull/182)
