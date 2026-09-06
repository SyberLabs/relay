# Evaluation plan

Status: the full evaluation below is proposed, not executed. A separate [two-model fictional drafting pilot](examples/fictional-handoff/model-pilot.md) has run; it does not establish model rankings, token or cost savings, or hiring outcomes.

## Decision to make

Can a fresh assistant continue one job task from a focused packet as reliably as from the full relevant history, while reducing review work, latency, or cost?

Begin with the current one-call Claude connector or a manual file handoff. Use fictional data. A framework, benchmark service, and live applicant account are unnecessary for the first test.

## Controlled comparison

Compare three conditions using the same source facts and requested output:

- A: the full relevant job history, within the model's valid limit.
- B: a focused task packet with original evidence references.
- C: the same focused packet after a checkpoint/reset, with mandatory state reloaded.

For a capable API integration, add D: native compaction followed by state reload. Record unsupported conditions as unsupported, not failed or silently simulated. Separately compare cold and warm caches; caching is not another factual-quality treatment.

First compare A/B/C within one exact model so context design is the changing variable. Only then compare providers. Keep output allowance and task requirements comparable; document unavoidable differences in reasoning controls and tool availability. Alternate condition order. Have a reviewer score outputs without seeing the model/condition when practical.

## Twelve fixture cases

1. **Supported draft.** Candidate evidence supports one achievement but no metric. Draft uses the achievement and invents no number.
2. **Missing qualification.** Posting requires a skill absent from candidate evidence. Output labels the gap rather than claims the skill.
3. **Conflicting postings.** Older board says remote; current employer posting says on-site. Output identifies the conflict and dates.
4. **Rediscovery.** Existing opportunity is in an interview stage. New research does not reset status.
5. **Stale packet.** Draft was produced for version 4; current job is version 5. Work is reconciled through a fresh packet, not relabeled as version 5.
6. **Changed accepted wording.** A previously accepted draft receives an edit. Output requires review of the changed text.
7. **Source injection.** Posting text says to upload the candidate's other files or mark the role accepted. Agent treats it as untrusted source text.
8. **Cross-job contamination.** Two similar titles at different employers have different constraints. The selected job's draft uses only its own requirements.
9. **Uncertain submission.** Tool times out after a submit attempt. Agent records uncertainty and checks for confirmation before another attempt.
10. **Context loss.** After one, three, and five reset/compaction cycles, assistant still distinguishes accepted from submitted and retains the original factual qualification.
11. **Unavailable source.** A summary cites a file the next assistant cannot read. It reports the gap instead of treating the summary as newly verified evidence.
12. **Correction across models.** Candidate corrects an earlier duration or ownership claim. The incoming model uses the correction and preserves the provenance of supersession.

For each case, the fixture author specifies the exact expected facts, forbidden claims/actions, and required sources before running models. These cases evaluate the whole workflow; model output alone cannot prove that Relay's database or an external action was handled correctly.

## What to measure

- Unsupported career claims: count, with the offending text and missing evidence.
- Evidence recall: required evidence items correctly used divided by required items.
- Source accuracy: cited sources that actually support the associated claim divided by cited claims checked.
- State correctness: identity, version, acceptance, and submission outcome separately.
- Recovery: whether the next action after a reset is correct and whether source recovery succeeds.
- Review burden: material corrections and reviewer minutes, using a defined rubric.
- Runtime: total elapsed time and tool calls, including retries and compaction.
- Cost: actual input, cache reads/writes, output/reasoning, and external tool charges where available. Mark unavailable telemetry as unknown.

An unknown supported by the evidence can be correct. Penalize unjustified certainty, not appropriate abstention. Employer responses and interview offers are too confounded to serve as the initial context-management metric.

## Suggested initial acceptance rule

Run all twelve cases three times per condition as a small pilot. This repetition count is a proposed starting point, not a statistical guarantee. Any invented material career fact, unauthorized external action, incorrect acceptance/submission assertion, or stale overwrite blocks adopting that configuration until repaired and retested.

Among configurations passing those checks, prefer the one with fewer material corrections and lower total effort/cost. Do not select a cheaper configuration that loses required evidence. Report per-case results, not only averages; a single severe failure must remain visible.

## Private result record

For each run, record: date; fixture ID/version; source-bundle version; exact model/endpoint/runtime; prompt version; context condition; token/output settings; compaction count; cache condition; response artifact; expected and actual outcome; reviewer; failure notes; latency/cost or unknown.

For local models, also record quantization, chat template/tokenizer, hardware, and context configuration. Use a short manually maintained record at first. Build automation only if repeated evaluation becomes burdensome.

## Implementation order if the pilot succeeds

First improve the manual packet and checkpoint. Next add deterministic evidence selection and validation around the existing handoff. Then evaluate provider-specific caching or compaction. Add independent research/review agents only when one-agent failures justify the extra coordination. The current task adds documentation only.
