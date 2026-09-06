---
relay_commit: c27cdba79d69a209752bc43eb5c8baff0f36ad96
relay_commit_short: c27cdba
date_pt: 2026-09-05
mission: FM-RELAY-PROBE-1
author: Firstmate field probe
---

# Relay probe delta — doors 81–85 window

Timestamp: 2026-09-05 23:52 PDT · commit `c27cdba`

## Newly proven
- `/review` hydrated UI: **Review due: New cluster**, **2** unreviewed drafts, `general` **Probation**; screenshot `2026-09-05-c27cdba-probe-review.png`
- `/track` hydrated UI: Live applications with **Ready / no receipt** rows + **Record submission** CTAs (not used); NISC shows fictional citation defend-sheet
- Outcomes GET shape: `{outcomes:[], prep:[9 Ready…], rates:{}}` — GET-only; no `record`
- Preferences: `pair:null`, weights all 0, `pool:0`; `POST {action:"minutes", minutes}` works; bare `{minutes}` → 400; minutes **90→restore 120**
- Profile: **usable=1**, facts **2** (1 Verified / 1 Proposed), version **4**, rules **0**
- Claude `relay.mjs draft`: still exit **1** — `Set ANTHROPIC_API_KEY and RELAY_CLAUDE_MODEL.`

## Still blocked
- Claude/Anthropic draft generation (`ANTHROPIC_API_KEY` empty)
- Outcomes loop / rates (nothing submitted; no `record` by design)
- Preference pairwise calibration (`pair` null while Held pool empty)

## Nothing new (already proven; not re-litigated)
- Cookie auth / header-only 401 / evil Origin 403
- Page/API 200 matrix for profile·preferences·plan·review·track + drafts
- CLI login/status/plan/brief; citation refuse exit 3; citation happy path
- ENFOS Accept→Ready; NISC Ready artifact
