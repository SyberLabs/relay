# Relay by SyberLabs

**Your job search should remember what you've done.**

Relay is a job-search review workspace for people working with AI assistants. Bring research from multiple sources into one job history, prepare exact drafts, and keep interview follow-ups alongside the application.

## Available in this early release

- Consolidate repeated posting URLs and preserve research history.
- Edit notes and follow-up drafts on submitted jobs and active interviews without resetting their status.
- Accept an exact draft; changing it returns it to review.
- Import Notion research through a read-only command connector.
- Prepare drafts through the Claude API using your verified facts and your own credentials.
- Exchange validated research and draft files with Grok Bot in its VM.
- Explore fictional example records. No real applicant data is included.

[Integration setup](integrations/README.md) | [Grok Bot instructions](integrations/GROK_BOT.md) | [Launch copy](LAUNCH.md)

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

The connectors are runnable local commands with file import/export in the app. Notion and Claude require your own credentials; the release has not been tested against real provider accounts. Grok Bot uses a documented command/file adapter, not an assumed proprietary API. There is no automatic background sync, autonomous hunting, application sending, or LinkedIn messaging. Generated claims still require your review.

## Checks

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
node tests/api.test.mjs
```

For an existing local database already on migration 0001, apply only 0002 from the setup commands. It preserves observations and repairs imported Ready records that lack matching accepted text. Imported Ready is research evidence; a new record stays Held until its exact draft is accepted in Relay.

The last command needs a running local server and writes only fictional test records. Domain, import, editor and connector tests cover status preservation, duplicate matching, imported acceptance, observation identity, editor version conflicts, draft review rules, provider errors and pagination. Connector tests mock vendor responses; they do not prove live account access. API checks verify database read-back, stale edits, exact acceptance, status-preserving follow-up edits and authentication rejection. The optional browser WebMCP tools have not been validated in a supported agent browser.

## Hosting and privacy

React/Vinext on Cloudflare Workers with D1 persistence and Sites authentication. The checked-in hosting manifest declares logical bindings only; it includes no owner's project ID. A production deployment needs its own Sites project and trusted authentication gateway. The app reads identity headers supplied by that gateway; deploying the raw Worker without equivalent trusted authentication is unsafe. This repository does not contain a public hosted service.

Keep real imports, packets and draft results in ignored `private-data/`. Keep API keys in environment variables. Local databases, build output, credentials, personal records and the original development Git history are excluded from this release.

Maintained by SyberLabs. Early release: no hiring outcomes, reliability targets or throughput improvements have been established. No open-source license is granted in this release; contact SyberLabs for licensing.
