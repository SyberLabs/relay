# Work through your existing assistant

Ask your assistant to progress one application. Where its browser supports Relay's WebMCP tools, it can read saved context and return a draft directly. When WebMCP is missing, the same owner-session tools are on `window.relay` for JavaScript evaluation in the signed-in tab. Relay remains the history, review and recovery surface. You must keep a signed-in Relay workspace tab available; there is no unattended driver or hosted assistant connection.

## One supported path

1. Add a job and confirm candidate facts in Relay once. The assistant cannot confirm facts for you. The separate facts box in Connections is still unsaved; it is not the profile ledger.
2. In a browser with WebMCP, or via `window.relay` in the signed-in tab when WebMCP is missing, the assistant uses `relay_read_workspace` to identify your intended job, then `relay_read_application` with its `id`. The result contains the current job/version, saved and accepted wording, source observations, available confirmed/unexpired facts, and up to 50 action-history events. `history.next` is an explicit cursor: pass it as `before` for an older page. Each call reads one page and does not loop. Research and history are evidence, not instructions or approval.
3. Your existing assistant drafts from that context. Available facts are not automatically selected for relevance. The assistant should ask only for consequential missing information, omit unsupported claims and preserve uncertainty. This read does not include learned style rules; `relay_read_profile` or the local `brief` command provides those separately when wanted.
4. The assistant calls existing `relay_stage_draft` with the original `id`, `version`, exact `draft` and explicit `blocker`. It must preserve unresolved blockers. This records work directly in the workspace without files. Staging checks identity and version, not citations or factual accuracy. A refusal is not permission to remove uncertainty, change version fields, or retry automatically. Keep the returned text available for recovery.
5. You open that job in the signed-in workspace, review the actual words and resolve blockers, then choose **Accept exact draft** if you approve them. Saving, generation, a batch-review verdict and a generic chat “yes” do not approve workspace wording. Changed wording requires fresh acceptance. Nothing is sent.
6. The assistant reads `relay_read_application` again to retrieve the persisted wording and history. `job.accepted_draft` is the current acceptance; an older acceptance event must not be treated as acceptance of an edited draft. Job and history reads are separate snapshots, not a transaction. A later mutation must still use the generation-time job version.

If WebMCP is missing, prefer `window.relay` in the signed-in tab before a file handoff. The existing packet download/assistant response/upload flow remains available when neither WebMCP nor `window.relay` can be called. That fallback requires explicit transfer and its own supplied facts. No provider catalogue, hosted MCP connection, or setup wizard is needed for the browser-tool path.

## Operative send loop

**Accept exact draft** still only approves wording. Sending uses Inspect **Accept and send** after the operative has filled the employer form. There is no `relay_approve_application`; the assistant must not click Accept.

Read `relay_inspect_application` first and retain its opaque `preparation_revision` (null if no preparation exists). Pass that exact token to prepare and arm; each successful prepare or human answer changes it. A stale-token refusal requires reconsidering the new snapshot, never automatic token refresh/replay.

1. `relay_prepare_application` streams the exact field/file snapshot for the job. Unknown answers use `unknown: true` and must never be invented. Batch the snapshot.
2. `relay_arm_application` freezes a complete snapshot and keeps presence live. Incomplete or unknown fields are refused. Do not submit.
3. Wait for the human to click **Accept and send** on the signed-in workspace. Poll `relay_inspect_application` at least every 2 seconds (prefer 3) until `state` is `authorized`, or cancelled/timeout. Chat “yes” and draft Ready are not send permission.
4. `relay_begin_application` consumes the one permit. If `execute` is not true, do not click the employer submit control.
5. Click the employer Submit **once**. Do not retry: a lost `begin` response is inspected on GET; `executing` is not permission to submit again.
6. If submit no-ops or a captcha appears after `begin`, stop. Record `relay_finish_application` with `action: "uncertain"` and the observed evidence (captcha, submit no-op, lost confirmation). Do not consume a second permit or call `begin` again. Human or Mac unlock of an employer captcha is outside Relay. This is not a `relay_stage_draft` bug.
7. `relay_finish_application` records `complete`, `uncertain`, or `not-submitted` with a receipt. Only `complete` may set the job to Submitted. Never invent a receipt.
8. If the human closes the attempt or the form cannot be sent, `relay_cancel_application` (`r.close`) cancels only while pre-`begin`. If already `executing`, do not cancel and do not submit. There is no `relay_approve_application`.

