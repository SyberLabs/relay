# Relay by SyberLabs

<!-- relay:public:start -->
**Keep each application’s facts, wording, and history together.**

Relay is a private, human-reviewed workspace for carrying job context between assistants and keeping an application record current.

**Relay lead engineer: [Seth Carlson](https://github.com/sdcarlson).** **Product: [Mateo Robles](https://github.com/sykosyber).**

## Available in this early release

- Keep one owner-scoped record per job, with research and application history kept together.
- Import selected tracker rows or job research as evidence; imports do not accept wording or overwrite current application state.
- Maintain candidate facts that you confirm yourself. For a prompt or file handoff, include only facts relevant to that job.
- Return assistant-written wording to the same job. Relay checks the job version and refuses stale saves.
- Review and accept exact wording yourself. Editing accepted text requires fresh acceptance.
- Update application state yourself. In the fictional fixture, the included Chrome operative can record Submitted when it reports a receipt. Relay does not independently verify what the employer received.
- A separate application action requires human Inspect approval before an external browser receives a one-use permit. Relay itself does not POST the employer form.
- Explore fictional example records; no real applicant data is included.

## Integrations

- **[ChatGPT](integrations/OPENAI.md)**: Prepare a selected-job handoff, then return the assistant's draft for review.
- **[Codex](integrations/OPENAI.md)**: Use the same handoff or the local CLI adapter with a signed-in Codex CLI.
- **[Obsidian](integrations/OBSIDIAN.md)**: Exchange selected job research and version-bound draft files.
- **[Notion](integrations/README.md)**: Import selected research through a local read-only command.
- **[Claude](integrations/README.md)**: Prepare an external draft with your own API credentials.
- **[Grok Bot](integrations/GROK_BOT.md)**: Exchange research and drafts through explicit file or local command handoffs.
- **[Tracker CSV](integrations/README.md)**: Map columns, preview selected rows, then import them as research.
- **[Chrome operative](extensions/operative/README.md)**: Optional unpacked extension for the fictional fixture; not a real ATS adapter.

Assistants can prepare drafts from context the person chooses to share. They cannot confirm facts, accept wording, or infer permission to act. Accepting wording records approval of that exact text; it grants no permission to submit. Relay does not independently verify draft claims or assess qualifications.

ChatGPT uses a prompt and file handoff; Codex also supports a local CLI adapter. Relay does not provide a hosted ChatGPT app or hosted MCP connection.

[Integration setup](integrations/README.md) | [ChatGPT and Codex guide](integrations/OPENAI.md) | [Launch copy](LAUNCH.md)
<!-- relay:public:end -->

## Pilot status

Relay is in an invited pilot. No hiring outcomes or time savings have been established.

## Stack

React and Vinext on Cloudflare Workers, with D1 persistence and Drizzle migrations. Local development uses a mock sign-in on the Vite development server; production uses the verified Cloudflare Access gateway.

See [architecture and data ownership](ARCHITECTURE.md), [hosting and recovery](docs/hosting.md), and [delivery checks](docs/delivery.md).

## Run locally

Use Node 24 and pnpm from the repository root:

```sh
node scripts/ensure-node.mjs
pnpm install --frozen-lockfile
pnpm build
```

Apply every migration in order to the local D1 database, then start the app:

```sh
pnpm exec wrangler d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state
pnpm dev
```

The Vite server uses `http://localhost:3000/`. Use fictional records during development. Do not expose the local server to the internet; its sign-in is a development mock. The SQL history tables remain in migrations to preserve existing data, even where the pilot no longer exposes their former screens or APIs.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm public-copy:check
pnpm test:api
pnpm test:orchestration
pnpm test:cli
pnpm test:e2e
pnpm test:production
```

The integration runners create separate local databases. Do not run them against the same D1 state concurrently. Connector tests use mocked vendor responses; they do not prove live account access.

## License

Copyright 2026 SyberLabs. Relay is licensed under the [Apache License, Version 2.0](LICENSE). Third-party dependencies retain their respective licenses. See [NOTICE](NOTICE) for required attribution.
