# Local validation record

Checked September 5, 2026 with Node 24.19.0 against Relay base `2372771` plus this context-management addition. No application source, database migration, or dependency was changed.

## Executed

- Ran the documented `grok-draft` command with the supplied fictional packet and sample paragraph. It wrote a `relay.draft.v1` output into ignored `private-data/`.
- Compared the result's job object with the original packet: exact match.
- Confirmed `reviewRequired` was true.
- Passed the result to Relay's existing `draftFromResult` with the matching job/version: returned the exact sample text.
- Passed the same result with current version 5 instead of 4: rejected.
- Passed the same result with another job key: rejected.
- Repeated the command against the existing output: rejected with `EEXIST`; the original output's SHA-256 hash was unchanged.
- Ran the repository's existing domain, connector, import, editor, and Obsidian tests: **47 passed, 0 failed**. These include exact-text acceptance and status preservation checks.

## Limits

The paragraph is manually authored fixture text. No Grok, Claude, Gemini, OpenAI, or local-model inference was performed. No live browser, employer account, application submission, or database import was exercised by the example. Passing these checks proves local file compatibility and selected existing protections; it does not establish model accuracy or completion of the twelve-case model evaluation plan.

## Next unmeasured step

Run the two-session exercise with the chosen assistants and retain their actual outputs, exact model names, corrections, and available time/cost telemetry. The fixture is ready for that comparison; do not label this local check a model benchmark.
