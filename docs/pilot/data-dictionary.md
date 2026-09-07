# Cohort CSV data dictionary

[cohort.csv](cohort.csv) is UTF-8, comma-delimited, **header only**. It contains no participants or example rows. Create a private copy to fill; never commit completed rows. One row summarizes one anonymous participant, not one visit. Keep detailed stages, attempts, timestamps, original instruction references, and later visits in a private copy of the [observation record](first-session.md). The CSV summarizes that evidence; it is not task tracking.

Use opaque participant/task/evidence IDs with no initials, employers, email addresses, handles, or encoded contact information. Actual test URLs and environment details belong in the private referenced form; do not store token-bearing URLs. Even anonymous free-text summaries must stay private until checked for identifying details.

Blank means missing/unmeasured/not yet applicable, never zero or “no.” Use `unknown` for explicitly unresolved categorical judgments. Numeric minutes are nonnegative decimal minutes except `net_active_min_saved`, which may be negative; zero means observed zero. Counts are nonnegative integers. UTC timestamps use ISO 8601 with `Z`. No formulas, applicant text, or spreadsheet-specific formatting are embedded. Quote CSV fields containing commas, quotes, or newlines; escape quotes by doubling them. Treat imported free text as text, never as executable spreadsheet formulas.

Definitions refer to [measurement.md](measurement.md); do not invent derived values to fill gaps.

## Identity and qualification

- `participant_id`: required unique anonymous key in the private cohort copy.
- `cohort_member`: `yes|no|unknown`; prospectively enrolled in the fixed five. Retrospective exploratory work is `no` unless prior enrollment and comparability can actually be established.
- `eligibility`: `qualified|not_qualified|unknown`; evidence of consent, current real work, and recent substantive handoffs. Failure or no later task does not change qualification.
- `eligibility_basis`: short non-identifying rationale; detailed timing/frequency and consent evidence remain in the private record.
- `evidence_class`: `participant_real|instructed_exploratory|example|developer_qa|unknown`; initial exposure can be instructed and still prospectively observed real participant work. This class does not determine later voluntariness.
- `instruction_ref`: private identifier/version of instructions actually received, including deviations. Never substitute protocol v1 for Ravi's original instructions.
- `first_build`: independently verified initial commit/release identifier or `unknown`; not the currently inspected repository version by default.
- `environment_ref`: opaque reference to private URL/browser/device/auth/assistant evidence, including later build changes.
- `task_ref`: private ID of initial participant-chosen deliverable; retain the same ID for retries.

## Baseline and clocks

- `baseline_method`: `observed|recalled|rehearsal|unknown`; rehearsal is not a natural measured baseline.
- `baseline_active_min`: active effort for the comparable completed baseline. Record recalled uncertainty privately. Blank when unavailable.
- `baseline_comparability`: `comparable|limited|incomparable|unknown`; consider task complexity, prepared inputs, assistant, endpoint, quality, and learning effects.
- `task_started_utc`: initial task start when participant first opens Relay for the work.
- `initial_attempt_end_utc`: completion or stop before optional rescue. Record any scheduling constraint; there is no speed threshold. Interventions during the attempt remain recorded.
- `session_end_utc`: `t0`, end of initial session including optional rescue and debrief. Unknown times stay blank with uncertainty in limitations.
- `window_end_utc`: derived `session_end_utc + 336 hours`. Never reset after retry, reminder, help, or deploy.
- `observed_through_utc`: time through which use/non-use evidence covers behavior, not date of data entry. Record source and uncertainty privately.
- `window_status`: `open|mature|unknown|withdrawn`; mature requires elapsed cutoff and established behavioral coverage through it. A confirmed early return can coexist with an open window.

## Initial task result and effort

