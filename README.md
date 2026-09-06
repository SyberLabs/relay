# Relay by SyberLabs

<!-- relay:public:start -->
**Your job search should remember what you've done.**

A job-search review workspace that keeps research, application history, and exact accepted drafts together across your tools.

**Lead engineer: [Seth Carlson](https://github.com/sdcarlson).**

## Available in this early release

- Consolidate repeated posting URLs while preserving source history.
- Keep interview notes and follow-ups without resetting application status.
- Accept an exact draft; changing the wording requires review again.
- Import a tracker CSV through explicit column mapping and a record preview. Source statuses remain research; existing Relay status and accepted drafts are preserved.
- Explore fictional example records; no real applicant data is included.

## Integrations

- **[ChatGPT](integrations/OPENAI.md)**: Prepared prompts and JSON file handoffs for draft review.
- **[Codex](integrations/OPENAI.md)**: Prepared prompts, validated draft files, or local drafting through the signed-in Codex CLI.
- **[Obsidian](integrations/OBSIDIAN.md)**: Selected research notes, version-bound draft notes, and job context exports.
- **[Notion](integrations/README.md)**: Read-only research import through the local command connector.
- **[Claude](integrations/README.md)**: Draft preparation through the Claude API with your own credentials.
- **[Grok Bot](integrations/GROK_BOT.md)**: Validated research and draft file exchange in the Bot's VM.
- **[Tracker CSV](integrations/README.md)**: Explicit column mapping and preview of a local comma-separated tracker file as research.

Integrations require explicit setup or file handoffs. Returned drafts require human review. No automatic application sending or background account sync is included.

ChatGPT uses a prompt/file handoff; Codex also supports a local CLI adapter. This release does not include a hosted ChatGPT app or MCP connection.

[Integration setup](integrations/README.md) | [ChatGPT and Codex guide](integrations/OPENAI.md) | [Launch copy](LAUNCH.md)
<!-- relay:public:end -->

[Development workflow](CONTRIBUTING.md) | [Delivery and review](docs/delivery.md) | [Team board](https://github.com/orgs/SyberLabs/projects/1)

## Why Relay

When another assistant rediscovers a role or rewrites a draft, you need to know what came before and whether the new text was actually reviewed. Relay makes those distinctions explicit:

- **Research keeps its history.** Matching posting URLs join the existing opportunity; changed source notes remain separate observations. Rediscovery preserves an existing interview or submitted status.
- **Acceptance belongs to the text.** An imported Ready label does not approve a new draft. Accept it in Relay; changing the accepted text requires another review.
- **Handoffs belong to a job and version.** Draft packets and editor checks reject stale work instead of silently replacing a newer review.
- **Bring the tools you already use.** Selected notes and validated files can supply research and drafts. Relay keeps the review record across those handoffs.

For example: import a role from Notion, prepare a draft with Claude, accept it, and later add an Obsidian research note for the same posting. The note adds context without replacing your draft or approving new wording. A later draft change needs review again.

This is Relay's product focus, not a claim of exclusive features or a proven advantage. Job tracking, AI writing, interview notes, and human review already exist elsewhere. Relay records acceptance inside its workspace; it does not verify every claim or prove which words were submitted to an employer. URL matching also cannot identify every repost across different job boards.


## GrokCell bot templates

For model-specific research practices, reusable handoffs, and a proposed evaluation plan, see [Context management for Relay](context-management/README.md). The guide distinguishes documented provider capabilities from Relay's implemented integrations.

The [GrokCell folder](grokcell/README.md) includes First Principles, Product Ideation, Red Flag, and Garbage Collector with their source instructions, profiles, public bot links, and behavior checks. Use a specialist when its purpose fits the task. These templates do not connect to Relay or grant access to application records automatically; the [Relay adapter](integrations/GROK_BOT.md) remains the guide for exchanging job research and drafts.

This is a pinned copy of the separately maintained, MIT-licensed [GrokCell project](https://github.com/sdcarlson/grokcell). Propose template improvements upstream, then refresh the copy following [its source record](grokcell/UPSTREAM.md).

## Autonomy and review

Relay separates what an agent may do freely from what only you may do. The split is enforced in the API, not in a prompt.

The **fact ledger** (`/profile`) holds claims you have verified. Paste resume text to propose candidates; extraction writes nothing and marks nothing verified. A fact can carry an expiry for anything that goes stale, such as a current title or a headcount.

The **style card** holds the voice rules learned from your corrections. The agent reads both through `relay_read_profile` and never writes either.

A writing agent logs drafts through `relay_log_draft` at whatever volume it likes. Each sentence that asserts something checkable must cite a verified fact id, and every number must appear in a cited fact. A draft that fails either rule is refused at the API and is never written. Logged drafts accumulate until review is worth your time (`/review`). Staging a graduated cluster's draft is not acceptance: status is untouched and accepting an exact draft remains a human action in the workspace. Relay still does not send applications.

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
pnpm dev
```

`pnpm dev` binds **http://localhost:3000/** (Vite `strictPort`). Use that URL. Miniflare/workerd may also print an internal `127.0.0.1:NNNN` bind — ignore it for the browser and curl.

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

The connectors are runnable local commands with file import/export in the app. Notion and Claude require your own credentials. A local assisted trial retrieved real Notion records read-only through the connected Notion tool; that does not validate the standalone Notion command connector. Claude live access has not been tested. Grok Bot uses a documented command/file adapter, not an assumed proprietary API. Bot JSON was transcribed by hand into a validated file and loaded in the browser; fully automatic Bot file transfer is not validated. Browser acceptance, reload, and reimport kept the accepted draft, Ready status, two observations (deduplicated), and review history. There is no automatic background sync, autonomous hunting, application sending, or LinkedIn messaging. Generated claims still require your review. Production deployment has not been validated. This validates a local assisted workflow, not independent user adoption or unattended production.

## Where Relay fits with existing tools

Use your preferred discovery and application tools alongside Relay. [Simplify](https://simplify.jobs/) already offers job matching, autofill, resume tailoring, and tracking. Its [Gmail integration](https://help.simplify.jobs/articles/0236686-email-integration) also includes reviewed AI emails and suggested status changes. Relay's focus is preserving research and exact draft decisions across tool handoffs.

**First compatibility path: tracker CSV → Relay preview.** Simplify documents [CSV import and export](https://help.simplify.jobs/en/articles/2140179-using-the-job-tracker). In Relay, open **Import a tracker CSV**, choose your file, confirm the company, role and employer posting URL columns, and preview before saving. Optional status and notes columns are preserved as research. Every new job starts Held; source statuses never approve a draft or synchronize the application pipeline. Other columns are explicitly listed as omitted.

This is a file importer, not a Simplify account connection or partnership. CSV handling is tested with fictional fixtures and a Chromium journey covering column selection, preview, import, acceptance, repeat import and reload; a real Simplify export has not yet been validated. Files need posting URLs, comma-separated columns and at most 200 opportunity rows. See the [CSV setup guide](integrations/README.md#tracker-csv--relay) and [fictional example](tests/fixtures/tracker-example.csv).

Huntr and Teal export compatibility are further candidates, after the first handoff proves useful. Current working integrations and their verification limits are documented in the [setup guide](integrations/README.md). Market positioning was reviewed against vendor documentation on September 5, 2026; repeat use and willingness to pay remain unvalidated.

## Checks

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
node tests/api.test.mjs
```

For an existing local database already on migration 0002, apply only 0003 from the setup commands; it only adds the profile, draft and review tables and leaves existing rows untouched. For one still on migration 0001, apply 0002 and then 0003. Migration 0002 preserves observations and repairs imported Ready records that lack matching accepted text. Imported Ready is research evidence; a new record stays Held until its exact draft is accepted in Relay.

The last command needs a running local server and writes only fictional test records. Domain, import, editor and connector tests cover status preservation, duplicate matching, imported acceptance, observation identity, editor version conflicts, draft review rules, provider errors and pagination. Connector tests mock vendor responses; they do not prove live account access. API checks verify database read-back, stale edits, exact acceptance, status-preserving follow-up edits and authentication rejection. Local browser and WebMCP reads/import checks were exercised. Preview works before the first import. Browser file import, save and reload preserved source history. Browser acceptance, reload, and post-acceptance reimport preserved the exact accepted draft, Ready status, two observations, and history. The assisted trial ran on `3b1efd7`; a read-only reopen after fast-forward still showed the accepted record on `59ec7ac`.

## Hosting and privacy

React/Vinext on Cloudflare Workers with D1 persistence. Local development uses Sites authentication. The production delivery process uses separate staging and production databases with a verified Cloudflare Access gateway; see [hosting and recovery](docs/hosting.md). The checked-in Sites manifest declares logical bindings only. Deploy only the verified release artifact through the protected workflows. Account provisioning, live authentication, and the first production release still require verification before inviting users.

Keep real imports, packets and draft results in ignored `private-data/`. Keep API keys in environment variables. Local databases, build output, credentials, personal records and the original development Git history are excluded from this release.

Maintained by SyberLabs. Early release: no hiring outcomes, reliability targets or throughput improvements have been established. The bundled `grokcell/` templates are covered by their [MIT license](grokcell/LICENSE). No open-source license is granted for the rest of Relay in this release; contact SyberLabs for licensing.
