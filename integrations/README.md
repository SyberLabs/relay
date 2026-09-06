# Relay integrations

Relay uses local commands and explicit file handoffs. You choose which data leaves your workspace. The command tool works in a Grok Bot VM, Claude Code terminal, or a normal shell. It needs Node 24; it does not require a hosted Relay API token.

## Tracker CSV → Relay

Use **Import a tracker CSV** in the workspace for a user-managed Simplify export or another comma-separated tracker file. This path needs no account connection or credentials.

1. Export only the opportunities you want to review, or prepare a copy containing those rows. Keep the original export.
2. Choose the file and name the source tracker. Confirm the company, role and employer posting URL columns. Relay suggests recognizable headers but requires you to review them. Map source status and research notes if wanted; all omitted columns are listed.
3. Choose **Preview tracker records**. The file is read locally; only the mapped fields are sent to your Relay workspace for the match preview. Review each title, URL, source status and note. Preview does not save records.
4. Choose **Import … research records** to save the previewed data. Matching URLs add source history to existing jobs. New jobs start Held; existing status, draft and acceptance remain in Relay. The server rechecks matches at import time.

Source status is recorded in the observation's notes. An Applied, Interview, Offer, Rejected, Withdrawn or Ready value never changes Relay status. This is research import, not full pipeline migration or two-way synchronization. Changing a source status creates a new observation; repeating unchanged research does not duplicate it. Keep the source tracker name consistent across exports for stable observation identity. Renaming the source creates a separate source identity. Different roles sharing a company/title are not merged on those names; use the original employer posting URL to match across tools. URLs on different job boards may remain separate.

Files must be UTF-8, comma-separated, smaller than 2 MB, with one unique header row and 1–200 opportunity rows. Quoted commas, escaped quotes and multiline notes are supported. The limit is 50 columns, 500 characters for the combined company/role title and 20,000 for the resulting research including its source label/status. Blank lines are ignored. Missing posting URLs, duplicate headers, malformed rows and oversized values reject the batch with an error; no partial import occurs. Add missing employer URLs to your copy before trying again.

