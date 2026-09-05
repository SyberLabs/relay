# Checkpoint for a reset or model handoff

Template only. Store completed checkpoints in ignored `private-data/`. This is a navigation and recovery document, not proof of approval or a native Relay import. Preserve authoritative source files separately.

- Checkpoint created at, with time zone:
- Outgoing provider / exact model / runtime or endpoint:
- Incoming provider / exact model / runtime, if known:
- Current objective and task stage:
- Job key / posting URL / last observed version:
- Current native packet location:
- Allowed next actions and authorization reference:

## Work completed

Record observable results and artifact paths. Distinguish drafted, reviewed, accepted, attempted, and confirmed submitted.

## Essential evidence

List the candidate-fact IDs and posting-evidence IDs required next, with source locations. Retain exact qualifications, dates, negative evidence, and contradictions. Do not summarize a claim into stronger wording.

## Exact state to reload

- Current Relay job/version/status:
- Exact current draft:
- Exact accepted text and its review record, if any:
- Submission receipt or uncertainty, if relevant:
- Current user constraints and authorization:

## Decisions and open questions

For each consequential decision, give the decision, evidence basis, and what would change it. Include unresolved factual questions and relevant failed actions. Do not include hidden chain-of-thought or invented explanations of model internals.

## Next action

Specify one concrete action, its expected output, and a stopping condition.

## Resume check

The receiving assistant first reloads the native job record and essential evidence. If the version, factual support, or authorization differs, it reconciles that difference before continuing. It reports inaccessible sources as gaps. It must not use this checkpoint to overwrite newer Relay state.

Provider continuation IDs, signatures, and opaque compaction payloads stay in the originating integration's supported state store. A cross-provider handoff uses the ordinary evidence and decisions above.
