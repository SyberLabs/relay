# Relay by SyberLabs

<!-- relay:public:start -->
**Your job search should remember what you've done.**

SyberLabs' job-search product: a private review workspace that remembers the roles you researched, the drafts you accepted, and the interviews you started. Assistants help you write; Relay keeps the record.

**Lead engineer: [Seth Carlson](https://github.com/sdcarlson).** Application development: [Mateo](https://github.com/sykosyber).

## Available in this early release

- One history per job: matching posting URLs join the same record, and earlier research stays visible.
- Exact draft acceptance: you approve specific wording; changing it requires review again.
- Interview notes and follow-ups that do not reset a submitted or live-loop application.
- Import a tracker CSV through column mapping and a record preview. Imported statuses stay research; existing Relay status and accepted drafts are preserved.
- Explore fictional example records; no real applicant data is included.

## Integrations

- **[ChatGPT](integrations/OPENAI.md)**: Prepare a job packet and prompt, then bring a JSON draft back for review.
- **[Codex](integrations/OPENAI.md)**: The same packet, plus optional local drafting through the signed-in Codex CLI.
- **[Obsidian](integrations/OBSIDIAN.md)**: Selected research notes, version-bound draft edits, and job-context exports from your vault.
- **[Notion](integrations/README.md)**: Read-only research import through a local command you run with your own credentials.
- **[Claude](integrations/README.md)**: Draft preparation from your verified facts through the Claude API, using your own key.
- **[Grok Bot](integrations/GROK_BOT.md)**: Validated research and draft file exchange inside the Bot's VM.
- **[Tracker CSV](integrations/README.md)**: Map columns, preview rows, and import a local tracker file as research.

You stay in control. Integrations are explicit file and command handoffs. Every returned draft needs human review. Relay does not send applications or sync accounts in the background.

ChatGPT uses a prompt and file handoff; Codex also supports a local CLI adapter. This release does not include a hosted ChatGPT app or MCP connection.

[Integration setup](integrations/README.md) | [ChatGPT and Codex guide](integrations/OPENAI.md) | [Launch copy](LAUNCH.md)
<!-- relay:public:end -->

## Why Relay

People already use ChatGPT, Claude, Grok, Notion, and Obsidian to hunt for jobs. The work still falls apart in the gaps: a new chat forgets the last draft, a tracker overwrites a decision, an interview note resets application status.

Relay is the workspace that remembers. Import research as evidence. Review the actual words. Accept a specific draft. Keep follow-ups on submitted jobs without losing what you already did.

- **Research keeps its history.** Matching posting URLs join the existing opportunity; changed source notes remain separate observations. Rediscovery preserves an existing interview or submitted status.
- **Acceptance belongs to the text.** An imported Ready label does not approve a new draft. Accept it in Relay; changing the accepted text requires another review.
- **Handoffs belong to a job and version.** Draft packets and editor checks reject stale work instead of silently replacing a newer review.
- **Bring the tools you already use.** ChatGPT, Codex, Claude, Grok Bot, Notion, Obsidian, and a tracker CSV can supply research and drafts. Relay keeps the review record across those handoffs.

Relay records acceptance inside its workspace. It does not send applications, verify every claim, or prove which words were submitted to an employer. URL matching cannot identify every repost across different job boards.

## Team

Relay is built at [SyberLabs](https://github.com/SyberLabs) by a two-person team:

- **[Seth Carlson](https://github.com/sdcarlson)** - lead engineer and product
- **[Mateo](https://github.com/sykosyber)** - application development and review

Every database read and write belongs to the authenticated user. Exact accepted text is versioned. Imports add evidence; they cannot grant approval. A stale editor or assistant packet cannot overwrite newer work.

[Development workflow](CONTRIBUTING.md) · [Delivery and review](docs/delivery.md) · [Team board](https://github.com/orgs/SyberLabs/projects/1)

## Stack

React 19 and Vinext on Cloudflare Workers, with D1 persistence and Drizzle migrations. TypeScript throughout. Local development uses Sites authentication; production uses a verified Cloudflare Access gateway and separate staging and production databases.

See [architecture and data ownership](ARCHITECTURE.md) and [hosting and recovery](docs/hosting.md).

## Using Relay with the tools you already have

Use your preferred discovery and application tools alongside Relay. [Simplify](https://simplify.jobs/) already offers job matching, autofill, resume tailoring, and tracking. Relay's focus is preserving research and exact draft decisions across those handoffs.

**First compatibility path: tracker CSV to Relay preview.** In Relay, open **Import a tracker CSV**, choose your file, confirm the company, role, and employer posting URL columns, and preview before saving. Optional status and notes columns are preserved as research. Every new job starts Held; source statuses never approve a draft. This is a file importer, not a tracker account connection or partnership. See the [CSV setup guide](integrations/README.md#tracker-csv--relay) and [fictional example](tests/fixtures/tracker-example.csv).

### Obsidian

Select a job, open **Connect your tools**, choose the note purpose, and **Create note for selected job**. Edit the downloaded note in your vault, then load it in Relay and preview matches before importing. Use **Edit draft in Obsidian** for a version-bound draft, and **Download job context** for a source-history snapshot. No plugin, vault scanning, or background sync.

[Complete Obsidian guide](integrations/OBSIDIAN.md)

### ChatGPT and Codex

Choose **Prepare for ChatGPT** or **Prepare for Codex** in **Connect your tools**, share the selected prompt, and return the JSON result for review. Codex can also prepare drafts through its signed-in CLI.

[Complete setup and boundaries](integrations/OPENAI.md)

### GrokCell research templates

The [GrokCell folder](grokcell/README.md) includes First Principles, Product Ideation, Red Flag, and Garbage Collector. These templates do not connect to Relay or grant access to application records. The [Relay adapter](integrations/GROK_BOT.md) remains the guide for exchanging job research and drafts. See also [context management](context-management/README.md). This is a pinned copy of the MIT-licensed [GrokCell project](https://github.com/sdcarlson/grokcell).

## Run locally

Node 24 and pnpm are required. From the repository root:

```sh
# .nvmrc / .node-version are `24`
nvm install && nvm use          # or: fnm install && fnm use
# mise use node@24
# asdf install nodejs 24 && asdf set nodejs 24

node scripts/ensure-node.mjs    # checks the running Node version; no Bash required
node -v                         # must be >= 24
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sticky_robbie_robertson.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_careless_leader.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_job_key_observations.sql
pnpm dev
```

`pnpm dev` binds **http://localhost:3000/** (Vite `strictPort`). Use that URL. Miniflare/workerd may also print an internal `127.0.0.1:NNNN` bind - ignore it for the browser and curl.

`pnpm start` (after `pnpm build`) binds the built Worker at **http://127.0.0.1:8787/**.

Do not expose either server to the internet. Load fictional examples or import your own records. The product introduction is at `/about`.

### Local sign-in

On `pnpm dev`, the Sites Vite plugin mocks ChatGPT sign-in on the Vite URL only:

- Browser: **Sign in with ChatGPT** → `/signin-with-chatgpt?return_to=/`
- Mock identity: `local_seedy` / `seedy@sites.test`

`/signin-with-chatgpt` is not a Worker route. `pnpm start` and any workerd-only port return 404 for it. Send Sites identity headers instead (fictional values only):

```sh
curl -sS http://127.0.0.1:8787/api/workspace \
  -H 'oai-authenticated-user-id: local-dev' \
  -H 'oai-authenticated-user-email: local@example.com'
```

The Sites plugin on `pnpm dev` strips caller-supplied `oai-authenticated-user-*` headers and injects the mock user only after the sign-in cookie. Header mock is for the built Worker. Production must use the Access gateway from the delivery foundation.

## Integration boundaries

Connectors are local commands and explicit file import/export. Notion and Claude use your credentials. ChatGPT is a prompt/file handoff; Codex also supports a local CLI adapter; Grok Bot uses a documented command/file adapter. There is no automatic background sync, autonomous hunting, application sending, or LinkedIn messaging. Generated claims still require review. Production deployment and independent user adoption remain separate from this local workflow.

See [Local assisted browser trial](REVIEW.md#local-assisted-browser-trial) for the earlier `3b1efd7` read-only Notion, hand-transcribed Bot file, and browser acceptance, reload, and reimport evidence, still shown on a read-only reopen at `59ec7ac`.

On `7cfec262`, a later fictional trial copied a Relay packet into the installed Grok Bot and manually pasted the returned JSON into Relay. Paste staged the draft without saving; an explicit save and reload preserved its exact text while the record remained Held and unaccepted. Automatic Bot file transfer and the Bot VM command environment remain unverified.

## Checks

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm public-copy:check
```

The project, organization, personal profile, and website share one [maintained product description](docs/public-copy.json). [Public-copy process](docs/PUBLIC-COPY.md) explains generation, checks, and automatic refreshes.

API checks need a running local server and write only fictional test records. Connector tests mock vendor responses; they do not prove live account access. Domain, import, editor, and API tests cover status preservation, duplicate matching, exact acceptance, stale edits, and authentication rejection.

For an existing local database still on migration 0001, apply 0002 from the setup commands. Imported Ready is research evidence; a new record stays Held until its exact draft is accepted in Relay.

## Hosting and privacy

Keep real imports, packets, and draft results in ignored `private-data/`. Keep API keys in environment variables. Local databases, build output, credentials, and personal records stay out of Git.

Deploy only the verified release artifact through the protected workflows. Account provisioning, live authentication, and the first production release still require verification before inviting users.

Early release: no hiring outcomes, reliability targets, or throughput improvements have been established.

## License

Copyright 2026 SyberLabs. Relay is licensed under the [Apache License, Version 2.0](LICENSE). The bundled `grokcell/` templates retain their [MIT license](grokcell/LICENSE). Third-party dependencies retain their respective licenses.
