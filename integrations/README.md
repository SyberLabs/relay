# Relay integrations

Relay uses local commands and explicit file handoffs. You choose which data leaves your workspace. The command tool works in a Grok Bot VM, Claude Code terminal, or a normal shell. It needs Node 24; it does not require a hosted Relay API token.

## Notion → Relay

Create a Notion internal integration with read access and share the intended data source with it. Set `NOTION_TOKEN` and `NOTION_DATA_SOURCE_ID` in the environment, then run:

```sh
node integrations/relay.mjs notion-pull private-data/notion-page-1.json
```

Upload the resulting JSON with **Connect Obsidian, Grok Bot, Notion & Claude → Load research or draft**, then preview and import. The source needs `Name` (title), `Job` (URL), `Status` (status/select), and `Notes` (rich text). Accepted statuses: Held, Ready, Submitted, Skip, Live loop. Unknown statuses stop the import; map them deliberately in your source first.

For different property names, set `RELAY_NOTION_FIELDS` to a JSON object such as `{"name":"Company","job":"Posting","status":"Stage","notes":"Research"}`. Each command fetches at most 100 source records. If more exist, the command prints a continuation cursor: set `NOTION_CURSOR`, use a new output filename, and repeat until no cursor is printed. No automatic polling or Notion writes occur.

## Obsidian ↔ Relay

Create job-specific research, interview and follow-up notes; import selected Markdown notes together with a readable preview; and edit a version-bound draft in Obsidian before returning it to Relay for review. Download job context with its source observations as a reference snapshot. Research cannot change existing status or approval, and snapshots cannot be reimported.

Open Relay's connection panel to start. No Obsidian plugin, credentials, vault scanning or background sync is required. The browser supports Markdown directly; local commands also support `obsidian-pull note.md [another.md ...] output.json` and `obsidian-draft packet.json output.md`.

See [Obsidian workflows](OBSIDIAN.md) for the complete setup, formats, review steps, limits and recovery. See [architecture](../ARCHITECTURE.md) for data ownership and trust boundaries. Automated tests use fictional notes; an installed Obsidian app and Sync round trip remain unverified.

## Claude → a reviewable draft

Local checklist (env var names only; never commit values or put keys in the repo):

1. Download a job packet from the connection panel (verified facts filled in).
2. Export `ANTHROPIC_API_KEY` for your Anthropic API account.
3. Export `RELAY_CLAUDE_MODEL` to a model that account can call.
4. Run the command below. Load the result in Relay; loading is not acceptance.

```sh
node integrations/relay.mjs claude-draft relay-packet.json private-data/claude-draft.json
```

This sends the selected job, supplied facts and visible draft to Anthropic and incurs normal API charges. It sends no other workspace records. Load the result in Relay, check the claims and wording, and save it. Loading is not acceptance; generated claims are not verified automatically. API errors or incomplete model responses produce no output file. Existing output files are never overwritten. Your Claude chat subscription is not used by this API connector.

## Grok Bot → Relay

Install this repository in the Bot's VM and give it [GROK_BOT.md](GROK_BOT.md). No proprietary Grok Bot API is assumed. This is a command/file adapter, not automatic remote control of an installed Bot.

For research, ask the Bot to write records in the schema in `lib/seed.json`, then run:

```sh
node integrations/relay.mjs grok-research research.json private-data/research-checked.json
```

For drafts, give the Bot a downloaded job packet, have it write plain text, then run:

```sh
node integrations/relay.mjs grok-draft relay-packet.json draft.txt private-data/grok-draft.json
```

Load the output file in Relay. The packet's job identity and version must still match; otherwise download a fresh packet. This prevents loading an old draft into a different job. The adapter validates structure, not the truth of research or generated text. A supported browser may also expose Relay's optional WebMCP read/preview/stage tools; that path has not been tested in a Grok Bot session.

## Privacy and operation

Use the ignored `private-data/` folder for real packets and responses. Keep credentials in environment variables, never in prompts, committed files, or screenshots. The browser does not store API keys. Commands do not send messages, submit applications, or silently approve drafts. Do not expose the local development server publicly: its sign-in is a development mock.

Connector tests use mocked vendor responses. Real-account Notion and Claude calls, and an installed Grok Bot journey, still require your credentials/setup and have not been verified for this release.

Official references: [Notion data sources](https://developers.notion.com/reference/data-source), [Notion API upgrade guide](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03), [Claude API overview](https://platform.claude.com/docs/en/api/overview).
