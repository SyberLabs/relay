# Scoped context for SyberLabs development

Owner: Seth. Peer reviewer: Mateo. Implementation: [issue #92](https://github.com/SyberLabs/relay/issues/92). Research checked September 6, 2026. This is a local development workflow; production approval remains in the existing delivery system.

## Decision

Use Interpretable Context Methodology selectively: a small repository entrypoint, a task router, a contract for the current stage, existing authoritative references, and a short working checkpoint. The [primary paper](https://arxiv.org/html/2603.16021v2) describes filesystem-based context routing for sequential work with reviewable outputs. Its example context sizes do not establish savings for SyberLabs. This implementation must earn its complexity through actual task measurements.

```mermaid
flowchart LR
  A[Repository AGENTS.md] --> B[Task router]
  B --> C[Current stage contract]
  C --> D[Required policies and relevant code]
  D --> E[Reviewable change and short checkpoint]
  E --> F[Existing peer review]
  F --> G[Existing production approval]
```

The stage folders organize instructions. The existing issue, diff, tests, and release evidence are the outputs; duplicating them into four new output trees would add maintenance. File presence never means approval, authorization, or successful execution. Documents guide agents; application enforcement and GitHub gates provide the controls.

## Question, delete, simplify, then automate

- **Problem and owner:** Seth wants less repeated discovery and context loading across SyberLabs development, especially Relay. Optimize verified completed work, not a shorter prompt alone.
- **Delete:** no new orchestrator, embedding service, vector store, automatic summarization calls, transcript archive, extra agent tier, or mandatory approval after each folder. Avoid repeated full-document reads and duplicate rule copies. Do not remove correctness evidence just to lower a count.
- **Simplify:** retain Relay's existing root safety contracts. Route detail and load it only when needed. Use one checkpoint at a real interruption or handoff, not a log entry after every tool call.
- **Accelerate:** restart from verified source references and Git state. Narrow subsequent review to changed code and unresolved findings while following dependencies when needed.
- **Automate last:** a small local Node script enumerates a fixed set of public documentation, checks size limits, and optionally assembles a packet. Existing unit CI checks the routes. No service, scheduler, or paid model call is introduced.

## Use it

Read [CONTEXT.md](CONTEXT.md) and the matching stage. Codex receives root repository instructions automatically; other agents should read `AGENTS.md` explicitly. A `CONTEXT.md` file has no special runtime behavior, so the router explicitly tells the agent to open it. Codex discovers an instruction chain at session start; see [official instruction discovery](https://developers.openai.com/codex/guides/agents-md). Do not assume changing directories discards earlier context or loads every nested instruction.

From the repository root, using Node 24 and Git with locally available objects:

```sh
node scripts/agent-context.mjs build
node scripts/agent-context.mjs build --print
node scripts/agent-context.mjs --check
```

The first command returns the pinned commit, paths, SHA-256 hashes, and sizes. Use the second only for a fresh consumer that needs a portable packet; printing already-loaded policies increases tokens. The third validates every stage and compares it to the union of routed documents. The fixed manifest in `scripts/agent-context.mjs` is the packet's source list; adding a mandatory reference requires updating it as well as the human route.

All stages include root instructions, router, abuse controls, contributing, and delivery. Review adds the threat model; release adds hosting. The issue, source code, skill body, task checkpoint, tool definitions, inherited instructions, and conversation history are additional context and are **excluded** from this measurement. Treat the packet as a starting selection, not everything necessary to complete a task.

The tool selects at most seven regular Git blobs from one commit per stage, each at most 24 KiB; root/router files are capped at 4 KiB and stage instructions at 2 KiB. Complete packets are capped at 48 KiB. It rejects missing, empty, invalid UTF-8, non-regular Git entries (including symlinks), and oversized inputs without partial output. Uncommitted changes to selected documents also refuse a packet; read those files directly until the intended edits are committed. Content comes from immutable object IDs using [Git tree entries](https://git-scm.com/docs/git-ls-tree) and [Git object reads](https://git-scm.com/docs/git-cat-file), so replacing a working-tree path cannot redirect packet content. Each Git subprocess has a five-second deadline and bounded output; lazy fetching and interactive credential prompts are disabled. It writes no files. This assumes a trusted Git installation/object database, not a sandbox against a compromised machine. Reduce duplication or select narrower optional references if a budget fails; never truncate required security contracts.

Use the [checkpoint template](checkpoint.md) on a real handoff. Keep it in the existing ignored private-data directory. GitHub remains the source for assignment, review, and release status; source files remain the source for implementation facts.

## Reuse across SyberLabs

The portable [syberlabs-development skill](../../.agents/skills/syberlabs-development/SKILL.md) is maintained here and can be installed in the user's Codex skills directory (`$CODEX_HOME/skills`, normally `~/.codex/skills`). Copy the `syberlabs-development` directory there; preserve and compare any existing version before replacing it. Start a fresh task if the current session's skill catalog has not refreshed. [Official skills guidance](https://developers.openai.com/codex/skills) describes progressive disclosure: skill metadata is discovered first, and the body is read when selected.

The skill applies across SyberLabs repositories using their own contracts. Other tools can read the same Markdown directly. For a repository that needs explicit routing, add a short link from its existing agent entrypoint and adapt the four stage contracts to its actual workflow. Keep product-specific policies in that repository. Roll out these committed changes through each repository's review process; a local skill installation does not distribute them to Mateo, Cursor automations, other machines, or every SyberLabs repository.

To remove the local installation, remove only the installed `syberlabs-development` directory. To stop the Relay pilot, revert issue #92's routing/tooling change through review; there is no database or deployment rollback.

## Evaluate before claiming savings

The `--check` output is a static comparison against loading all routed documents, not a historical baseline. `roughTextTokens` is UTF-8 bytes divided by four, rounded up; it is neither an exact tokenizer count nor a model-context limit. Provider usage and caching can change cost independently of this estimate.

Initial local measurement at commit `a31fbb26` (September 6, 2026; rerun the command for current values): the union of all routed source documents is 43,661 bytes. Plan selects 24,244 bytes, build 24,254, review 27,831, and release 36,071. The assembled build packet, including source labels and hashes, is 25,076 bytes. These numbers exclude source code and session overhead; no matched agent runs have been completed yet.

For the first evaluation, Seth owns five matched task pairs spanning implementation, a bug fix, review, and a resumed task. Use fictional data and the same starting commit, task, model, settings, tool access, and acceptance tests in isolated worktrees and fresh sessions. Compare the existing workflow against scoped routing; vary run order. Record model/tool versions, actual input/cached/output tokens where exposed, wall time, tool reads, retries, test outcomes, missed constraints, and reviewer rework. Mark unavailable usage unknown; do not infer billing from file size.

Predeclared pilot target: at least 20% lower median reported input tokens per accepted task, with no new missed security/data/approval constraints, no lower acceptance-test pass rate, and no increase in median reviewer rework. Treat five pairs as a rollout signal, not a general benchmark. If the current baseline already loads only relevant files, the new routing may offer little benefit; simplify or remove it if results do not justify maintaining it. Do not launch paid evaluation runs automatically.

## Principle checks

First principles: measure useful completed work and name Seth as owner. Algorithm: question, delete, simplify, accelerate, then automate as above. Factory: one reusable skill and existing CI, with no new infrastructure cost. Communication: source links and an explicit next action shorten handoffs; report failed checks immediately. Leadership: one owner, observable acceptance, honest limits, and existing peer review serve the team. Semantic tree: contracts and routing precede implementation detail. Urgency: ship a bounded reversible pilot without waiting for a universal agent platform. Usefulness: retain only what improves accepted work; no claim of flawless behavior or measured savings yet. Hiring guidance does not change this implementation because no hiring decision is involved.

The [abuse-control framework](../abuse-controls.md) is unchanged. This work adds no deployed route, storage table, Relay-funded upstream operation, retry loop, or background job. Any future server integration must independently satisfy that framework before release.
