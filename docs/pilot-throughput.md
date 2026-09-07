# Pilot: application throughput and reuse

Owner: Seth. Research partner: Mateo. Positioning correction tracked in [#90](https://github.com/SyberLabs/relay/issues/90).

Relay's product goal is to reduce repeated preparation and retrieval work across applications. One job is the unit of context and exact acceptance, not a limit on how many applications a person can manage. More jobs imported or buttons clicked does not establish more useful applications completed. No time saving, hiring improvement, or application-volume gain has been demonstrated yet.

## Keep the experiment intact

This is an exploratory supplement to [issue #5](https://github.com/SyberLabs/relay/issues/5) and the reviewed [protocol v1 measurement definitions](https://github.com/SyberLabs/relay/blob/67cbb6cad6094079e9483a7290aa4ca449416324/docs/pilot/measurement.md) in [PR #80](https://github.com/SyberLabs/relay/pull/80). It does not replace those documents or their acceptance criteria.

Preserve the fixed five-person cohort, at least 3/5 independent core completions, and at least 2/5 voluntary different real handoffs during `(initial session end, initial session end + 336 hours]`. Missing measurements and incomplete windows remain unresolved. Do not reset a participant's window for a new build or another exercise. Inviting someone to perform a second job is prompted work, never voluntary retention. Record that contact and apply protocol v1's reminder exclusions to subsequent activity. Do not change a completed session's end time to accommodate this supplement.

## First observe existing work

Confirm the participant's build, tools, task and assistance; do not infer these from the current release. Ask them to show what happened after jobs were added and whether any output was used. If they used agents to add jobs, establish whether those agents used the UI, imports, APIs or direct file/database edits, and whether that was their normal approach or a workaround. Normal self-directed assistant use is allowed under protocol v1; developer help is recorded separately. Praise is not completion or payment evidence.

For a first real task, observe entry/import, context preparation, actual external-assistant transfer, returned wording, review, persisted exact acceptance and retrieval for the participant's intended destination. Record help, retries, confusion and any blocked stage. Application submission remains the user's action and is not required for core completion.

## Optional second-job comparison

Offer a separate, explicitly prompted exercise only if the participant has a different real job and time to try it. If not, leave the comparison unmeasured. Ask what they can carry forward and what must change, without demonstrating a preferred answer first.

Record privately for each task:

- Tested build, task purpose, assistant/tools and whether observations are measured or recalled.
- Setup time, active time by stage (entry, context, transfer, review, acceptance/retrieval), and waiting time separately.
- Facts, research or wording reused; repeated typing, copying, searching and corrections still required.
- Comparable baseline active minutes using their usual tools; unknown or dissimilar work is not a valid baseline.
- Completion, output usefulness for the intended destination, errors and assistance.

Effort saved is comparable baseline active minutes minus Relay active minutes. Include handoff overhead and corrections. The first-to-second task difference alone is not a causal estimate: task difficulty, familiarity and assistance can differ. Report setup separately without hiding it from the total. Two tasks do not establish sustainable applications per hour or hiring outcomes.

## Capability and release boundaries

Users can add individual postings, import multiple tracker rows and access experimental agent batch review under Advanced. These operations do not send applications or accept drafts in bulk. The browser handoff still uses a separate unsaved facts box, not automatic selection from the saved profile. Measure that repeated effort rather than claiming it is eliminated. Existing active-job follow-up acceptance limitations remain as defined in protocol v1; do not reset application status to force completion.

Throughput is a product goal, not permission to increase traffic or remove review. Preserve [abuse controls](abuse-controls.md), quotas, bounded inputs/storage/work, CAPTCHA, fail-closed behavior, exact acceptance and owner isolation. No new background or paid upstream operation is authorized by this positioning change.

Choose the next task from the observed repeated bottleneck: unclear action results, duplicated context entry, retrieval friction or another demonstrated cost. Do not build bulk sending, add integrations or redesign every page simply to match the new wording. Keep the planned voluntary-return and switching/payment decision separate from this usability comparison. Store participant records outside Git; publish only consented, anonymized findings.
