# Research findings

Checked September 5, 2026. The source register distinguishes documentation, production reports, benchmark research, and abstract-only research leads. Recommendations explicitly marked “Relay decision” are our application of the evidence, not results measured by the source authors.

## First principles

A job workflow must answer four questions: Which opportunity is this? What is supported by evidence? What has the user actually accepted or done? What is the next authorized action?

A model can only act on the information available in its current invocation and tools. Records persist beyond that invocation. Research can become stale. Compression can omit details. A generated statement is not proof of a career achievement or a completed application. Those constraints determine the design before a model brand or agent framework does.

**Relay decision:** maintain three separate things: the durable job record and source evidence; the selected working context for this task; and provider-specific conversation state. The first survives every model switch. The second is disposable and reconstructable. The third is an optimization, never the sole record of acceptance or submission.

## 1. Select evidence instead of accumulating transcripts

Anthropic's Applied AI team describes just-in-time retrieval, structured notes, and compaction as complementary approaches. Its guidance warns that aggressive compression can lose details needed later. LangChain organizes context work into writing, selecting, compressing, and isolating information. These are useful operations rather than a requirement to adopt either vendor's framework. [Anthropic, 2025](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [LangChain, 2025](https://www.langchain.com/blog/context-engineering-for-agents).

**Relay decision:** begin with the selected posting, relevant verified candidate facts, the latest job version, and the requested deliverable. Retrieve additional material for a named missing fact. Avoid injecting the whole vault, all applications, all previous drafts, or full browser transcripts by default.

Chroma's Context Rot study evaluates 18 models and finds reliability varies with input length and distractors. Its tested model set and tasks do not establish a cutoff for today's models or for job applications. **Relay decision:** test several useful context sizes and evidence positions; do not equate advertised capacity with demonstrated accuracy. [Context Rot](https://www.trychroma.com/research/context-rot).

## 2. Make compression recoverable

Manus cofounder Yichao “Peak” Ji describes stable prompt prefixes, external files, recoverable context reduction, and retention of failure information. These are production observations, not universal laws. A URL alone may fail to recover a changed or removed posting. **Relay decision:** retain dated source excerpts or permitted snapshots, evidence IDs, and the reason an attempted action failed. Compact repetitive navigation and tool output only after useful evidence has been recorded. [Manus, July 18, 2025](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus).

For Relay, the content that must survive includes job identity/version, scope of authorization, exact accepted text or a verified reference to it, candidate-fact provenance, uncertainty, status evidence, and unresolved blockers. Reconstruct these from their authoritative records after compaction; do not trust the summary to preserve them perfectly.

## 3. Newer models change the right amount of guidance

In July 2026, Anthropic's Thariq Shihipar reported substantial simplification of Claude Code's system prompt for Claude 5 generation models, favoring model judgment over brittle instructions for routine implementation choices. That is evidence to retest older prompting habits, not permission to remove application boundaries. [Claude 5 context engineering](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models).

Anthropic's April 2026 Managed Agents account separates recoverable session storage from the transformations used to assemble model context, acknowledging that those transformations change as models improve. [Managed Agents](https://www.anthropic.com/engineering/managed-agents).

**Relay decision:** keep the permanent task rules short and explicit. Delete duplicated persona text and speculative micro-instructions. Preserve factual and authorization constraints in both the task instructions and application checks. Version the model-specific formatting separately from the durable record.

## 4. Cache reuse and context quality are different objectives

Stable prefixes can reduce repeated processing. They do not make an irrelevant or false statement more useful. Current OpenAI caching behavior differs across model generations; Claude documents configurable cache lifetimes and write/read charges; Gemini's Interactions API supports implicit caching but not explicit cache objects. The [model playbooks](model-playbooks.md) identify the specific boundaries.

**Relay decision:** cache only material the task needs and is permitted to send. Keep rapidly changing job facts and the immediate request after stable instructions. Recompute the packet when verified facts change. Measure total cost including writes, misses, retries, retrieval, and review; never add padding just to hit a caching threshold.

## 5. Parallelism is useful only when shared state stays coherent

Cognition's April 2026 production report endorses narrower multi-agent arrangements with a single writer, including independent review and read-only research. This updates its earlier skepticism about multi-agent systems. Anthropic describes benefits from isolated research contexts. Their guidance can coexist: independent evidence gathering differs from simultaneous competing edits. [Cognition](https://cognition.com/blog/multi-agents-working), [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

**Relay decision:** start with one agent. For a difficult role, split independent questions such as company research and role requirements. Require both workers to use the same job identity and factual constraints. Return sources and uncertainties to one integrator. Give a reviewer the draft plus primary evidence and task requirements, without making it inherit the writer's persuasive narrative. A second model agreeing is not independent proof.

## 6. Research frontier: promising, not established Relay defaults

**Self-editing retrieval.** Chroma's March 2026 Context-1 report combines retrieval, deduplication, and model-controlled removal of document chunks within a budget. Its authors flag a narrow focus on depth-oriented search, not exhaustive discovery. **Relay experiment:** remove irrelevant passages while retaining source references; verify that “find all suitable roles” does not silently become “find one convincing role.” Do not transfer its benchmark results to hiring outcomes. [Context-1](https://www.trychroma.com/research/context-1).

**Recursive processing of external context.** Alex L. Zhang, Tim Kraska, and Omar Khattab propose examining a long input programmatically and delegating work over selected portions. The paper was revised in May 2026. Only its abstract and metadata were reviewed in this pass. **Relay experiment:** consider this for a genuinely large employer archive after simple retrieval fails. Require a full paper/implementation review, bounded calls, costs, and a trace before adoption. [Recursive Language Models](https://arxiv.org/abs/2512.24601).

**Incremental learned playbooks.** Qizheng Zhang and coauthors' Agentic Context Engineering work describes accumulating and curating strategies while avoiding loss from repeated rewriting; the version reviewed was revised March 2026. Abstract and metadata only. **Relay experiment:** retain a small, reviewed list of recurring drafting corrections with evidence and counterexamples. Never promote a model-generated candidate claim into verified memory or automatically rewrite user preferences. [Agentic Context Engineering](https://arxiv.org/abs/2510.04618).

**Repeated compaction failures.** An August 24, 2026 preprint by Saber Zerhoudi, Jelena Mitrovic, and Michael Granitzer reports rule loss over repeated compaction in its tested configurations. Abstract and metadata only; no independent reproduction or current-model generalization is claimed. **Relay experiment:** test rule retention after one, three, and five context resets, while restoring mandatory state from the original records. [The Compaction Cliff](https://arxiv.org/abs/2608.22752).

## What to defer

Defer a universal memory service, a mandatory vector database, a large agent swarm, automatic rewriting of career facts, and model rankings based on reputation. None is required to preserve a job-specific reviewable handoff. Add one only when an observed failure and a controlled comparison show that it improves the workflow.

The immediate development question is: **Can a fresh assistant resume one opportunity from a compact packet without losing evidence or changing acceptance/status?** The [evaluation plan](evaluations.md) makes that question testable.
