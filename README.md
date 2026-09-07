# Relay by SyberLabs

<!-- relay:public:start -->
**Your job search should remember what you've done.**

SyberLabs' invited-pilot workspace for one job at a time: keep candidate facts for reuse, hand context to your assistant, review returned wording, and accept exact text. Relay preserves research and review history for later use.

**Lead engineer: [Seth Carlson](https://github.com/sdcarlson).** Application development: [Mateo](https://github.com/sykosyber).

## Available in this early release

- One history per job: matching posting URLs join the same record, and earlier research stays visible.
- Add one job from a role title, HTTP(S) posting URL, and optional notes. Matching URLs join that existing record without resetting status or accepted drafts.
- Exact draft acceptance: you approve specific wording; changing it requires review again.
- Interview notes and follow-ups that do not reset a submitted or live-loop application.
- Import a tracker CSV through column mapping and a record preview. Imported statuses stay research; existing Relay status and accepted drafts are preserved.
- A reusable candidate fact ledger: you confirm accuracy. Agent draft logs check selected claim patterns using word and number overlap with cited facts; unsupported claims can still pass.
- Browser draft loading checks format, job identity and version. It does not check citations or factual accuracy; workspace saves do not run the agent citation check.
- Advanced tools preserve experimental agent batch review, preference fitting and weekly planning. Planning uses estimated reply rates, not offer probabilities. Staging never accepts or sends a draft.
- Pull public Greenhouse and Lever boards onto existing job identity. Discovery arrives Held.
- Record outcomes with a receipt before a submission counts toward reply rates. Ended applications cannot be reopened by import.
- Drive agent draft logging from a local command line with heuristic citation checks. Domain refusals exit 3 without saving a draft. The CLI cannot accept drafts, confirm facts, or submit applications.
- Explore fictional example records; no real applicant data is included.

## Integrations

- **[ChatGPT](integrations/OPENAI.md)**: Prepare a job packet and prompt, then bring a JSON draft back for review.
- **[Codex](integrations/OPENAI.md)**: The same packet, plus optional local drafting through the signed-in Codex CLI.
- **[Obsidian](integrations/OBSIDIAN.md)**: Selected research notes, version-bound draft edits, and job-context exports from your vault.
- **[Notion](integrations/README.md)**: Read-only research import through a local command you run with your own credentials.
- **[Claude](integrations/README.md)**: Draft preparation from facts you supply through the Claude API, using your own key. The local relay CLI can log drafts against saved, user-confirmed facts with heuristic citation checks.
- **[Grok Bot](integrations/GROK_BOT.md)**: Validated research and draft file exchange inside the Bot's VM.
- **[Tracker CSV](integrations/README.md)**: Map columns, preview rows, and import a local tracker file as research.
- **[Greenhouse](integrations/README.md)**: Read-only public board pull onto existing job identity. No credentials and no application sending.
- **[Lever](integrations/README.md)**: Read-only public board pull onto existing job identity. No credentials and no application sending.

Every returned draft needs human review. User confirmation and heuristic checks do not establish factual truth, qualifications or improved hiring outcomes. Acceptance records approval of exact wording. Integrations are explicit file and command handoffs; Relay does not send applications or sync accounts in the background.

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

The [GrokCell project](https://github.com/sdcarlson/grokcell) publishes the First Principles, Product Ideation, Red Flag, and Garbage Collector templates. They do not connect to Relay or grant access to application records. The [Relay adapter](integrations/GROK_BOT.md) remains the guide for exchanging job research and drafts. See also [context management](context-management/README.md).

## Candidate facts and advanced batch review

Start with one job in the workspace, prepare a handoff, review the returned wording and accept exact text. Facts, source history and review history remain available for later reuse. Experimental batch tools are under **Advanced** (`/advanced`).

The **fact ledger** (`/profile`, **Your facts**) holds claims you confirm yourself. Stored `Verified` means user-confirmed, not independently verified by Relay. Paste resume text to propose candidates; extraction does not save or confirm them. A fact can carry an expiry for information that goes stale. The browser handoff currently uses a separate unsaved facts box; it does not select saved ledger entries.

The **style card** holds the voice rules learned from your corrections. The agent reads both through `relay_read_profile` and never writes either.

A writing agent can log drafts through `relay_log_draft`. Cited IDs must identify user-confirmed, unexpired facts. Selected claim patterns then undergo word-overlap checks, with numbers pooled across cited facts. A detected failure refuses the draft; passing does not establish that the evidence supports its meaning. Unsupported claims can still reach review. An agent short of a fact should use `confidence: "low"` rather than guess; this does not bypass the check. [Fictional examples and trust boundaries](docs/product-trust.md) document the limits.

Browser draft loading separately checks format, job identity and version. It does not check citations or factual accuracy. Workspace saves do not run the agent draft-log check. Human acceptance records approval of exact wording; changed text needs fresh acceptance.

Logged drafts accumulate for batch review (`/review`). A session opens on the first draft in an unseen role cluster, style drift, enough low-confidence drafts, or a full batch. It groups repeated openings, flags near-identical letters and proposes style rules from corrections. Review each claim and correction; batch review is separate from exact-text acceptance in the workspace.

Automatic staging is enabled per role cluster from recent edit sizes. After enough reviewed drafts come back close to unchanged, later drafts can be placed into the matching job record. This measures editing history, not factual accuracy. Staging leaves status untouched and does not set `accepted_draft`; accepting exact text remains a human action. Changed review history or expired facts can return a cluster to batch review.

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
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_record_refusals.sql
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

## Advanced planning and outcome history

Preferences and weekly planning remain available under **Advanced**. They are experimental aids, with no established qualification assessment or hiring benefit. Outcome history stays accessible from the workspace.

**Preferences** (`/preferences`) fit weights from choices between saved postings. Twelve comparisons is the interface's target, not a validated accuracy threshold. With no choices, postings receive the same preference score.

**The plan** (`/plan`) uses estimated reply rates, posting age, preference scores and effort estimates in an expected-maximum calculation. Greedy selection adds model score per minute within your budget. A reply is not an offer, so the result is presented as an experimental plan score, not an expected best offer or measured outcome improvement. The underlying API fields and records are preserved.

**The read plane** pulls public Greenhouse and Lever boards through `board-pull`, normalising onto the same `jobKey` identity the workspace already uses. It reads only, needs no credentials and no account, and every posting arrives Held — discovery never implies a decision.

**Outcomes** (`/track`) close the loop. Terminal states are local records of what actually happened and are deliberately not valid import statuses, so the existing import behaviour is unchanged and rediscovery can never reopen an application that has ended. A submission recorded here requires a receipt: the confirmation URL, reference or email subject. Imported submissions are kept and shown, but they arrive without a receipt and are excluded from the reply rates, because counting a send that may never have happened would corrupt every estimate built on it.

Reply estimates use recorded outcomes and prior assumptions. The API includes intervals and evidence counts. These estimates do not establish that a change caused an outcome.

**Interview preparation** can reuse recorded facts and reviewed wording. Citation records cover agent draft logs; they are not a complete or verified account of every claim in an application.

Relay still does not submit applications. There are no write-plane adapters in this release: nothing here fills in a form, sends an email, or messages anyone, and recording a submission is you telling Relay what you already did.

## Integration boundaries

Connectors are local commands and explicit file import/export. Notion and Claude use your credentials. ChatGPT is a prompt/file handoff; Codex also supports a local CLI adapter; Grok Bot uses a documented command/file adapter. Agents may log and, for a graduated cluster, stage drafts; they cannot accept one. Board pulls read public endpoints only and use no account identity. A recorded submission is your own report of something you did elsewhere and needs a receipt. Citation checks are heuristic and specific to agent draft logging; every returned draft still requires human review. There is no automatic background sync, autonomous hunting, application sending, or LinkedIn messaging. Production deployment and independent user adoption remain separate from this local workflow.

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

For an existing local database, apply every migration after the one it is already on, in order, up to the highest number in `drizzle/`. Enumerating per-version paths goes stale the moment a migration is added, so follow the rule rather than a list. Migration 0002 rebuilds the observation index. Migration 0003 adds the fact ledger, style rules and draft-review tables. Migration 0004 adds preference, choice and outcome tables and defaulted posting columns on `jobs`; existing rows stay. Migration 0005 adds the refusals table and changes no existing row. Skipping 0005 leaves `/api/readiness` and every citation refusal hitting a missing table. Imported Ready is research evidence; a new record stays Held until its exact draft is accepted in Relay.

Domain, import, editor, profile, selection, and API tests cover status preservation, duplicate matching, exact acceptance, citation refusal, terminal outcomes that cannot be reopened by import, stale edits, and authentication rejection. A 401 on `/profile`, `/preferences`, `/review`, or `/track` expires that mounted page session before the response body is read, clears private state and edit controls, and shows the existing signed-out screen. Older in-flight reads and mutations cannot restore it. Sign-in is top-level navigation; these pages do not reauthenticate in place. Workspace expiry is unchanged.

## Hosting and privacy

Keep real imports, packets, and draft results in ignored `private-data/`. Keep API keys in environment variables. Local databases, build output, credentials, and personal records stay out of Git.

Deploy only the verified release artifact through the protected workflows. An invited pilot may use workers.dev without purchasing a domain; a custom domain remains optional. Account provisioning, live authentication, and the first production release still require verification before inviting users.

Early release: no hiring outcomes, reliability targets, or throughput improvements have been established.

## License

Copyright 2026 SyberLabs. Relay is licensed under the [Apache License, Version 2.0](LICENSE). Third-party dependencies retain their respective licenses.