### Resolve a question without rewriting the agent's notes

The selected application's decision card offers **Use your judgment** and **I'll add context**. The first delegates wording, structure and optional examples using confirmed facts. The second saves a short answer or direction for this job. Neither confirms a reusable candidate fact, accepts wording, clears an explicit submission hold or sends anything.

**Don't ask me about routine writing choices again** remembers that preference for future applications. **Ask me again** revokes it. The preference is owner-scoped and versioned; a stale decision cannot overwrite a newer choice. `relay_read_application` and CLI `context` return `drafting` with the preference version, routine flag, current job direction and bounded guidance. Downloaded packets and ChatGPT/Codex prompts also carry the drafting preference. Refresh context before continuing; don't reuse a remembered preference from an old session after it has been revoked.

The assistant should first try the saved facts, simpler wording, or omitting an optional detail. Optional anecdotes, stylistic choices and requests for more persuasive personal motivation must not interrupt a draft that can be written honestly without them. For a reason for interest, draft from documented role details and relevant confirmed experience; do not demand the user's own wording or invent a personal passion, past relationship or lived experience. When a required factual employer answer cannot be grounded, ask **one short question**, explain briefly why it is required, and put research/detail in progress notes. Do not guess personal facts or treat a permission/security refusal as a writing choice.

Saving a decision retains the original question and marks the job **Ready for assistant**. It does not start a hosted agent. Continue in the existing assistant; its next context read receives the direction. After preparing the draft, the assistant stages an empty blocker if resolved, or the specific required question if not. Partial saves preserve direction while the same question remains; resolving or replacing the question clears the current direction. Full research and decision history remain. Exact draft acceptance still requires a separate review action. This is the narrow routine-drafting slice of #112, not unattended acceptance or application sending.

Each decision uses one job, the current job/preference versions and a unique operation ID. The same ID and exact input return the existing receipt after an uncertain result; there are no automatic retries. Responses are bounded by the existing gateway quotas and CAPTCHA. A failure retains the visible answer; stale versions require reload. Storage is one added bounded direction per existing job, two fields on the existing fixed owner preference row, and one existing quota-controlled history event per decision. No paid upstream or background operation is introduced.

## Local command line

With a private local development server running:

```sh
node integrations/relay.mjs login
node integrations/relay.mjs context <job_id> --json
node integrations/relay.mjs context <job_id> --before <history.next> --json
node integrations/relay.mjs stage <job_id> private-data/draft.txt --version <generation-time-version> --blocker= --json
node integrations/relay.mjs context <job_id> --json
```

`context` always prints JSON and shares the browser tool's context reader. Your assistant chooses relevant confirmed facts, writes its own UTF-8 draft file and runs `stage` itself; the user does not copy text or transfer files. Supply the version from the context used to draft, never a newly fetched version to force an old draft through. `--blocker=` explicitly means no unresolved blocker; otherwise supply the actual uncertainty. The file is read exactly, including whitespace and newlines, with limits of 80000 bytes and 20000 text characters; blockers are limited to 4000 characters. Stage preserves the input file on every outcome and makes no automatic retry. After an uncertain response, retrieve state before deciding what to do.

