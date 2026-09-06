# Context management for Relay

Research checked: **September 5, 2026**. Status: **research and proposed operating practices; no new runtime features enabled**.

Give each model the evidence and current state needed for one job task. Keep the durable record in Relay and selected source files. Rebuild the context when the task, model, or job version changes.

“Optimal” means the smallest sufficient context that preserves factual accuracy, job identity, review state, and useful evidence at acceptable cost and speed. No public benchmark establishes one optimal prompt, model, or context size for this workflow. The recommendations below are hypotheses to validate against Relay work.

## Start here

For the first trial, choose one fictional opportunity. Download its current Relay packet, fill in the [task-context template](templates/task-context.md), and ask one assistant for a reviewable draft. Switch assistants using the [checkpoint template](templates/checkpoint.md). Check whether the second assistant preserves the facts, uncertainties, job version, and next action without repeating the research.

A [ready-to-use fictional exercise](examples/fictional-handoff/README.md) includes a native packet, original fixture evidence, a sample draft, and a completed checkpoint. Its local file-adapter checks passed; a two-model quality comparison has not yet been run.

## Contents

- [Research findings](research.md): production lessons, recent changes, disagreements, and experimental work.
- [Model playbooks](model-playbooks.md): OpenAI, Claude, Gemini, Grok, and local/open-weight models, with API-specific differences.
- [Workflow](workflow.md): research → assessment → drafting → review → application tracking → interview and follow-up.
- [Task-context template](templates/task-context.md): a portable companion to the existing Relay packet.
- [Checkpoint template](templates/checkpoint.md): resume work after a reset, compaction, or provider change.
- [Evaluation plan](evaluations.md): compare approaches using the same cases and explicit failure criteria.
- [Source register](sources.md): 21 primary sources, their dates where established, and their limits.

## The decisions this folder recommends

1. Use one opportunity and one task stage per active work packet. Cross-job comparisons get a separate, explicit comparison packet.
2. Preserve original evidence and exact accepted drafts. Summaries help navigate; they do not replace either.
3. Re-read Relay's current job/version before importing work or proposing a status change.
4. Pass ordinary facts, evidence references, unresolved questions, and decisions between models. Keep provider-specific continuation objects inside their original integration.
5. Use a single owner for changes to each job. Parallel research can return evidence; workers should not independently change the same record.
6. Start with file handoffs and focused retrieval. Add caching, compaction, or more agents only when a measured problem justifies them.

These are Relay design recommendations, informed by the sources, not claims that Relay already implements every rule.

## Existing Relay boundaries

The inspected checkout already documents job/version validation, research history, exact-text acceptance, and command/file handoffs. The current Claude connector makes a single draft request; it does not implement the long-running context strategies described here. Its packet has `schema`, `job`, `facts`, and `draft`; `job.key`, `job.version`, and `job.url` are validated. A nonempty `facts` string is required, but the validator cannot establish its truth. See [connector code](../integrations/connectors.mjs), [integration guide](../integrations/README.md), [Grok Bot handoff](../integrations/GROK_BOT.md), and [data model](../db/schema.ts).

The templates in this folder are **manual companion documents, not new import schemas**. Continue using the existing Relay export/import format. Real candidate facts, packets, source snapshots, and evaluation outputs belong in ignored `private-data/`, not this research folder. No applications, messages, or external publication are authorized by these documents.

## Keep the research current

Before implementing a provider feature, re-open its official documentation and check the exact model, endpoint, software development kit version, account access, pricing, and data handling. Record the check date in the evaluation result. Revisit the playbooks after a model change or observed failure; retain superseded decisions with the reason for changing them. No automatic research monitor is configured.
