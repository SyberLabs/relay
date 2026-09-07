# Neutral first session and observation record

Protocol v1. Definitions and thresholds: [measurement.md](measurement.md). Use a private copy. Do not commit a completed form.

## Before starting

Confirm consent to observation and the qualification evidence from the [brief](README.md). Obtain separate permission for any recording; recording is optional. Let participants hide facts or screens and stop at any time. Observe only the task they choose. No browsing unrelated records, developer access to their accounts, or test applications sent to employers.

Record the tested Relay URL, deployment/commit if independently known, whether the version is unknown, date, browser/version, operating system/device, sign-in environment, assistant/provider and any visible model version, prior Relay exposure, and instruction identifier. Verify the environment through the existing release owners before a new invitation; this document does not establish production readiness. A deployment delay does not block in-repository implementation.

For Ravi's existing test, use [the debrief](ravi-debrief.md). Do not send this as replacement instructions, change his task halfway, or ask him to repeat his task to improve a score.

## Opening script and baseline (about 10 minutes)

“We are testing whether Relay helps with your real work or adds effort. We are not testing you. Choose one application or follow-up you actually need to work on. You can stop or use your usual tools whenever you wish. I will mostly watch; if I help, I will record that help.”

Ask before presenting a Relay walkthrough:

- “What are you trying to finish, and what would count as useful today?”
- “Show or describe the last similar handoff. What moved between which tools? Where did you keep job research, candidate facts, and the wording you reviewed?”
- “What did you have to repeat or check? What worked well? How often does this happen?”
- “For today's task, what is already prepared and what work remains?”

Where feasible, observe a comparable recent or naturally occurring baseline task with a timer. Otherwise record recalled active minutes and the participant's uncertainty; never call recall measured time. Do not require duplicate applications or repeat today's entire task in a fixed order for a purported controlled time comparison. Record differences in complexity, starting material, assistant, and output quality. Timing a reconstruction is a separate rehearsal with learning effects.

## Participant-led task (allow about 45 minutes)

Start the task clock when the participant first opens Relay for this work, including sign-in and setup. Pre-session developer provisioning and demonstrations are recorded separately; personalized preparation of their data is assistance. Allow about 45 minutes, but do not add a speed threshold to issue #5: the participant may continue or stop, and actual time counts. At completion or participant stop, end the initial attempt. If a scheduling limit ends it, record incomplete with that reason, not an inferred product failure. Log partial progress. Optional rescue afterward must be labeled assisted; do not erase the attempt or timer.

Use one outcome-oriented request: “Use Relay with your usual assistant for this real task. Bring in the job and facts you choose, get a draft back, review it, and decide whether any exact wording is ready to accept and reuse. If it isn't useful or ready, leave it unaccepted.” Do not read the following observer checklist as click-by-click instructions.

Observe these stages and mark each done, partial, not reached, or unknown:

1. **Add/select job:** a real participant-chosen role with its actual research. Note pre-existing records and any import-format preparation. Examples cannot stand in for the task.
2. **Select facts:** choose candidate facts to share; distinguish saved facts reused from fresh typing, research, or unverified claims. If the build lacks a saved-fact picker, record the gap and any manual workaround.
3. **External handoff:** participant moves the selected job/version, facts, and desired context into their assistant and requests real work. A packet copy alone is not transfer evidence.
4. **Return and review:** participant brings the result back to the same job/version, checks claims, edits or rejects it, and explicitly accepts exact wording only when ready. Record parsing or stale-version errors and retries. Never repair JSON or identities silently.
5. **Reuse:** observe reopening/retrieving the persisted reviewed wording and moving it into their own application or follow-up preparation. A private unsent destination is enough; sending is neither required nor performed by the researcher. Record whether destination wording matches, changes, or is unknown. If the participant declines acceptance, respect that and record why.

After they say they have finished, a neutral verification prompt may request: “Show me what was saved and what you would use next.” This verifies persistence; it must not tell them how to finish a previously incomplete step. Record any prompted navigation as verification, not voluntary retention.

