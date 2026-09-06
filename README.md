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
- A verified fact ledger and learned style rules that gate agent drafts at the API. Unsupported claims are refused, not queued.
- Batch review of logged drafts. Staging a draft does not accept it or send an application.
- Choose between real postings to set preferences, then plan the week to maximise the expected value of the best single offer.
- Pull public Greenhouse and Lever boards onto existing job identity. Discovery arrives Held.
- Record outcomes with a receipt before a submission counts toward reply rates. Ended applications cannot be reopened by import.
- Drive the citation-gated draft loop from a local command line. Domain refusals exit 3 and write nothing. The CLI cannot accept drafts, verify facts, or submit applications.
- Explore fictional example records; no real applicant data is included.

## Integrations

- **[ChatGPT](integrations/OPENAI.md)**: Prepare a job packet and prompt, then bring a JSON draft back for review.
- **[Codex](integrations/OPENAI.md)**: The same packet, plus optional local drafting through the signed-in Codex CLI.
- **[Obsidian](integrations/OBSIDIAN.md)**: Selected research notes, version-bound draft edits, and job-context exports from your vault.
- **[Notion](integrations/README.md)**: Read-only research import through a local command you run with your own credentials.
- **[Claude](integrations/README.md)**: Draft preparation from your verified facts through the Claude API, using your own key. The local relay CLI can log those drafts through the citation gate.
- **[Grok Bot](integrations/GROK_BOT.md)**: Validated research and draft file exchange inside the Bot's VM.
- **[Tracker CSV](integrations/README.md)**: Map columns, preview rows, and import a local tracker file as research.
- **[Greenhouse](integrations/README.md)**: Read-only public board pull onto existing job identity. No credentials and no application sending.
- **[Lever](integrations/README.md)**: Read-only public board pull onto existing job identity. No credentials and no application sending.

You stay in control. Integrations are explicit file and command handoffs. Every returned draft needs human review. Agents cannot accept a draft or submit an application. Public board pulls are read-only. Relay does not send applications or sync accounts in the background.

ChatGPT uses a prompt and file handoff; Codex also supports a local CLI adapter. This release does not include a hosted ChatGPT app or MCP connection.

[Integration setup](integrations/README.md) | [ChatGPT and Codex guide](integrations/OPENAI.md) | [Launch copy](LAUNCH.md)
<!-- relay:public:end -->

## Why Relay

People already use ChatGPT, Claude, Grok, Notion, and Obsidian to hunt for jobs. The work still falls apart in the gaps: a new chat forgets the last draft, a tracker overwrites a decision, an interview note resets application status.

Relay is the workspace that remembers. Import research as evidence. Review the actual words. Accept a specific draft. Keep follow-ups on submitted jobs without losing what you already did.

- **Research keeps its history.** Matching posting URLs join the existing opportunity; changed source notes remain separate observations. Rediscovery preserves an existing interview or submitted status.
- **Acceptance belongs to the text.** An imported Ready label does not approve a new draft. Accept it in Relay; changing the accepted text requires another review.
- **Handoffs belong to a job and version.** Draft packets and editor checks reject stale work instead of silently replacing a newer review.
- **Bring the tools you already use.** ChatGPT, Codex, Claude, Grok Bot, Notion, Obsidian, a tracker CSV, and public Greenhouse or Lever boards can supply research and drafts. Relay keeps the review record across those handoffs.

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