Try [the fictional CSV](../tests/fixtures/tracker-example.csv). These sample headers are a Relay test fixture, not a captured Simplify export. The [Simplify tracker guide](https://help.simplify.jobs/en/articles/2140179-using-the-job-tracker) documents CSV export; compatibility with an actual account export remains unverified. This release claims no Simplify partnership, API access, account sync or application sending.

## ChatGPT and Codex to Relay

Use **Prepare for ChatGPT** or **Prepare for Codex** in the connection panel, then return the assistant's JSON response for review. Codex also supports `codex-run` through your signed-in CLI. [Read the complete ChatGPT and Codex guide](OPENAI.md) for commands, setup and data boundaries. These are explicit handoffs, not an installed hosted ChatGPT app.

## Notion → Relay

Create a Notion internal integration with read access and share the intended data source with it. Set `NOTION_TOKEN` and `NOTION_DATA_SOURCE_ID` in the environment, then run:

```sh
node integrations/relay.mjs notion-pull private-data/notion-page-1.json
```

Upload the resulting JSON with **Connect your tools → Load research or draft**, then preview and import. The source needs `Name` (title), `Job` (URL), `Status` (status/select), and `Notes` (rich text). Accepted statuses: Held, Ready, Submitted, Skip, Live loop. Unknown statuses stop the import; map them deliberately in your source first.

For different property names, set `RELAY_NOTION_FIELDS` to a JSON object such as `{"name":"Company","job":"Posting","status":"Stage","notes":"Research"}`. Each command fetches at most 100 source records. If more exist, the command prints a continuation cursor: set `NOTION_CURSOR`, use a new output filename, and repeat until no cursor is printed. No automatic polling or Notion writes occur.

## Obsidian ↔ Relay

Create job-specific research, interview and follow-up notes; import selected Markdown notes together with a readable preview; and edit a version-bound draft in Obsidian before returning it to Relay for review. Download job context with its source observations as a reference snapshot. Research cannot change existing status or approval, and snapshots cannot be reimported.

Open Relay's connection panel to start. No Obsidian plugin, credentials, vault scanning or background sync is required. The browser supports Markdown directly; local commands also support `obsidian-pull note.md [another.md ...] output.json` and `obsidian-draft packet.json output.md`.

See [Obsidian workflows](OBSIDIAN.md) for the complete setup, formats, review steps, limits and recovery. See [architecture](../ARCHITECTURE.md) for data ownership and trust boundaries. Automated tests use fictional notes; an installed Obsidian app and Sync round trip remain unverified.

## Claude → a reviewable draft

Select a job, enter verified facts in the connection panel, and download the packet. Set `ANTHROPIC_API_KEY` and `RELAY_CLAUDE_MODEL` to a model available to your API account. Run:

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

## Public boards → Relay

Greenhouse and Lever publish their boards without authentication, so this needs no credentials and carries no account risk.

```sh
node integrations/relay.mjs board-pull greenhouse <board> private-data/board.json
node integrations/relay.mjs board-pull lever <company> private-data/board.json
```

The board identifier is the one in the public URL. Load the output with **Load research or draft**, preview, then import. Postings normalise onto the same job identity as everything else, so a role found on several boards stays one record, and every row arrives Held. Compensation is parsed from the posting text when published and left unknown otherwise; unknown is scored neutrally, never as zero.

## The `relay` command line

The connectors above produce files. These commands talk to a running local Relay and are what an agent uses to work through the citation gate. They need `pnpm dev` running.

```sh
node integrations/relay.mjs login                 # cache a local session
node integrations/relay.mjs plan                  # this week, with ids and reasons
node integrations/relay.mjs brief <job_id> --json # facts you may cite + style rules
node integrations/relay.mjs log <job_id> draft.txt --cite f1,f2
node integrations/relay.mjs draft <job_id>        # Claude writes it, then logs it
node integrations/relay.mjs status                # cluster trust, review due
node integrations/relay.mjs outcome <job_id> submitted --receipt "confirmation #A-88"
```

**Local only.** `RELAY_URL` must point at `localhost` or `127.0.0.1`. Production identity comes from a trusted gateway the CLI cannot present, so there is nothing safe to aim it at yet. The session is cached in the ignored `private-data/.session` at mode 600.

### Exit codes

An unattended agent relies on these. The distinction that matters is 3 against 4.

| Code | Meaning                      | What to do                                |
| ---- | ---------------------------- | ----------------------------------------- |
| 0    | Success                      | Continue                                  |
| 1    | Usage or configuration error | Stop; a human misconfigured it            |
| 2    | Not signed in                | Run `login`, once                         |
| 3    | Refused by a domain rule     | **Fix the input. Never retry unchanged.** |
| 4    | Server or network failure    | Retry with backoff                        |
| 5    | Nothing to do                | Stop cleanly                              |

A refused draft prints the offending sentence and writes nothing. Retrying it unchanged will fail identically; retrying it _reworded_ until it passes is defeating the check, not satisfying it.

`--json` prints one object on stdout and sends every diagnostic to stderr.

Recording an outcome sends the current job `version`. A stale version is a refusal (exit 3), not a retryable server failure.

### What the command line will not do

It can do anything except exercise taste or authorise an irreversible act. It cannot accept a draft, verify a fact, close a review with rules, or answer a preference pair — those stay in the browser, where a person is looking. It cannot submit an application, because no write plane exists. Terminal outcomes need `--yes`, since they close a job permanently.

`relay draft` writes against the verified fact ledger and logs through the citation gate. The older `claude-draft` packet flow still takes facts you typed by hand and bypasses both.

## Profile, drafts and review

The fact ledger and style card live in the app at `/profile`, and review sessions at `/review`. Neither needs a connector or credentials: extraction runs locally on text you paste, and no resume file leaves your machine.

A browser exposing WebMCP gives an assistant `relay_read_profile`, `relay_log_draft` and `relay_review_status` alongside the existing workspace tools. Logging enforces that claims trace to verified facts; it does not accept drafts or change application status. This path has not been tested in a Grok Bot session.

The `claude-draft` command remains a file handoff and does not use the fact ledger. Facts you type into a packet are still ephemeral and unsaved.

## Privacy and operation

Use the ignored `private-data/` folder for real packets and responses. Keep credentials in environment variables, never in prompts, committed files, or screenshots. The browser does not store API keys. Commands do not send messages, submit applications, or silently approve drafts. Do not expose the local development server publicly: its sign-in is a development mock.

Connector tests use mocked vendor responses. Real-account Notion and Claude calls, and an installed Grok Bot journey, still require your credentials/setup and have not been verified for this release.

Official references: [Notion data sources](https://developers.notion.com/reference/data-source), [Notion API upgrade guide](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03), [Claude API overview](https://platform.claude.com/docs/en/api/overview).
