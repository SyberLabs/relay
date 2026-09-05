# Relay by SyberLabs

<!-- relay:public:start -->
**Your job search should remember what you've done.**

A job-search review workspace that keeps research, application history, and exact accepted drafts together across your tools.

**Lead engineer: [Seth Carlson](https://github.com/sdcarlson).**

## Available in this early release

- Consolidate repeated posting URLs while preserving source history.
- Keep interview notes and follow-ups without resetting application status.
- Accept an exact draft; changing the wording requires review again.
- Explore fictional example records; no real applicant data is included.

## Integrations

- **[ChatGPT](integrations/OPENAI.md)**: Prepared prompts and JSON file handoffs for draft review.
- **[Codex](integrations/OPENAI.md)**: Prepared prompts, validated draft files, or local drafting through the signed-in Codex CLI.
- **[Obsidian](integrations/OBSIDIAN.md)**: Selected research notes, version-bound draft notes, and job context exports.
- **[Notion](integrations/README.md)**: Read-only research import through the local command connector.
- **[Claude](integrations/README.md)**: Draft preparation through the Claude API with your own credentials.
- **[Grok Bot](integrations/GROK_BOT.md)**: Validated research and draft file exchange in the Bot's VM.

Integrations require explicit setup or file handoffs. Returned drafts require human review. No automatic application sending or background account sync is included.

ChatGPT uses a prompt/file handoff; Codex also supports a local CLI adapter. This release does not include a hosted ChatGPT app or MCP connection.

[Integration setup](integrations/README.md) | [ChatGPT and Codex guide](integrations/OPENAI.md) | [Launch copy](LAUNCH.md)
<!-- relay:public:end -->

## GrokCell bot templates

The [GrokCell folder](grokcell/README.md) includes First Principles, Product Ideation, Red Flag, and Garbage Collector with their source instructions, profiles, public bot links, and behavior checks. Use a specialist when its purpose fits the task. These templates do not connect to Relay or grant access to application records automatically; the [Relay adapter](integrations/GROK_BOT.md) remains the guide for exchanging job research and drafts.

This is a pinned copy of the separately maintained, MIT-licensed [GrokCell project](https://github.com/sdcarlson/grokcell). Propose template improvements upstream, then refresh the copy following [its source record](grokcell/UPSTREAM.md).

## Obsidian workflow

Select a job, open **Connect your tools**, choose the note purpose and **Create note for selected job**. Edit the downloaded note in your vault, then load it in Relay, review its contents and preview matches before importing. New jobs can start from the downloadable example. Several research notes can be imported together.

Use **Edit draft in Obsidian** for an application or follow-up draft that returns to the same job version for review. **Download job context** includes source history as a reference snapshot. Research preserves existing status and approval; loading a draft never accepts or sends it. This is an explicit file handoff, with no plugin, vault scanning or background synchronization.

[Complete Obsidian guide](integrations/OBSIDIAN.md) | [Architecture and data ownership](ARCHITECTURE.md)

## ChatGPT and Codex

Choose **Prepare for ChatGPT** or **Prepare for Codex** in **Connect your tools**, share the selected prompt, and return the JSON result for review. Codex can also prepare drafts through its signed-in CLI. [Complete setup and boundaries](integrations/OPENAI.md).

## Keeping public pages current

The project, organization, personal profile and website share one [maintained product description](docs/public-copy.json). [Public-copy process](docs/PUBLIC-COPY.md) explains generation, checks and automatic refreshes.

## Run locally

Node 24 and pnpm are required. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sticky_robbie_robertson.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_careless_leader.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_job_key_observations.sql
pnpm dev
```

Open the local URL printed by the server. Local sign-in is simulated by the Sites development plugin; do not expose this development server to the internet. Load fictional examples or import your own records. The product introduction is at `/about`.

## Integration boundaries

The connectors are runnable local commands with file import/export in the app. Notion and Claude require your own credentials. A local assisted trial retrieved real Notion records read-only through the connected Notion tool; that does not validate the standalone Notion command connector. Claude live access has not been tested. Grok Bot uses a documented command/file adapter, not an assumed proprietary API. Bot JSON was transcribed by hand into a validated file and loaded in the browser; fully automatic Bot file transfer is not validated. Browser acceptance, reload, and reimport kept the accepted draft, Ready status, two observations (deduplicated), and review history. There is no automatic background sync, autonomous hunting, application sending, or LinkedIn messaging. Generated claims still require your review. Production deployment has not been validated. This validates a local assisted workflow, not independent user adoption or unattended production.

## Checks

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
node tests/api.test.mjs
```

For an existing local database already on migration 0001, apply only 0002 from the setup commands. It preserves observations and repairs imported Ready records that lack matching accepted text. Imported Ready is research evidence; a new record stays Held until its exact draft is accepted in Relay.

The last command needs a running local server and writes only fictional test records. Domain, import, editor and connector tests cover status preservation, duplicate matching, imported acceptance, observation identity, editor version conflicts, draft review rules, provider errors and pagination. Connector tests mock vendor responses; they do not prove live account access. API checks verify database read-back, stale edits, exact acceptance, status-preserving follow-up edits and authentication rejection. Local browser and WebMCP reads/import checks were exercised. Preview works before the first import. Browser file import, save and reload preserved source history. Browser acceptance, reload, and post-acceptance reimport preserved the exact accepted draft, Ready status, two observations, and history. The assisted trial ran on `3b1efd7`; a read-only reopen after fast-forward still showed the accepted record on `59ec7ac`.

## Hosting and privacy

React/Vinext on Cloudflare Workers with D1 persistence and Sites authentication. The checked-in hosting manifest declares logical bindings only; it includes no owner's project ID. A production deployment needs its own Sites project and trusted authentication gateway. The app reads identity headers supplied by that gateway; deploying the raw Worker without equivalent trusted authentication is unsafe. This repository does not contain a public hosted service.

Keep real imports, packets and draft results in ignored `private-data/`. Keep API keys in environment variables. Local databases, build output, credentials, personal records and the original development Git history are excluded from this release.

Maintained by SyberLabs. Early release: no hiring outcomes, reliability targets or throughput improvements have been established. The bundled `grokcell/` templates are covered by their [MIT license](grokcell/LICENSE). No open-source license is granted for the rest of Relay in this release; contact SyberLabs for licensing.