GrokCell is a separate MIT-licensed project with First Principles, Product Ideation, Red Flag, and Garbage Collector templates. Those templates do not connect to Relay or grant access to application records. Keep them in [sdcarlson/grokcell](https://github.com/sdcarlson/grokcell). The [Relay adapter](integrations/GROK_BOT.md) remains the guide for exchanging job research and drafts. See also [context management](context-management/README.md).

## Autonomy and review

Relay separates what an agent may do freely from what only you may do. The split is enforced in the API, not in a prompt.

The **fact ledger** (`/profile`) holds claims you have verified. Paste resume text to propose candidates; extraction writes nothing and marks nothing verified. A fact can carry an expiry for anything that goes stale, such as a current title or a headcount.

The **style card** holds the voice rules learned from your corrections. The agent reads both through `relay_read_profile` and never writes either.

A writing agent logs drafts through `relay_log_draft` at whatever volume it likes. Each sentence that asserts something checkable must cite a verified fact id, and every number must appear in a cited fact. A draft that fails either rule is refused at the API and is never written, so an invented achievement cannot reach a review queue. An agent short of a fact is expected to log with `confidence: "low"` rather than guess.

Logged drafts accumulate until review is worth your time (`/review`). A session opens on the first draft in an unseen role cluster, on style drift within a proven one, on enough low-confidence drafts, or on a full batch — in that order. The session groups repeated habits so one decision covers several drafts, flags near-identical letters, and turns your corrections into style rules. Closing a session with no rules changes nothing about the next batch.

Autonomy is then earned per role cluster. After enough reviewed drafts come back close to unchanged, a cluster graduates and its later drafts are placed into the matching job record unattended. Staging is not acceptance: status is untouched, `accepted_draft` is not set, and accepting an exact draft remains a human action in the workspace. A correction or an expired fact returns the cluster to full review.

Relay still does not send applications. Nothing here submits, emails or messages anyone.

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
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_profile_calibration.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_selection_and_outcomes.sql
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

## Selection and outcomes

Drafting well is not the largest lever. Which jobs you apply to is, because reply odds vary by orders of magnitude with fit while letter quality varies perhaps twofold. These stages address that.

**Preferences** (`/preferences`) are elicited by forced choice over real postings, because people cannot state trade-off weights in the abstract but choose between two concrete jobs instantly. Around a dozen comparisons fit the five weights well enough to rank a large pool. Until you answer, Relay has no opinion and says so rather than inventing one.

**The plan** (`/plan`) maximises the expected value of the *best single offer*, not the sum over applications, because you accept one job. That is an expected maximum, and computing it exactly produces a spread of odds on its own: once a likely offer is held, further similar roles add almost nothing and a long shot starts winning the comparison. No reach/match/floor ratio is hardcoded. Selection is greedy on gain per minute under the attention budget you set, and every row carries the reason it earned its place.

**The read plane** pulls public Greenhouse and Lever boards through `board-pull`, normalising onto the same `jobKey` identity the workspace already uses. It reads only, needs no credentials and no account, and every posting arrives Held — discovery never implies a decision.

**Outcomes** (`/track`) close the loop. Terminal states are local records of what actually happened and are deliberately not valid import statuses, so the existing import behaviour is unchanged and rediscovery can never reopen an application that has ended. A submission recorded here requires a receipt: the confirmation URL, reference or email subject. Imported submissions are kept and shown, but they arrive without a receipt and are excluded from the reply rates, because counting a send that may never have happened would corrupt every estimate built on it.

Reply rates are reported as intervals with the evidence count that produced them, and they are descriptive. Samples are small, the market moves and a job search cannot be run as an experiment, so nothing here establishes that a change caused an outcome.

**Interview preparation** falls out of the citation graph rather than being a separate feature: because every claim had to cite a verified fact, Relay already knows what each application commits you to defending.

Relay still does not submit applications. There are no write-plane adapters in this release: nothing here fills in a form, sends an email, or messages anyone, and recording a submission is you telling Relay what you already did.

## Integration boundaries

Connectors are local commands and explicit file import/export. Notion and Claude use your credentials. ChatGPT is a prompt/file handoff; Codex also supports a local CLI adapter; Grok Bot uses a documented command/file adapter. Agents may log and, for a graduated cluster, stage drafts; they cannot accept one or change an application status. Board pulls read public endpoints only and use no account identity. A recorded submission is your own report of something you did elsewhere and needs a receipt. Citation enforcement checks that a claim traces to a fact you verified; generated text still requires review. There is no automatic background sync, autonomous hunting, application sending, or LinkedIn messaging. Production deployment and independent user adoption remain separate from this local workflow.

See [Local assisted browser trial](REVIEW.md#local-assisted-browser-trial) for the earlier `3b1efd7` read-only Notion, hand-transcribed Bot file, and browser acceptance, reload, and reimport evidence, still shown on a read-only reopen at `59ec7ac`.

On `7cfec262`, a later fictional trial copied a Relay packet into the installed Grok Bot and manually pasted the returned JSON into Relay. Paste staged the draft without saving; an explicit save and reload preserved its exact text while the record remained Held and unaccepted. Automatic Bot file transfer and the Bot VM command environment remain unverified.

On `e9e6030`, a later three-record trial imported three distinct Held jobs from historical Notion research through the connected Notion tool (read-only) into isolated local browser storage. Three actual context packets were copied into the installed native Grok Bot; the three observed JSON replies were transcribed by hand and loaded as files. Load staged drafts without persistence; an explicit save and reload preserved the exact text; stale original replies were rejected; a repeat import deduplicated. All three jobs stayed Held with no accepted draft. This is connected Notion read-only plus manually returned installed-Bot JSON, not automatic transfer or the standalone Notion command connector. See [Three-record Notion and native Bot trial](REVIEW.md#three-record-notion-and-native-bot-trial-2026-09-06).

## Checks

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm public-copy:check
node tests/api.test.mjs
pnpm test:calibration
pnpm test:orchestration
pnpm test:cli
```

The project, organization, personal profile, and website share one [maintained product description](docs/public-copy.json). [Public-copy process](docs/PUBLIC-COPY.md) explains generation, checks, and automatic refreshes.

`pnpm test` is the unit gate. The API, calibration, orchestration, and CLI live suites each get a dedicated freshly migrated database via `pnpm test:api`, `pnpm test:calibration`, `pnpm test:orchestration`, and `pnpm test:cli`. Do not run those live suites against the same D1: calibration graduates clusters and retires facts. Connector tests mock vendor responses; they do not prove live account access.

For an existing local database still on migration 0001, apply 0002, then 0003 and 0004. From 0002, apply 0003 then 0004. From 0003, apply only 0004. Migration 0003 adds the fact ledger, style rules and draft-review tables. Migration 0004 adds preference, choice and outcome tables and defaulted posting columns on `jobs`; existing rows stay. Imported Ready is research evidence; a new record stays Held until its exact draft is accepted in Relay.

Domain, import, editor, profile, selection, and API tests cover status preservation, duplicate matching, exact acceptance, citation refusal, terminal outcomes that cannot be reopened by import, stale edits, and authentication rejection. A 401 on `/profile`, `/preferences`, `/review`, or `/track` expires that mounted page session before the response body is read, clears private state and edit controls, and shows the existing signed-out screen. Older in-flight reads and mutations cannot restore it. Sign-in is top-level navigation; these pages do not reauthenticate in place. Workspace expiry is unchanged.

## Hosting and privacy

Keep real imports, packets, and draft results in ignored `private-data/`. Keep API keys in environment variables. Local databases, build output, credentials, and personal records stay out of Git.

Deploy only the verified release artifact through the protected workflows. Account provisioning, live authentication, and the first production release still require verification before inviting users.

Early release: no hiring outcomes, reliability targets, or throughput improvements have been established.

## License

Copyright 2026 SyberLabs. Relay is licensed under the [Apache License, Version 2.0](LICENSE). Third-party dependencies retain their respective licenses.
