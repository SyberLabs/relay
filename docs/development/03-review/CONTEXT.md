# 03 — Review

Inputs: current diff and base/head identities, root contracts, abuse controls, delivery rules, [threat model](../../threat-model.md), acceptance criteria, affected callers/tests, and prior actionable findings. Summaries and the implementer's claimed results are evidence to check against the current code.

Start with unnecessary scope, then concrete correctness, security, data preservation, and operational defects. Follow a trigger through the changed code to its consequence. For later pushes inspect the delta and unresolved findings; expand to full paths when needed. Do not load the entire conversation, unrelated architecture research, or every review skill.

Output: actionable findings with a narrow location, trigger, consequence, and fix; or a clear statement of no findings plus validation limits. Verify the current head before posting externally and follow the user's communication authorization. Do not run untrusted PR code with secrets. Agent feedback is advisory.

Review boundary: the other maintainer reviews and approves the latest changes under the existing GitHub rules. Never approve your own work or represent this stage's output as human approval. Failed checks remain failures until resolved.