If they ask for help, ask once: “What would you try if I weren't here?” They may use ordinary product help or their assistant, whose effort still counts. If they request an answer, give necessary help transparently and log the timestamp, exact instruction/action, reason, time, and result. Click guidance, data cleanup, transcription, account repair, or doing the task for them disqualifies independent completion. A neutral question or time notice does not. Count substantive guidance from any observer/helper, not just someone with a developer title.

## Debrief and close (about 5–10 minutes)

“What did you accomplish? What would you actually use? Where did Relay make work easier or harder than your usual approach? Which exact piece of context or wording, if any, did you avoid reconstructing? What did you still need to redo? For your next similar task, what would you choose and why?” Record neutral paraphrases, including no benefit or worse output.

Confirm total active effort, wait time, interruptions, and quality comparison. Ask about natural upcoming tasks without soliciting a return. Close with: “There is no requirement to use Relay again. Use whichever tools you would normally choose.” Any thank-you compensation must be fixed and independent of praise, completion, or return; record it privately.

Set `t0` when the whole initial session ends, including any rescue and debrief. Set the fixed cutoff to `t0 + 336 hours`. Do not send use reminders, return-contingent rewards, or willingness-to-pay offers inside that interval. Participant-initiated support may be answered, but log whether a substantive independent return preceded the support. Conduct a retrospective check after cutoff; ask about what already happened, without treating that check as a return.

## Private observation form

- Anonymous participant ID / task ID / session ID:
- Consent and eligibility evidence / qualification timestamp / cohort or exploratory:
- Instruction identifier and date received / original, v1, or deviation:
- Tested URL / verified build or unknown / environment / assistant:
- Intended task and useful-output criterion (private, no applicant details in Git):
- Baseline tools / frequency / reconstruction steps / baseline timing method:
- Baseline active minutes / uncertainty or range / starting material / comparability limits:
- Task started / unassisted attempt ended / session ended (`t0`) / cutoff (UTC):
- Job-added / facts-selected / actually-shared / draft-returned / reviewed / exact-accepted / reopened / reused timestamps and result for each:
- For each stage: active seconds / non-overlapping wait seconds / interruption seconds / retries / observed difficulty / evidence reference:
- Fact work: saved facts reused count / retyped facts count / verification and correction time:
- Each intervention: timestamp / actor role / request or unsolicited / exact help / active seconds / stage / result:
- Completion: independent, assisted, incomplete, or unknown / missing step and reason:
- Reuse destination kind / wording identical, changed, or unknown / no sending required:
- Useful output: usable unchanged, usable after edits, unusable, or unknown / concrete reason:
- Compared with baseline: better, same, worse, or unknown / what was preserved / actual steps avoided and added / effort uncertainty:
- Evidence source: observed, participant report, existing record, or mixed; keep opaque private reference IDs:

## Repeatable later-work record

Append a block for **every** reported visit/attempt, including excluded ones. Summarize into the cohort CSV only after classification.

- Participant / session / task ID / relates to earlier task ID:
- Work initiated / substantive packet actually shared / completed at (UTC):
- Relay URL/build/environment / source of timestamps / date reported:
- What prompted this visit, in participant's own words? Reminder/support/researcher contact or incentive before it (timestamp and purpose):
- Different real task? State its independent purpose. New job, or new follow-up with a new purpose on the same job? Same-task retry or assigned exercise?:
- What stored context, facts, or wording was retrieved? What reconstruction was avoided? Actual active minutes, waits, corrections, and useful output:
- Existing event corroboration / private evidence reference / uncertain or missing evidence:
- Classification: voluntary distinct handoff, reminded work, same-task retry, example, developer QA, visit only, outside window, or unknown:
- Core completion and assistance (record separately from qualifying return):
- If no subsequent task occurred: basis for that report and observation coverage:

At cutoff, distinguish a confirmed report of no return from inability to observe. Preserve reminded work and failures in the record. Absence from a limited event list is not evidence that nothing happened.