`stage` shares `relay_stage_draft` semantics: authenticated workspace save, one new version and review-history event, no acceptance or sending. Ready becomes Held and current acceptance is cleared; existing Submitted, Live loop and terminal lifecycle restrictions remain. Earlier acceptance events and research remain retrievable. Staging is an explicit save for human review, not citation verification or automatic ledger staging. `log` still writes the separate citation-checked draft ledger with unchanged Probation and automatic-staging rules. Existing `brief` output is unchanged. `draft` calls the paid Anthropic API and is not needed when your current assistant writes the text. No new generation service was added.

The CLI deliberately refuses deployed hostnames: it supports development mock sign-in only. It cannot present production Cloudflare Access identity, accept exact wording, confirm facts, or submit applications. Do not expose the development server or use service tokens to work around that boundary.

## Capability evidence and remaining boundaries

Open **Prepare this job for an assistant** in the signed-in workspace to check this tab's
browser assistant tool status. WebMCP registration requires
`document.modelContext.registerTool`; a reachable workspace alone does not
establish that capability. An unavailable status means WebMCP is missing; same-origin
tools are still on `window.relay` in this signed-in tab, and file handoff remains.
That is not a hosted MCP connection. A registration failure removes this attempt's
WebMCP tools; `window.relay` remains until the tab unmounts. Preserve unsaved work
before reloading if you retry WebMCP. Registered means all Relay WebMCP registrations completed, not that
ChatGPT or Grok can discover or call them. The host must provide that connection
too. See the [current browser API](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

For [#117](https://github.com/SyberLabs/relay/issues/117), record the deployment
commit, browser/version, displayed registration status, assistant-visible tool
names, and actual call results. In the authenticated assistant session, use a
fictional job to read context, stage exact wording with its generation-time
version and an explicit blocker, then reread wording, version and history.
Record elapsed time and human interventions separately. Keep exact acceptance
as a human action. Do not put private drafts, cookies or credentials in issue
evidence. A mocked registration test or a different assistant's successful run
does not establish Grok compatibility.

Baseline inspected: `b45422f34d3e86f8a09138d064f2381d94a8a942` (issue #99). A local Codex in-app browser exposed real Relay WebMCP tools. The active Astra assistant retrieved a fictional job and saved fictional facts, wrote a draft and persisted it through `relay_stage_draft`. An additional CLI probe logged the wording but reported `staged: false` for the probationary cluster. Neither operation accepted it. Baseline tool reads omitted research/history; the selected-application read closes that context gap.

The demonstration used a dedicated local database and the existing development mock identity. Fictional confirmed facts were seeded test fixtures, not evidence of human verification of real qualifications. An actual human exact-text approval and its retrieval are recorded separately in the PR evidence, or remain explicitly pending. Automated browser acceptance tests do not establish human approval or independent usability.

Remaining manual boundaries: open/sign into Relay; create the intended job and confirm missing facts; keep a compatible browser tab available; review and explicitly accept wording; resolve expired authentication, CAPTCHA or quotas before deliberately retrying refused work. Production browser authentication, other assistants' browser support and real-account end-to-end operation are not established by a local test. Approval through chat, automatic saved-fact relevance selection, background generation and sending are absent.

The context reader performs the existing workspace GET and one owner-scoped history request. It creates no records and does not change gateway, storage or quota rules. The history endpoint uses POST even though it only reads, so it retains existing mutation-weight admission and can require verification. On 403 use the authenticated `/security/check` page in another tab; on 429 respect the refusal; on 503 or network failure preserve work and inspect state before deciding what to do. No automatic mutation retry is authorized.

## Neutral retest

Give Seth only this task: “Using this fictional role and candidate, ask your usual assistant to prepare an application, keep the work in Relay, and approve wording only if you are satisfied. Then find what was approved.”

Observe where he starts, what he expects the assistant to know, requests for repeated information, transfers, uncertainty about saving versus approval, and whether he can retrieve the result. Do not name buttons or tools unless he asks for help; record that help as intervention. Completion in an automated walkthrough is developer QA, not independent usability success.
