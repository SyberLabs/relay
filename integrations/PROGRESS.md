# Save progress with ChatGPT, Codex, or Grok Bot

Use Relay alongside the assistant you already work in. The first users are Seth, Mateo, and Ravi; the purpose is less repeated work and more completed, worthwhile applications. A saved draft or an agent's success report is not a submitted application or demonstrated hiring improvement.

## Signed-in browser workflow

1. Open Relay through its normal sign-in gateway. Use fictional records for a first connection test. Keep the authenticated tab available to your assistant's computer-use tools.
2. Open an application. Read its saved draft, blocker, profile context, and history. If the browser exposes Relay tools, `relay_read_workspace` and `relay_read_profile` are available; use selected-application context when that capability is present. Tool availability depends on the browser and assistant, not just Relay's source code.
3. Save newly written material for review using the ordinary draft editor or `relay_stage_draft`. This does not accept the draft. Check the wording and evidence yourself before exact acceptance.
4. To record completed work or a nonblocking next action, enter a **Progress note** and click **Save progress only**. The note is saved in **Your review history** and does not prevent acceptance. Use **Blocker or missing fact** only for an actual unresolved condition; this save also applies explicit edits to that field. Preserve existing blockers until deliberately resolved; do not infer resolution from a note. Unsaved draft edits stay in the editor. Saved wording, exact acceptance, and application status stay unchanged.
5. A compatible browser assistant can instead call `relay_save_progress` with the owned job's current `id` and `version`, a new `operation_id`, a short `note` describing completed work or a nonblocking next action, and the explicit `blocker` for unresolved conditions only. Copy the current blocker unchanged unless deliberately updating or resolving it; empty clears it. Review reminders belong in `note`, not `blocker`. Save only meaningful steps. Never put credentials or provider tokens in progress notes.
6. In a fresh session, read the application again. **Progress saved** history retains completed work and nonblocking next actions; the blocker retains the unresolved condition. Recover the saved draft from Relay instead of reconstructing it from the old conversation. This cannot restore browser fields that were never saved or recreate a crashed VM's authenticated browser session.

Ordinary signed-in browser interaction is the fallback when an assistant cannot invoke page tools. It uses the same authenticated endpoint and avoids user file transfer. A tool-registration fixture does not prove that Grok, ChatGPT, or Codex can discover and invoke those tools in a particular installed environment. Test the actual path before claiming it works there. The existing CLI remains local-only; do not point it at a deployment or substitute a deployment service token for user sign-in.

## Refusals and uncertain outcomes

Every save includes a version. If another editor changed the application, reload and inspect current work before deciding what to save; do not relabel stale work as current. Progress cannot accept a draft, update facts, change application stage, or send anything.

Each progress operation has a unique identifier. If its response is lost, a deliberate repeat with exactly the same identifier and input reconciles the result without duplicating the event or changing the job again. Reusing the identifier for different input is refused. A successful replay describes the original operation; read again to see newer work. The browser reuses the pending identifier for an unchanged retry. There is no automatic mutation retry.

Authentication, CAPTCHA, quota, storage, and unavailable security dependencies still apply. Browser tool errors include the HTTP status and available verification/retry information. Resolve the refusal first; CAPTCHA never raises a quota. Progress saves use the existing mutation budget and event storage cap. Do not save on every keystroke or heartbeat.

Relay's exact approval applies inside Relay. An external assistant with a signed-in email or application website may have other capabilities; this integration cannot enforce permissions on those websites. A named drafting bot is not an isolated permission boundary. This change provides no sender or background runner.

## Bounded acceptance exercise

Use three fictional applications: an ordinary draft, an essay missing one fact, and interrupted work. Save the ordinary draft for review; record the essay's precise question while continuing the other job; record the last completed step before ending the session. In a new session, retrieve all three and continue from the saved materials. Verify accepted wording and application stage survive a progress update, stale/foreign-owner writes fail, and an exact replay adds no second event.

Record whether the actual assistant used browser controls or a registered tool, the tested commit and environment, and any human intervention. Automated local tests prove bounded behavior; they are separate from real Cloudflare Access, actual Grok/ChatGPT/Codex compatibility, human approval, and throughput evidence.

Then compare each person's normal workflow with and without Relay on comparable real applications. Include setup, review, corrections, and recovery in active time; count attempted and confirmed completions separately. Measure before expanding volume or raising quotas. Commercial adoption and payment experiments do not gate this personal-use result.

## Engineering contract

Tracked in [#101](https://github.com/SyberLabs/relay/issues/101), complementing [#99](https://github.com/SyberLabs/relay/issues/99)'s selected-application context. `POST /api/workspace` with `action: progress` accepts one job/version, bounded operation identifier, nonblank note (up to 4,000 characters), and blocker (up to 4,000 characters). It atomically records one event and updates only the blocker, job version, and update time. Existing owner-scoped event limits apply; no schema, provider, background operation, or new authentication path is introduced.

The operation inherits the production gateway, authenticated-user/global quotas, bounded request bodies/work/storage, CAPTCHA, and fail-closed refusals in [abuse controls](../docs/abuse-controls.md). Refused requests cannot update the job or append history. No paid upstream work occurs. Any later funded execution still requires atomic currency reservations, bounded retries/concurrency, idempotency, and a kill switch. Peer merge review and production approval remain separate.
