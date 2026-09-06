# Primary-source register

Accessed September 5, 2026. All links below were opened in this research pass. Dates are publication/revision dates where established; living documentation is labeled as such rather than given an invented publication date. No interviews, private developer advice, paid API experiments, or independent benchmark reproductions were performed.

Selection emphasizes people and teams who build models, production agents, serving systems, or original context research. “Best of the best” is treated as a request for strong first-hand evidence, not an objective ranking of developers. Vendor engineering reports are informative but not neutral comparative trials. Academic items marked abstract-only are research leads, not implementation-ready findings.

## Production engineering

1. **Anthropic Applied AI team — Effective context engineering for AI agents.** September 29, 2025. Authors include Prithvi Rajasekaran, Ethan Dixon, Carly Ryan, and Jeremy Hadfield. Production guidance on selecting, compacting, and externalizing context; not a Relay evaluation. [Source](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

2. **Yichao “Peak” Ji / Manus — Context Engineering for AI Agents: Lessons from Building Manus.** July 18, 2025. First-hand agent-building account. Used for recoverable evidence, stable prefixes, and failure retention; model/pricing examples are historical. [Source](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus).

3. **LangChain team — Context Engineering.** July 2, 2025. Framework builders' taxonomy of context operations. Useful vocabulary; does not establish that Relay needs LangGraph. [Source](https://www.langchain.com/blog/context-engineering-for-agents).

4. **Cognition — Multi-Agents: What's Actually Working.** April 22, 2026. Production experience with bounded multi-agent patterns and a single writer. Coding results are not job-application results. [Source](https://cognition.com/blog/multi-agents-working).

5. **Anthropic — Scaling Managed Agents: Decoupling the brain from the hands.** April 8, 2026. Used for separation of recoverable session state from model-context policy. A hosted-system design account, not a requirement to adopt that service. [Source](https://www.anthropic.com/engineering/managed-agents).

6. **Thariq Shihipar / Anthropic — The new rules of context engineering for Claude 5 generation models.** July 24, 2026. Recent first-hand guidance on simplifying prompts as models improve. Applied to routine guidance, not removal of factual or application controls. [Source](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models).

## Provider and runtime documentation

7. **OpenAI — Compaction.** Living API documentation. Server-side/standalone modes and continuation handling. Feature availability must be checked against the selected model. [Source](https://developers.openai.com/api/docs/guides/compaction).

8. **OpenAI — Prompt caching.** Living API documentation. Current generation-specific configuration and economics. Historical settings cannot be assumed portable to newer models. [Source](https://developers.openai.com/api/docs/guides/prompt-caching).

9. **Anthropic — Compaction.** Living platform documentation; beta compatibility is explicitly listed. Used for returned blocks, custom instructions, and pause behavior. [Source](https://platform.claude.com/docs/en/build-with-claude/compaction).

10. **Anthropic — Prompt caching.** Living platform documentation. Used for explicit/automatic caching and lifetime distinctions; no savings are assumed without telemetry. [Source](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

11. **Google — Context caching.** Page displays September 2, 2026 update. Critical distinction between Interactions and Generate Content. Account access and deployment behavior remain untested. [Source](https://ai.google.dev/gemini-api/docs/caching).

12. **Google — Thought signatures.** Living Generate Content documentation, labeled Legacy in the page title. Used for exact preservation of signature-bearing parts; not generalized to Interactions. [Source](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).

13. **Google — Long context.** Living API documentation. Used for query placement and avoiding unnecessary tokens; vendor retrieval examples are not accuracy guarantees for Relay. [Source](https://ai.google.dev/gemini-api/docs/long-context).

14. **xAI — Context Compaction.** Living API documentation. Opaque continuation output and SDK compaction. This does not establish installed Grok Bot support. [Source](https://docs.x.ai/developers/advanced-api-usage/context-compaction).

15. **vLLM maintainers — Automatic Prefix Caching.** Living runtime documentation. Distinguishes prompt-processing reuse from answer-generation speed. No local runtime was installed or benchmarked. [Source](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/).

16. **Qwen team — Transformers inference guide.** Living documentation with a Qwen3-specific long-context example. Static scaling caveat is not a configuration recommendation for every Qwen generation. [Source](https://qwen.readthedocs.io/en/stable/inference/transformers.html).

## Original research and frontier leads

17. **Chroma — Context Rot: How Increasing Input Tokens Impacts LLM Performance.** July 14, 2025. Report inspected for scope, tested models, and findings. Supports evaluating distractors and input length; does not establish a universal cutoff or current winner. [Source](https://www.trychroma.com/research/context-rot).

18. **Chroma — Context-1: Training a Self-Editing Search Agent.** March 26, 2026. Report inspected for retrieval, pruning, deduplication, and stated task limitations. Its narrow search setting limits transfer to broad job discovery. [Source](https://www.trychroma.com/research/context-1).

19. **Alex L. Zhang, Tim Kraska, Omar Khattab — Recursive Language Models.** Initially December 31, 2025; revised May 11, 2026. Abstract and metadata reviewed only. External-context processing is an experiment candidate; full methodological and implementation review is required before adoption. [Source](https://arxiv.org/abs/2512.24601).

20. **Qizheng Zhang and coauthors — Agentic Context Engineering: Evolving Contexts for Self-Improving Language Models.** Initially October 6, 2025; revised March 29, 2026. Abstract and metadata reviewed only. Used to identify incremental playbook curation as a research direction, without transferring reported benchmark gains. [Source](https://arxiv.org/abs/2510.04618).

21. **Saber Zerhoudi, Jelena Mitrovic, Michael Granitzer — The Compaction Cliff in Long-Running AI Agent Memory.** Submitted August 24, 2026. Recent preprint; abstract and metadata reviewed only. Used to motivate repeated-reset evaluation; no reproduction or generalization to newer models is claimed. [Source](https://arxiv.org/abs/2608.22752).

## How to refresh a claim

Re-open the supporting page, check the publication/revision date and exact API/model scope, and update the affected playbook with a short change reason. Preserve uncertainty when a page is unavailable or only its abstract can be inspected. Keep vendor facts separate from Relay proposals and measured Relay results. Search snippets, social reposts, and model-generated summaries alone do not qualify as confirmation.