- `core_completion`: `independent|assisted|incomplete|unknown`; independent meets **all M1** stages in initial attempt with zero substantive interventions, including any personalized preparation beforehand. A later rescue cannot upgrade the initial result.
- `intervention_count`: substantive helper interventions before/during the initial attempt. Record optional rescue separately in the private stage record; assistance remains visible in interpretation.
- `intervention_active_min`: helper active time for those interventions, reported separately from participant time. Shared troubleshooting also counts in the participant's own active time; do not sum these as if disjoint.
- `relay_active_min`: participant active minutes from task start through initial attempt end, including setup, fact work, errors, and retries. No speculative amortization.
- `relay_wait_min`: system/assistant wait with no participant work; do not overlap active time.
- `relay_interruption_min`: unrelated interruptions during the initial task; retain elapsed time accounting.
- `retry_count`: repeated attempts at a failed/confusing step within the initial task. A retry is not another participant or voluntary return.
- `output_usefulness`: `usable_unchanged|usable_after_edits|unusable|unknown`; judged against participant's stated real task. “After edits” includes corrections during Relay use, whose time counts.
- `reuse_status`: `retrieved_only|prepared_unchanged|prepared_changed|reported_sent|not_reused|unknown`; preparation may be unsent. `reported_sent` requires private corroboration/report, not a Ready label. Record exact-wording comparison separately when reported sent.
- `net_active_min_saved`: `baseline_active_min - relay_active_min`, **only** for a completed comparable endpoint with known times. For recalled baselines it is an estimate. Leave blank for limited/incomparable work, rehearsal, incomplete attempt, or missing timing. Never infer savings from waiting time.
- `benefit_summary`: concrete preserved material or step avoided, plus any quality tradeoff; “none” is a valid reported finding.
- `friction_summary`: dominant observed blocker, added work, or error; detailed stage counts/time in the private log.

## Return and interpretation

- `return_class`: `voluntary_distinct|reminded|same_task_retry|visit_only|example|developer_qa|outside_window|none_confirmed|unknown`. Use `voluntary_distinct` if at least one M2-qualified return exists, with its evidence. Otherwise summarize the best-established nonqualifying activity and retain **every** attempt in the private log. `none_confirmed` requires mature coverage and a supported report of no activity; silence is `unknown`.
- `first_qualifying_return_utc`: first M2-qualifying substantive handoff transfer in `(t0, t1]`, not first page view or initial instructed use. Blank unless qualified evidence exists.
- `return_task_ref`: distinct purpose ID for that qualifying handoff; may concern the same job but not the same deliverable/retry. Blank without a qualifying handoff.
- `return_trigger`: `preserved_research|saved_facts|accepted_wording|other_value|social_or_novelty|reminder|unknown`; based on open-ended report. The underlying later-work record distinguishes motive, task independence, and actual preserved benefit. Do not classify socially prompted work as voluntary.
- `return_core_completion`: `independent|assisted|incomplete|unknown`; result of the first qualifying return, separate from the fact of return. Blank if none qualifies.
- `return_active_min`: actual participant active effort for the first qualifying subsequent task through completion/stop, including new setup and corrections. Blank if unmeasured or no qualifying return.
- `return_benefit_summary`: what was retrieved and which work was avoided or added on that subsequent task; blank if unavailable.
- `reminder_count`: in-window requests to use/return, including incentives; log exact timing, source, and wording privately. Unknown count stays blank; do not assume zero.
- `subsequent_opportunity`: `yes|no|unknown`; whether different real handoff work arose within the window, regardless of tool used. Does not remove a qualified non-returner from the denominator.
- `evidence_ref`: opaque private reference to stage/visit record; identifies observed versus reported versus record-corroborated evidence there. Never a public link to private research.
- `limitations`: timing uncertainty, unobserved behavior, changed versions, instruction deviations, missing stage evidence, relationship bias, or incomplete qualification. Make unresolved cases visible.

## Reconciliation before a decision

There must be no duplicate participant IDs. Check chronological timestamps and exact 336-hour windows; a qualifying return requires cohort eligibility for threshold counting, a distinct task, concrete transfer evidence, and no preceding disqualifying prompt. Require all M1 stages and zero interventions for independent completion. Check `active + wait + interruptions` against the initial task elapsed minutes and explain discrepancies privately. A `reported_sent` result alone cannot establish unchanged accepted wording or retained use. Inspect unresolved fields instead of converting blanks to zeros. Summarize both thresholds against the fixed five and disclose ineligible/exploratory sessions separately.
