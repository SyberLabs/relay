# Relay integrations

Relay connects a job record to the tools you choose through explicit file, command, or signed-in browser handoffs. The selected job and current version travel with draft work. Relay refuses stale saves; it does not verify every claim or accept wording for you.

## Import research

- **Tracker CSV:** In the workspace, map the company, role, posting URL, status, and notes columns, preview selected rows, then import. New jobs start Held. Imports add research and preserve existing Relay status and accepted text. The [fictional CSV](../tests/fixtures/tracker-example.csv) is a test fixture, not an export from a real account.
- **Notion:** With a read-only integration, run `node integrations/relay.mjs notion-pull private-data/notion.json`. Import the resulting JSON through the selected job's research panel. The command reads at most 100 records per request and uses a continuation cursor for the next page.
- **Obsidian:** Use the connection panel to create or import selected Markdown notes, or run `obsidian-pull note.md [another.md ...] output.json`. Draft files can be edited with `obsidian-draft packet.json output.md`. See the [Obsidian guide](OBSIDIAN.md).
- **Grok Bot:** Use `grok-research rows.json output.json` to validate research rows before import. See the [Grok guide](GROK_BOT.md).

Imports are evidence only. They do not accept text, authorize an application action, or replace an existing application state.

## External assistant handoffs

Choose **Prepare for ChatGPT** or **Prepare for Codex** in the connection panel and return the assistant's JSON for review. The packet contains the selected job, visible draft, and facts entered for that handoff. See the [ChatGPT and Codex guide](OPENAI.md).

The `claude-draft packet.json output.json` command sends the selected packet to Anthropic using `ANTHROPIC_API_KEY` and `RELAY_CLAUDE_MODEL`; this can incur API charges. It uses the supplied packet, not the full Relay database. A generated draft is unverified and remains unaccepted.

For the local CLI, Claude Code, or a Grok Bot VM, see the [assistant workflow](ASSISTANT-WORKFLOW.md). WebMCP tools are available only in a signed-in browser that exposes them. Do not export session cookies or treat installing this repository in another machine as a connection to Relay.

## Local Relay CLI

Start `pnpm dev`, then use:

```sh
node integrations/relay.mjs login
node integrations/relay.mjs brief <job_id> --json
node integrations/relay.mjs context <job_id> --json
node integrations/relay.mjs stage <job_id> draft.txt --version <generation-time-version> --blocker= --json
node integrations/relay.mjs outcome <job_id> submitted --receipt "confirmation reference"
```

The CLI accepts only a local `RELAY_URL`; production identity comes from a trusted gateway. Its session is kept in ignored `private-data/.session`.

`stage` saves the exact UTF-8 file against the version used to prepare it. A stale version is refused; retrieve current state and reassess the draft instead of changing the version to force it through. Staging is not acceptance. `outcome` records the current version; a submitted outcome requires a receipt. Terminal outcomes require `--yes` because they close the job. Never retry a mutation automatically after an uncertain response.

Exit codes: `0` success, `1` usage/configuration error, `2` not signed in, `3` refused input or stale version, `4` server/network failure, `5` nothing to do. `--json` writes result data to stdout and diagnostics to stderr.

The CLI does not accept drafts or submit applications. Accepting exact wording does not authorize sending. A separate application action requires human Inspect approval before an external browser receives a one-use permit. Relay itself does not POST the employer form. The included Chrome operative is demonstrated only against a fictional fixture. See the [application coordination contract](../docs/agent-applications.md) and [operative guide](../extensions/operative/README.md).

## Privacy

Use ignored `private-data/` for real packets and responses. Keep credentials in environment variables, not prompts, committed files, or screenshots. External assistants, Notion, and Obsidian receive only information you hand off or expose through the signed-in browser tools. Relay has no background account synchronization. Connector tests use mocked vendor responses and do not prove access to a live account.
