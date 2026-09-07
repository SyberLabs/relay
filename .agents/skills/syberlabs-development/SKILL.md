---
name: syberlabs-development
description: Use scoped context and verifiable checkpoints when developing SyberLabs repositories, especially Relay. Applies to planning, implementation, review, and release work for SyberLabs; not job-search drafting or unrelated projects.
---

# SyberLabs development

Confirm the repository from the task or its Git remote. Read its current `AGENTS.md` and applicable nested instructions. Repository contracts remain authoritative; user instructions take precedence over this workflow.

If the repository has `docs/development/CONTEXT.md`, use that router and only the current stage plus relevant source files. Paths in this paragraph are relative to the repository being worked on, not this installed skill. Do not preload every stage or linked reference. If `scripts/agent-context.mjs` exists, its inventory can identify source hashes and sizes; print a packet only for a consumer that has not already loaded those documents.

For other SyberLabs repositories, use the same small pattern with existing documents: current outcome → applicable contracts → affected code/tests → reviewable change. Search the relevant area before expanding. Keep facts in their existing source and link to them. Do not impose Relay's product-specific contracts on another project or create a workflow framework just to use this skill.

On a long-task handoff, write one short checkpoint containing issue/owner, repository/worktree/branch/HEAD and dirty paths, decisions with sources, actual test results, unresolved work, and next action. Use an existing ignored work directory; do not write private data into Git. On resume verify current Git and source state before trusting it. A checkpoint never grants approval.

Select tools and specialized skills only for the current need. Use focused outputs and keep full logs outside model context. Do not launch extra agents solely to reduce tokens. Preserve existing peer review and production gates; proceed autonomously within the user's authorization.

Judge efficiency by matched completed tasks: actual input, cached and output tokens, elapsed time, retries, and quality. Bytes divided by four is only a rough text-size estimate. Do not claim cost savings from a smaller routing file.
