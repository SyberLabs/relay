# Grok Bot templates

Four focused Bots. Use a specialist only when its answer can materially improve the work; simple requests need none.

- [First Principles](first-principles/README.md): clarify a muddled goal, challenge a decisive assumption, or find the next useful test.
- [Product Ideation](product-ideation/README.md): decide what product to build from observed customer problems and how to test demand cheaply.
- [Red Flag](red-flag/README.md): review a specific plan, claim, design, code change, or AI answer before relying on it.
- [Garbage Collector](garbage-collector/README.md): remove unnecessary code or architecture while preserving required behavior.

## Set up one Bot

Open a package and follow its public Bot link to add the published template. To configure a Bot from source, use its `PROFILE.md` and complete `skills/<name>/SKILL.md`, then inspect the saved instructions.

For a compatible local skill loader, copy only the specific `skills/<name>/` directory into its configured skills root. Preserve the directory name and frontmatter identifier. Do not load all four into one Bot by default: First Principles includes Bot-specific always-on instructions.

Repository files and public links do not install a Bot, grant tools or account access, connect Bots, or prove which saved Bot is present. Confirm the actual installed identity and available access before a direct handoff. If direct messaging is unavailable, prepare the exact handoff for the user; do not claim it happened or present the result as an independent review.

## Give a specialist one bounded job

Include:

1. The goal and what counts as done.
2. One exact question for the specialist.
3. The original material, sources, and known facts.
4. Assumptions, unknowns, deadline, and available budget.
5. Allowed actions, such as review only or a reversible local change.
6. The expected result and stop point.

Start with one specialist. Use no more than four specialist responses for one request, including at most one correction, unless the user sets a stricter limit. Inspect decisive calculations, source claims, proposed changes, and test results against the original evidence. Agreement between Bots is not independent proof. When answers disagree, identify the disputed fact or assumption and run the smallest useful check.

Honor the request's scope. Stop when the result is complete, a decisive next experiment is ready, required authority or information is missing, the response limit is reached, or another pass would repeat the same reasoning.

## Evidence

Each package separates prepared cases, observed behavior, and limitations. Native observations were recorded during setup on September 4–5, 2026 and were not rerun during the source migration. Public share links were verified in those publication sessions; this repository does not claim marketplace catalog admission.

Garbage Collector also includes [reproducible Python fixture checks](garbage-collector/eval/README.md). They check example code, not a model's reasoning quality.

Six historical hypothetical routing responses also matched the intended chooser behavior: a simple rewrite stayed with the coordinator; a social post draft was returned without publishing; interview notes routed to Product Ideation; code complexity routed to Garbage Collector for review only; conflicting launch evidence produced a disputed assumption and a small check; and duplicate Bot names required identity resolution or a prepared handoff. These were hypothetical responses, not completed specialist handoffs or a fresh-session test, and they were not rerun during the source migration or this cleanup.

## Maintained source

This directory is the maintained source for the four Bot packages. Skill identifiers and instruction bodies were preserved during consolidation. Public templates are separate deployed snapshots; source edits require a separate inspected publication step to update them.

Garbage Collector originated in [SyberLabs/grok-bot-aggressive-deletion](https://github.com/SyberLabs/grok-bot-aggressive-deletion), whose earlier source and evaluation history remain available. Local setup records, account identities, private transcripts, and draft social posts are not part of these packages.
