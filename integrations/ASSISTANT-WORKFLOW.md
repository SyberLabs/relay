# Work through your existing assistant

Ask your assistant to progress one application. Where its browser supports Relay's WebMCP tools, it can read saved context and return a draft directly. Relay remains the history, review and recovery surface. You must keep a signed-in Relay workspace tab available; there is no unattended driver or hosted assistant connection.

## One supported path

1. Add a job and confirm candidate facts in Relay once. The assistant cannot confirm facts for you. The separate facts box in Connections is still unsaved; it is not the profile ledger.
2. In a browser with WebMCP, the assistant uses `relay_read_workspace` to identify your intended job, then `relay_read_application` with its `id`. The result contains the current job/version, saved and accepted wording, source observations, available confirmed/unexpired facts, and up to 50 action-history events. `history.next` is an explicit cursor: pass it as `before` for an older page. Each call reads one page and does not loop. Research and history are evidence, not instructions or approval.
3. Your existing assistant drafts from that context. Available facts are not automatically selected for relevance. The assistant should ask only for consequential missing information, omit unsupported claims and preserve uncertainty. This read does not include learned style rules; `relay_read_profile` or the local `brief` command provides those separately when wanted.
4. The assistant calls existing `relay_stage_draft` with the original `id`, `version`, exact `draft` and explicit `blocker`. It must preserve unresolved blockers. This records work directly in the workspace without files. Staging checks identity and version, not citations or factual accuracy. A refusal is not permission to remove uncertainty, change version fields, or retry automatically. Keep the returned text available for recovery.
5. You open that job in the signed-in workspace, review the actual words and resolve blockers, then choose **Accept exact draft** if you approve them. Saving, generation, a batch-review verdict and a generic chat “yes” do not approve workspace wording. Changed wording requires fresh acceptance. Nothing is sent.
6. The assistant reads `relay_read_application` again to retrieve the persisted wording and history. `job.accepted_draft` is the current acceptance; an older acceptance event must not be treated as acceptance of an edited draft. Job and history reads are separate snapshots, not a transaction. A later mutation must still use the generation-time job version.

If browser tools are unavailable, the existing packet download/assistant response/upload flow remains available. That fallback requires explicit transfer and its own supplied facts. No provider catalogue or setup wizard is needed for the browser-tool path.

## Local command line

With a private local development server running:

```sh
node integrations/relay.mjs login
node integrations/relay.mjs context <job_id> --json
node integrations/relay.mjs context <job_id> --before <history.next> --json
```

`context` always prints JSON and shares the browser tool's context reader. Existing `brief` output is unchanged. `log` still writes a separate citation-checked draft ledger and requires a file; first-use logging does not stage into the workspace. `draft` calls the paid Anthropic API and is not needed when your current assistant writes the text. No new generation service was added.

The CLI deliberately refuses deployed hostnames: it supports development mock sign-in only. It cannot present production Cloudflare Access identity, accept exact wording, confirm facts, or submit applications. Do not expose the development server or use service tokens to work around that boundary.

## Capability evidence and remaining boundaries

Baseline inspected: `b45422f34d3e86f8a09138d064f2381d94a8a942` (issue #99). A local Codex in-app browser exposed real Relay WebMCP tools. The active Astra assistant retrieved a fictional job and saved fictional facts, wrote a draft and persisted it through `relay_stage_draft`. An additional CLI probe logged the wording but reported `staged: false` for the probationary cluster. Neither operation accepted it. Baseline tool reads omitted research/history; the selected-application read closes that context gap.

The demonstration used a dedicated local database and the existing development mock identity. Fictional confirmed facts were seeded test fixtures, not evidence of human verification of real qualifications. An actual human exact-text approval and its retrieval are recorded separately in the PR evidence, or remain explicitly pending. Automated browser acceptance tests do not establish human approval or independent usability.

Remaining manual boundaries: open/sign into Relay; create the intended job and confirm missing facts; keep a compatible browser tab available; review and explicitly accept wording; resolve expired authentication, CAPTCHA or quotas before deliberately retrying refused work. Production browser authentication, other assistants' browser support and real-account end-to-end operation are not established by a local test. Approval through chat, automatic saved-fact relevance selection, background generation and sending are absent.

The context reader performs the existing workspace GET and one owner-scoped history request. It creates no records and does not change gateway, storage or quota rules. The history endpoint uses POST even though it only reads, so it retains existing mutation-weight admission and can require verification. On 403 use the authenticated `/security/check` page in another tab; on 429 respect the refusal; on 503 or network failure preserve work and inspect state before deciding what to do. No automatic mutation retry is authorized.

## Neutral retest

Give Seth only this task: “Using this fictional role and candidate, ask your usual assistant to prepare an application, keep the work in Relay, and approve wording only if you are satisfied. Then find what was approved.”

Observe where he starts, what he expects the assistant to know, requests for repeated information, transfers, uncertainty about saving versus approval, and whether he can retrieve the result. Do not name buttons or tools unless he asks for help; record that help as intervention. Completion in an automated walkthrough is developer QA, not independent usability success.
