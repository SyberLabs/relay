# Relay pilot: does preserved context earn its keep?

Owner: Seth (`@sdcarlson`). Decision record: [issue #5](https://github.com/SyberLabs/relay/issues/5). Protocol v1, prepared 2026-09-06. **No participant results are supplied. Relay's value remains unvalidated.**

## Provisional decision

Test this loop: **one real job → selected candidate facts → external-assistant handoff → human review and exact acceptance → reuse for an application or follow-up.** Keep this as the provisional MVP while product work proceeds. Do not make research completion a dependency for the remaining product work or for verified-fact gating and selection/outcomes work (#47 and #48).

The participant already moves substantive job-application work between assistants and notes or a tracker. Qualify before observing Relay: they consent, are doing a real application or follow-up now, and can describe at least two recent real handoffs in the last 30 days involving an external assistant and another assistant, notes, or a tracker. Merely browsing jobs or trying chatbots does not qualify. Record the actual tools, frequency, and steps privately. Do not require dissatisfaction, praise, or a promise to return. Record expected upcoming tasks separately; lack of a later opportunity is an interpretation constraint, not a retrospective exclusion.

The recurring problem to test is the effort of reconstructing source context, selecting trustworthy candidate facts, or locating the exact wording already reviewed. The baseline is the participant's actual chats, copying, notes, files, and tracker, including a baseline that works well. The expected benefit is less reconstruction, retyping, or repeated review with an equally useful output. All Relay setup, fact verification, transfers, errors, and review count as effort. A new tracker or a better-sounding AI paragraph does not by itself validate preserved context.

Exclude automatic sending, account synchronization, new integrations, job discovery/ranking experiments, hiring-outcome attribution, billing implementation, and runtime telemetry. Use the existing issue and board for work; these files are study instruments, not a second task system.

## Use the instruments

1. [First-session protocol and observation record](first-session.md): one participant-chosen real task, neutral prompts, timed stages, intervention log, and later-work record.
2. [Ravi debrief](ravi-debrief.md): reconstruct the already instructed test without changing its instructions or assuming a version.
3. [Empty cohort CSV](cohort.csv) and [data dictionary](data-dictionary.md): one summary row per anonymous participant, filled only in a private copy.
4. [Measurement specification](measurement.md): exact definitions, current evidence sources, gaps, and observation-window arithmetic.
5. [Product task status](next-product-tasks.md): ordinary job entry is implemented; saved-fact selection in a version-bound handoff remains.

Only empty instruments belong here. Keep consent/contact mappings, completed records, real posting URLs, candidate facts, drafts, screenshots, receipts, and raw events outside Git in participant-approved private storage. Anonymous IDs do not make detailed job histories safe to publish. Publish only a separately checked, non-identifying decision summary in #5.

## Predeclared rules

Enroll five qualified, consenting participants in chronological order before their first attempt; lock membership without selecting for success. Count each person once. Developer QA and example-data sessions are separate from this cohort. Ravi is not automatically an enrolled or qualified participant; use the debrief to establish what can actually be compared. A retrospective session with unverified timing, assistance, or materially different instructions remains exploratory.

- **Completion:** at least **3 of 5** complete the core handoff without developer intervention in their initial session, as defined in [measurement.md](measurement.md).
- **Return:** at least **2 of the same 5** voluntarily return for a **different real handoff within 14 days**. The return denominator includes initial non-completers. A return requires substantive handoff use, not a visit; record subsequent completion separately.
- Both are necessary learning thresholds to continue this product focus. They are not proof of product-market fit, time savings, or willingness to pay. Concrete benefit and actual cost still need explanation even if both pass.

For each person, the return interval is **(end of initial session, end of initial session + 336 hours]**, measured in UTC. Include the endpoint, exclude activity during the initial session. Never restart this clock after help, a retry, a deploy, or a reminder. An incomplete or unknown window cannot be called a non-return; show confirmed counts and unresolved cases against the planned five. Full interpretation rules live in the measurement specification.

## Continue / change / stop

At all five completed observation windows, Seth records the counts, evidence gaps, dominant friction, actual effort comparison, reasons for return/abandonment, and one decision in #5. If evidence is incomplete, label the decision provisional and use the bounds in the measurement specification; do not announce a failed threshold from censored observations.

- **Cannot complete:** change the dominant observed friction before adding integrations. Rank friction first by the number of distinct participants blocked, then by active minutes lost; keep severity and data-loss concerns visible. Specify one change and a prospective retest. Do not recast assisted rescue as initial success.
- **Completes but does not return:** investigate whether Relay adds unnecessary copying, setup, or bookkeeping, whether another real task arose, and why the baseline won. If preservation does not remove a recurring cost, stop this hypothesis or change the problem before adding integrations.
- **Returns for preserved context or wording:** when both thresholds pass and participants identify concrete preserved material that reduced work, continue and deepen that demonstrated value. Returns for politeness, novelty, or an unrelated feature do not establish the proposed mechanism. Passing counts without that evidence calls for changing the hypothesis, not expanding the product by default.
- **Stop:** if adequately observed qualified participants prefer their baseline, cannot name useful preserved material, or Relay's added effort outweighs its benefit without a clear bounded fix, stop investment in this product focus. Do not manufacture a numerical savings threshold after seeing results.

Decision note to fill privately, then sanitize: `As of ___; qualified ___/5; initial independent completion ___/5; voluntary distinct handoffs ___/5; mature windows ___/5; unknown ___; reminders ___; comparable effort pairs ___; concrete benefit ___; dominant friction ___; continue/change/stop ___; reason ___; next bounded action in existing issue ___`. No outcome is entered in this repository now.

## Later willingness-to-pay interview / offer draft

Use only after the 14-day window, so the interview or offer cannot induce a counted return. This is an unsent draft, not an instruction to contact anyone or collect money.

Ask: “Tell me about the last time you used Relay on your own. What did you retrieve, what work did that avoid, and what did maintaining Relay cost? What would you do if access ended today? Which tool or expense, if any, would you replace? What have you actually paid for comparable help?” Then ask: “What would make paying for this a poor decision?” Record refusals and the baseline they choose.

Concrete offer to use later only if Seth can deliver and separately authorizes it: “For **US$10 total**, would you buy **30 days of Relay access** to preserve research and reviewed drafts across the external assistants you already use? No automatic applications, no automatic renewal, and no concierge drafting are included. You keep your existing assistant subscriptions. If the service is unavailable, we will refund the purchase. You can decline without affecting our relationship or your feedback.” Before use, Seth must confirm the service can support those terms and provide an actual checkout; do not imply checkout or paid service exists today.

Keep separate: hypothetical interest; agreement to this price; requested checkout; actual payment received (amount/date, private receipt); refund; subsequent paid use. Only a completed charge is payment evidence, and refunded payments must be reported. A friend's yes, a free pilot, or willingness to click a future checkout is not a sale.
