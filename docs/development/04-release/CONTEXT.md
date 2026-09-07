# 04 — Release or recover

Inputs: root contracts, abuse controls, delivery rules, [hosting and recovery](../../hosting.md), the current release request, immutable artifact identity, migration compatibility, actual required-check results, and live approval state. Read only the relevant deployment code and incident evidence in addition.

Use the existing release pipeline and production identity gateway. Verify provenance, exact commit, schema compatibility, staging evidence, and required peer production approval. Do not expose a development server or raw application as an alternate public entry point. Local success cannot verify deployed security bindings, account protections, provider costs, or CAPTCHA behavior.

Output: release/rollback evidence tied to the exact artifact and environment, observed smoke results, and unresolved operational risk. Keep credentials and private records out of logs and checkpoints. Record a failed or cancelled operation honestly and preserve recovery information.

Review boundary: production approval is separate from code review. Neither a numbered folder, a completed file, nor an agent's assertion can unlock deployment. Re-check actual authorization at the existing gate; do not add another approval layer.
