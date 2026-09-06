# Two-model fictional handoff pilot

Run date: September 5, 2026. This is a small drafting smoke test, not the twelve-case evaluation or a model ranking.

## Method

Used this folder's packet, evidence and checkpoint with the packet status set to Held. Requested `gpt-5.4-mini` and `gpt-5.5` through the installed, signed-in Codex CLI, reasoning effort low, read-only sandbox, ephemeral sessions, and a JSON schema requiring only a draft string. Each run started a fresh session. No tool calls appeared in the returned traces.

For each model, ran these conditions once, in this order:

- History: original evidence plus a fictional earlier suggestion of leadership and a 40% improvement, an explicit correction rejecting both, and an unrelated SAP role.
- Focused: original evidence alone.
- Checkpoint: original evidence plus the supplied checkpoint in a fresh session. This tests a supplied checkpoint, not native compaction or a real multi-model conversation transfer.

All conditions asked for a short application paragraph using only F1 and F2, without location eligibility, acceptance, submission or tool calls. The draft-only form of `assistantPrompt` supplied the common constraints. Browser result identity/version validation is tested separately; this trial does not test full result envelopes.

## Observed results

All six initial drafts used the two supported facts (contributing to the service and writing its integration tests). None claimed leadership, metrics, tenure, SAP experience, location eligibility, acceptance or submission. Manual inspection by the implementing agent was not blinded or independently scored.

One mini/checkpoint draft also included an internal explanation of omitted claims in its employer-facing paragraph. The prompt was amended to require only employer-facing wording, without review notes or explanations of omitted claims. One repeat of that condition produced a clean paragraph using both supported facts. The other five conditions were not rerun after that wording change.

Initial elapsed times, including CLI overhead, were approximately 6.2/6.1/6.3 seconds for mini and 7.4/6.1/8.3 seconds for 5.5, in history/focused/checkpoint order. The refined mini/checkpoint repeat took 7.4 seconds. These single observations do not establish a latency advantage. Prompt lengths were 4,182/3,782/5,017 characters before refinement; these are not token counts or cost savings. Provider usage included fixed CLI context and different cache hits, so this run cannot isolate context cost. Monetary cost was not measured.

## Decision and limits

Keep the integration small: let users select and edit one job's research and next drafting task in the existing ChatGPT/Codex prompt download. Preserve native import validation and human draft review. Do not choose a winning model, add automatic compaction, or enable autonomous submissions based on this pilot.

The full [evaluation plan](../../evaluations.md), repeated adversarial cases, independent review, native provider compaction, other providers and real-user usefulness remain unmeasured. Raw prompts, responses and CLI traces remain in ignored `private-data/context-pilot/`; only this fictional-data summary is published.
