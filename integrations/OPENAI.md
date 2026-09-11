# ChatGPT and Codex with Relay

Use your existing assistant to prepare wording, then return it to Relay's review record. **Seth Carlson is Relay's lead engineer.** These integrations do not accept drafts or send applications.

ChatGPT/Codex computer use can also work directly in a signed-in Relay tab. See [saved progress and recovery](PROGRESS.md) for the shared browser controls and optional page tools, including progress-only updates that preserve accepted wording. Actual tool support must be checked in the chosen assistant/browser; the local CLI is not a production connection.

## ChatGPT or Codex: prompt and file handoff

1. Select a job in Relay and open **Prepare this job for an assistant**.
2. Enter facts you have confirmed in **Facts to share for this draft**. This separate, unsaved text box does not select from your saved ledger. Choose **Prepare for ChatGPT** or **Prepare for Codex**.
3. Review the downloaded prompt, then paste its contents or attach it to your chosen assistant. It contains only the selected job, visible draft and supplied facts.
4. Save the assistant's JSON response as `relay-result.json` (without Markdown fences), then choose **Load research or draft** in Relay.
5. Review the wording and facts. Save it or explicitly accept it in Relay. If the job changed, prepare a fresh handoff.

This is an explicit prompt/file integration, not a ChatGPT app installation, account connection, background sync or hosted MCP endpoint. It needs no API key in Relay. Your chosen assistant's account and data settings apply when you share the prompt. Loading checks draft format, job identity and version, not citations or factual accuracy. Workspace saves do not run the separate agent draft-log citation check. Check every claim before accepting exact text.

For a Codex task with repository and packet access, ask it to use this guide and the exact selected packet path. The equivalent local commands are:

```sh
node integrations/relay.mjs chatgpt-prompt private-data/packet.json private-data/chatgpt-prompt.md
node integrations/relay.mjs codex-prompt private-data/packet.json private-data/codex-prompt.md
```

If your assistant returns plain text instead of JSON, save the text, then package it with the original packet:

```sh
node integrations/relay.mjs chatgpt-draft private-data/packet.json private-data/draft.txt private-data/chatgpt-result.json
node integrations/relay.mjs codex-draft private-data/packet.json private-data/draft.txt private-data/codex-result.json
```

Use the command matching the assistant that prepared the text. Provider labels record the selected workflow; they are not cryptographic proof of authorship.

## Codex: prepare a draft through the CLI

Install and sign in to the [Codex CLI](https://developers.openai.com/codex/cli/). Use a version supporting `exec`, `--ephemeral` and `--output-schema`. Download the selected job packet from Relay, then run:

```sh
node integrations/relay.mjs codex-run private-data/packet.json private-data/codex-result.json
```

The adapter invokes `codex exec` with a read-only sandbox, a temporary working directory, a three-minute timeout and structured output. It passes the selected packet through standard input, uses your existing CLI authentication and configured model, then constructs the Relay result locally. Account usage applies. Your Codex configuration, enabled integrations and account data policies still apply; the read-only sandbox is not a privacy boundary for files or connected tools. The prompt instructs Codex to draft only from the supplied context and not use tools.

Relay never asks Codex to decide the target job or acceptance state. It preserves the original job identity and version, checks the returned draft, removes the temporary handoff files, and refuses to overwrite an existing output. CLI errors, incomplete output or invalid JSON stop the handoff. `--ephemeral` does not imply provider-side data deletion.

Load the resulting JSON in Relay. A mismatched job or stale version is rejected, and wording always enters the editor for review. Existing draft acceptance remains governed by Relay's normal save and accept rules.

## Verification

`node --test tests/assistant.test.mjs` covers prompt selection, output validation, job/version binding, overwrite refusal and CLI failure cleanup. A real local Codex CLI round trip with fictional data also passed Relay's file validation on September 5, 2026. The ChatGPT browser handoff has not been exercised in a signed-in browser. See the [release verification record](../docs/OPENAI-RELEASE.md).

OpenAI documents [non-interactive execution, structured output and saved CLI authentication](https://developers.openai.com/codex/noninteractive/). A future [hosted ChatGPT/Codex plugin](https://developers.openai.com/apps-sdk/build/mcp-server/) would additionally need a deployed endpoint and authenticated, authorized access to Relay; this release does not provide one.

## Optional Relay-funded Agents API runtime

Relay can create an OpenAI Agents API session bound to the signed-in owner and a job (`/api/agents`, #183). That path is **off** unless `RELAY_AGENTS=memory` (scripted, no upstream) or `RELAY_AGENTS=live` with `RELAY_AGENTS_LIVE=1` and a Worker secret `OPENAI_API_KEY`. Live uses `environment.type: none` (no hosted sandbox). OpenAI currently stores session state in the United States and does not support Zero Data Retention. The agent may only call `relay_read_job`, `relay_request_answer`, `relay_prepare_application`, and `relay_record_progress`. It cannot verify facts, accept drafts, authorize send, or `begin`. Human Accept and the browser operative remain the send path. This is not the ChatGPT file handoff above and is not claimed in public copy until live is actually enabled.
