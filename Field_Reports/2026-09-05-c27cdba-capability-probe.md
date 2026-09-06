---
title: Relay capability probe
relay_commit: c27cdba79d69a209752bc43eb5c8baff0f36ad96
relay_commit_short: c27cdba
date_pt: 2026-09-05
mission: FM-RELAY-PROBE-1
author: Firstmate field probe
---

# Relay Field Report — capability probe

**Version:** `c27cdba` (`c27cdba79d69a209752bc43eb5c8baff0f36ad96`) — origin/main at probe time  
**Date:** 2026-09-05 America/Los_Angeles  
**Mission:** FM-RELAY-PROBE-1 (maximum usability / capabilities vs limits)

**Commit:** `c27cdba` = origin/main
**Tree:** `/workspace/relay-src`
**Local:** Vite http://localhost:3000/ (Sites cookie)
**Date:** 2026-09-05 PT (final)
**Rule:** no Submit; no Hunt PII; fictional citation facts only.

## Checklist A–G (tonight)

| Item | Result |
|------|--------|
| A Ready mill | **Done** doors 73–80 prior + **81–85 tonight** (5/5 Ready artifacts). NISC 68 + ENFOS also Ready. |
| B New surfaces | **Done** HTML+API profile/preferences/plan/review/track; hydrated review/track UI. |
| C CLI #57 | **Done** via `integrations/relay.mjs` (not bare `cli.mjs`). Citation refuse + happy path. |
| D Auth | **Done** cookie required on Vite; header-only 401; Ready flows need cookie or CLI login. |
| E Claude | **Blocked** model key env empty; `relay draft` exit 1. |
| F Browser UI E2E | **Done** ENFOS Held→draft→Accept→Ready. Proof PNG. |
| G Session/origin | **Done** page-session tests 47/47; evil Origin 403 keep-alive. |

Artifacts:
- Companion in this folder: `2026-09-05-c27cdba-ui-ready-proof.png` (ENFOS UI Accept → Ready)
- Probe VM only (not committed): Ready JSONs, review screenshot, detailed notes

---

## Capabilities proven

### Core apply-prep loop (Held → draft → Accept → Ready)
- **UI path:** ENFOS Held → short draft → Accept exact draft → Ready. No Submit. Proof: `2026-09-05-c27cdba-ui-ready-proof.png`.
- **API path:** NISC + mill doors through 85 → Ready via cookie import/save. Artifacts on box.
- Track B mill **81–85** Ready tonight (Waymo Behavior, HP IQ AML, HP IQ Connectivity, Zipline Spring, Zipline Validation).

### Auth (Vite / Sites local)
- Cookie via `/signin-with-chatgpt` → workspace APIs 200. **Required for Ready flows on Vite.**
- OAI auth headers alone (no cookie) → 401.
- Evil Origin POST → 403; TCP keep-alive reusable. Prefer `localhost` over `127.0.0.1` (`::1`).
- CLI `relay.mjs login` persists Sites cookie to `private-data/.session`.

### New surfaces
- HTML `/profile` `/preferences` `/plan` `/review` `/track` → 200; review/track **hydrated** (Probation due; Ready/no-receipt track rows).
- GET `/api/profile` `/preferences` `/plan` `/drafts` `/outcomes` → 200.
- Profile extract/propose/verify (tags: metric|role|credential|detail) → 200; usable facts work.
- Preferences `{action:minutes}` write/restore → 200; bare `{minutes}` → 400; Plan POST → 405.
- Outcomes GET shape proven; `record` not exercised (would mutate rates).
- Session expiry unit tests: 47/47 pass.
- Origin drain (#55): app drains body; live Vite 403 is Sites plain Forbidden.

### CLI (`integrations/relay.mjs`)
- Works: login, status, plan, brief --json, log --cite (matching verified claim).
- Fails: unsupported claim → exit 3; `draft` → exit 1 without model env; bare `cli.mjs` has no main.

---

## Hard limitations

1. Claude draft path blocked — model key env empty; `relay draft` exits 1. AI draft E2E never exercised.
2. No autonomous hunt / Submit — by design; Ready is not applied. Hunt is the apply rail.
3. Vite auth is not Workers header mock — cookie / CLI login required locally for Ready.
4. Closed fact tags — unknown tag returns 400; claim must match cited fact or CLI exit 3.
5. Schema ceiling — no drizzle past 0004 on this tree.
6. Preference pairwise pair stays null when Held pool empty — calibration idle after mill drains Held to Ready.

---

## Partial / flaky

- IPv4 loopback often refused when Vite listens on IPv6 only.
- Absolute node / inline package installs often blocked on this box; PATH + boot scripts work.
- Outcomes record / rates untested by design (no Submit).
- Origin forbid body shape varies (Sites plain vs app JSON); both refuse.
- Mill re-import of known doors returns known/Ready without re-Held — fine for artifact refresh.

---

## Highest-leverage next fix (Seth / Relay Eng)

Unblock model draft for local probe: local-dev path for model credentials env + RELAY_CLAUDE_MODEL (or stub draft provider) so draft then review is E2E without paste. Citation CLI and Accept-UI already proven; missing middle is AI generation.

Runner-up: README Sites/Vite note — cookie required locally; header mock Workers-only; prefer localhost.

---

## Hunt overlap (unchanged)

- Relay = research + draft review + history + Notion/Claude/Grok handoffs.
- Hunt = apply rail.
- Best contribution: Quill answer-bank to scrubbed reusable templates (schema/spine), not raw private answers.

---

## Ask of Firstmate

1. Provision model credentials on box for Claude draft follow-on?
2. Want Relay Eng PR for README/auth note or stub draft provider?
3. Next mill doors only when Berth names past 85 — otherwise idle.
