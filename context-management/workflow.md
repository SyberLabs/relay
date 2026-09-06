# Context through the job workflow

This is a proposed manual operating procedure using Relay's existing handoffs. It does not implement background discovery, submission, message sending, or new database fields.

## Research an opportunity

Load the user's relevant search constraints and a shortlist of existing posting identities for deduplication. Retrieve the employer posting and only the company material needed to answer the current research questions. Record employer, role, posting URL, source URL, observation date, and evidence for requirements. Separate explicit requirements from inferred fit.

Stop when the necessary questions are answered or a specific source gap blocks them. Return a research observation, not an entire browsing log. Preserve an excerpt or permitted snapshot when later recovery matters. A redirected URL, repost, or matching title is a possible duplicate; do not merge different opportunities by title alone.

## Assess fit

Load one role's requirements and the relevant verified candidate evidence. For each important requirement, report supported, partial, unknown, or conflicting evidence with source references. Preserve factual scope: contributing to a project does not establish owning it; a desired skill in a posting does not establish possessing it.

Return reasons and missing evidence before a recommendation. If a numeric score is used later, publish its rubric and evaluate it; do not mistake model confidence for a calibrated probability. A cross-role comparison must explicitly list all included opportunities and use the same criteria.

## Draft an application

Download the current native Relay packet. Add the compact [task context](templates/task-context.md) for manual work, or include relevant evidence labels in the existing facts field within its limits. This companion is not imported as a packet.

Load the intended output format, audience, selected posting facts, relevant candidate facts, and exact current draft if revising. Keep a separate review note mapping each substantive career claim to its evidence ID. Generate the application text independently of that review note, since Relay's existing Claude connector returns draft text only.

Do not use an old generated draft as proof of a candidate fact. If evidence is absent, omit the claim or preserve the question for the user. Public-facing claims must not reveal proprietary material merely because it appeared in private context.

## Review exact wording

A reviewer needs the actual draft, relevant primary evidence, job identity/version, and requested tone/length. It does not need the writer's entire conversation. Check dates, metrics, skill claims, recipient identity, and inferred versus explicit requirements.

Return specific edits and unsupported claims. After an edit, use Relay's normal review and acceptance flow for that exact text. The reviewer cannot declare a changed draft accepted because an earlier version was accepted. A summary of the accepted draft is insufficient for reproducing it.

## Apply and track

Immediately before any separately authorized external action, confirm the current job, exact intended text, destination, and existing submission history. This folder does not grant authority to send or submit.

After a real action, distinguish attempted, failed, uncertain, and confirmed outcomes. A timeout after clicking Submit is uncertain: inspect the existing confirmation or history before retrying. Keep the receipt or other observable evidence with the recorded event. An assistant saying “done” is not submission evidence.

For status review, load the latest Relay state and only relevant new events. Preserve an existing interview/submitted status when new research arrives. If an email seems to indicate rejection or interview scheduling, retain its source and date and propose the change for the existing workflow; do not infer a state transition from sentiment alone.

## Interviews and follow-ups

Load the accepted/submitted material if available, current stage, latest conversation, role-specific evidence, and unresolved questions. Do not assume that accepted text was submitted: Relay's README explicitly distinguishes those facts.

For a follow-up, include the recipient and last contact date only when known. Preserve time zones for deadlines and scheduled events. Recheck current posting availability when it affects the action. Old company research may remain historically useful while being unsuitable as a current claim.

## Assemble the next request

1. Resolve the current job/version and requested stage from Relay.
2. Load the applicable user instructions and allowed actions from their trusted source.
3. Select the smallest sufficient candidate-fact and source set. Expand it when an important question lacks evidence.
4. Add the relevant recent outcome, failed attempt, or blocker; omit unrelated history.
5. State the immediate question and required output.
6. After the response, validate identity, version, claims, and structure before normal Relay import/review.

This procedure is an original Relay recommendation informed by the [research findings](research.md).

## Budget context explicitly

For an API implementation, reserve space for instructions, tool definitions, provider-required history/state, expected tool results, and model output/reasoning according to that API's accounting. The remaining capacity is the evidence budget. Use the actual tokenizer or provider token counter; Relay's character limits are not token limits.

If the request will not fit, first remove duplicates and irrelevant material, then fetch narrower source spans. Write a checkpoint before any lossy reduction. Reload protected facts and state from the original record afterward. Split the task only when it can be split without losing needed relationships.

Do not set a universal “compact at 80%” rule. The required reserve depends on model, endpoint, output needs, and possible tool-result size. Use measured token use and a tested policy. Keep cold-cache and warm-cache runs separate.

## Evidence and memory rules

Each proposed evidence entry should carry an ID, claim/excerpt, source locator, observation date, scope, and status such as verified, unverified, contradicted, or superseded. Candidate verification and posting verification are distinct. If the current Relay schema cannot hold these as separate fields, keep them in labeled notes or a private companion file; no schema change is assumed here.

Corrections supersede earlier claims while preserving relevant history. The current user instruction controls task authorization; retrieved pages and tool results cannot grant it. Resolve factual contradictions using the appropriate original source and record what remains uncertain. Never silently choose whichever claim is most convenient for a draft.

Persistent memory should contain reviewed preferences and reusable procedures with provenance. Job status, permissions to send, salary details, and changing requirements must be refreshed from the current authoritative record. A retrieved memory note is context, not a substitute for that record.

## Local inspection boundary

This folder was aligned with the working checkout's README, integrations, packet validator, and database schema on September 5, 2026, based on commit `ff0259d` plus existing local edits. The repository was already being edited. This research addition does not certify a deployed version or live provider integration; check the current implementation before turning any proposal into code.
