# Model and runtime playbooks

Checked September 5, 2026. These are candidate configurations, not a measured model leaderboard. Choose the least costly configuration that passes the same job-workflow checks. Model names, endpoints, cache settings, and beta access must be verified again before implementation.

## Shared contract

Every assistant receives the task stage, job identity/version, relevant evidence, supported candidate facts, unresolved questions, output requirements, and allowed actions. Separate task instructions from untrusted posting text. Send the [task-context companion](templates/task-context.md) alongside the native Relay packet where supported.

For a provider switch, export ordinary evidence and decisions using the [checkpoint](templates/checkpoint.md), then reload current Relay state. Treat encrypted compaction items and thought signatures as provider-specific state. Do not translate, edit, or use them as cross-provider memory. A model change within one provider also requires a documented compatibility check or a fresh ordinary-context handoff.

## OpenAI: Responses API and reasoning models

**Documented capabilities.** Responses supports server-side compaction via `context_management` and `compact_threshold`, plus standalone `/responses/compact`. Compaction returns an opaque encrypted item. The guide distinguishes stateless input chaining from `previous_response_id` continuation; their pruning rules differ. Preserve the documented response items rather than reducing a tool conversation to text alone. [Compaction](https://developers.openai.com/api/docs/guides/compaction).

**Current caching distinction.** The official guide distinguishes GPT-5.6 and later from GPT-5.5 and earlier models. Newer models support explicit breakpoints and `prompt_cache_options.ttl`, with cache-write charges; older examples can use different retention controls. Reusing an old caching recipe across all OpenAI models is unsafe. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

**Relay proposal.** Use focused evidence synthesis or drafting requests, then independently check factual claims. Keep durable facts and acceptance outside continuation state. Before enabling compaction, prove that a reset preserves the job/version and abstains on missing facts. Keep a provider-specific adapter rather than importing request fields from another vendor.

**ChatGPT/Codex surfaces.** These API capabilities do not establish that a particular chat product exposes the same controls. For manual use, attach or open the selected files, explicitly identify the current task, and checkpoint before switching tools. Relay currently has no OpenAI API connector; this section proposes a future integration.

## Claude: Messages API and Claude Code

**Documented capabilities.** Claude's compaction guide currently marks supported platforms as beta and lists model compatibility. Its example uses `compact-2026-01-12` and `compact_20260112`. Subsequent requests must retain the returned compaction block. Custom summary instructions replace the default instructions. The guide also documents `pause_after_compaction` and model-specific differences in how earlier thinking is handled. [Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction).

Claude caching supports automatic caching and explicit `cache_control` breakpoints, with 5-minute and 1-hour lifetimes and model-dependent economics. Cache behavior should be tested separately from summary quality. [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

**Relay proposal.** Keep the current single-call drafting path as the baseline. It already limits the request to the selected job, supplied facts, and draft. Add long-running context features only if the task becomes genuinely multi-turn. Use explicit source labels and preserve unknowns. For newer Claude generations, test a concise task contract against accumulated legacy rules, informed by [Anthropic's July 2026 guidance](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models).

**Current implementation limit.** Relay's `draftClaude` has no caching or compaction configuration and expects a completed text draft. Enabling a compaction pause would require handling that stop reason; merely adding a parameter is insufficient. Claude Code and a Claude API request are separate runtimes with separate state and credential handling.

## Gemini: distinguish Interactions from Generate Content

**Documented capabilities.** Google's current caching page says Interactions supports implicit caching, including stateful and stateless modes, but not manually managed explicit cache objects. Explicit caching belongs to Generate Content. Google's page was updated September 2, 2026. [Caching](https://ai.google.dev/gemini-api/docs/caching).

In Generate Content, preserve returned thought signatures exactly in their original content parts. Gemini 3 function-calling requests can fail validation when required signatures are omitted. A “provider-neutral” conversation serializer that keeps only text can therefore break continuation. This statement is scoped to the documented Generate Content interface, not assumed for every Gemini endpoint. [Thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).

Google recommends placing the question after long context and avoiding unnecessary input. [Long context](https://ai.google.dev/gemini-api/docs/long-context).

**Relay proposal.** Evaluate Gemini for tasks where inspecting a larger source bundle is actually needed. Start with selected evidence and the question at the end. Compare against giving the model the full relevant bundle; neither strategy wins by definition. Record which endpoint and history mechanism were used. Relay currently has no Gemini connector.

## Grok: xAI API versus the installed Grok Bot

**Documented capabilities.** xAI documents `/v1/responses/compact` and a `chat.compact()` SDK method. Returned `encrypted_content` must remain opaque; the output is passed back intact, and new turns follow it. The blob is meaningful to xAI's API, not a general interchange format. [Context compaction](https://docs.x.ai/developers/advanced-api-usage/context-compaction).

**Relay proposal.** For research, return dated employer sources, factual findings, and unknowns. Social posts may suggest leads; the assistant must check hiring claims against the actual employer posting before treating them as current requirements. A fresh provider request receives the ordinary handoff, not another provider's continuation object.

**Current implementation limit.** Relay's Grok Bot integration is a command/file adapter. It does not establish access to xAI's API, compaction controls, or the installed Bot's hidden context settings. Use the existing [Bot handoff](../integrations/GROK_BOT.md), validate research/draft output, and retain the exported job/version. Do not advertise API features as configured Bot features.

## Local and open-weight models: identify the exact deployment

**Documented capabilities.** vLLM prefix caching reuses shared-prefix computation. It speeds prompt processing rather than generation of new answer tokens. [vLLM](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/).

Qwen's Transformers guide provides a concrete Qwen3 context-extension example and warns that static YaRN scaling can affect shorter inputs. It is not a universal setting for later Qwen models, other runtimes, or all quantizations. [Qwen guide](https://qwen.readthedocs.io/en/stable/inference/transformers.html).

**Relay proposal.** First test narrow extraction and classification with small packets. Record the exact checkpoint, model revision, tokenizer/chat template, quantization, runtime version, configured context, hardware, and output limit. Do not infer a working context size from a family name. Increase context only when evidence recall improves without unacceptable latency, memory use, or factual errors.

Local execution can keep inference local only if the actual tools, logs, and network paths do so too. Confirm the data flow before using sensitive candidate material. Unknown local models get the same no-fabrication and no-status-invention checks as hosted models. Relay currently has no local-model connector.

## Choosing a first configuration

Use the already-available assistant that can read the selected evidence and produce the required output. Run the fixed cases in [evaluations](evaluations.md). Escalate to a stronger or larger-context configuration only for a recorded failure. Keep the exact model identifier with each run; do not use “best,” “latest,” or an app display name as a reproducible configuration.
