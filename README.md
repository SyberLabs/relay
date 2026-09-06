# Relay by SyberLabs

**Your job search should remember what you've done.**

Relay is a job-search review workspace for people working with AI assistants. Bring research from multiple sources into one job history, prepare exact drafts, and keep interview follow-ups alongside the application.

## Available in this early release

- Drive the whole loop from a local command line, with exit codes an agent can act on.
- Set what a job is worth to you by choosing between real postings, not by filling in sliders.
- Get a weekly plan sized to the minutes you actually have, chosen to maximise the best single offer.
- Pull public Greenhouse and Lever boards into the same job identity as everything else.
- Record what came back, with a receipt required before anything counts as submitted.
- See exactly which claims each live application commits you to defending.
- Keep a verified fact ledger and a learned style card that direct a writing agent.
- Seed the ledger from pasted resume text, then verify each candidate line before it can be cited.
- Let an agent log drafts unattended; a claim not traceable to a verified fact is refused, not queued.
- Review logged drafts in batches, correcting habits once instead of per letter.
- Earn autonomy per role cluster: a proven cluster stages its own drafts, and still never accepts or sends one.
- Consolidate repeated posting URLs and preserve research history.
- Edit notes and follow-up drafts on submitted jobs and active interviews without resetting their status.
- Accept an exact draft; changing it returns it to review.
- Import Notion research through a read-only command connector.
- Prepare drafts through the Claude API using your verified facts and your own credentials.
- Exchange validated research and draft files with Grok Bot in its VM.
- Explore fictional example records. No real applicant data is included.

[Integration setup](integrations/README.md) | [Grok Bot instructions](integrations/GROK_BOT.md) | [Launch copy](LAUNCH.md)

## GrokCell bot templates

The [GrokCell folder](grokcell/README.md) includes First Principles, Product Ideation, Red Flag, and Garbage Collector with their source instructions, profiles, public bot links, and behavior checks. Use a specialist when its purpose fits the task. These templates do not connect to Relay or grant access to application records automatically; the [Relay adapter](integrations/GROK_BOT.md) remains the guide for exchanging job research and drafts.

This is a pinned copy of the separately maintained, MIT-licensed [GrokCell project](https://github.com/sdcarlson/grokcell). Propose template improvements upstream, then refresh the copy following [its source record](grokcell/UPSTREAM.md).

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
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sticky_robbie_robertson.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_careless_leader.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_job_key_observations.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_profile_calibration.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_selection_and_outcomes.sql
pnpm dev
```

Open the local URL printed by the server. Local sign-in is simulated by the Sites development plugin; do not expose this development server to the internet. Load fictional examples or import your own records. The product introduction is at `/about`.

## Selection and outcomes

Drafting well is not the largest lever. Which jobs you apply to is, because reply odds vary by orders of magnitude with fit while letter quality varies perhaps twofold. These stages address that.

**Preferences** (`/preferences`) are elicited by forced choice over real postings, because people cannot state trade-off weights in the abstract but choose between two concrete jobs instantly. Around a dozen comparisons fit the five weights well enough to rank a large pool. Until you answer, Relay has no opinion and says so rather than inventing one.

**The plan** (`/plan`) maximises the expected value of the *best single offer*, not the sum over applications, because you accept one job. That is an expected maximum, and computing it exactly produces a spread of odds on its own: once a likely offer is held, further similar roles add almost nothing and a long shot starts winning the comparison. No reach/match/floor ratio is hardcoded. Selection is greedy on gain per minute under the attention budget you set, and every row carries the reason it earned its place.

**The read plane** pulls public Greenhouse and Lever boards through `board-pull`, normalising onto the same `jobKey` identity the workspace already uses. It reads only, needs no credentials and no account, and every posting arrives Held — discovery never implies a decision.

**Outcomes** (`/track`) close the loop. Terminal states are local records of what actually happened and are deliberately not valid import statuses, so the existing import behaviour is unchanged and rediscovery can never reopen an application that has ended. A submission recorded here requires a receipt: the confirmation URL, reference or email subject. Imported submissions are kept and shown, but they arrive without a receipt and are excluded from the reply rates, because counting a send that may never have happened would corrupt every estimate built on it.

Reply rates are reported as intervals with the evidence count that produced them, and they are descriptive. Samples are small, the market moves and a job search cannot be run as an experiment, so nothing here establishes that a change caused an outcome.

**The command line** (`integrations/README.md`) is how an agent reaches all of this without a browser. It is local-only, it shares one client with the future MCP server, and it deliberately cannot accept a draft, verify a fact, close a review or submit anything — adding a transport must never add a capability. A refused draft exits 3 and writes nothing, which is kept distinct from a server failure so an agent never retries its way past the citation gate.

**Interview preparation** falls out of the citation graph rather than being a separate feature: because every claim had to cite a verified fact, Relay already knows what each application commits you to defending.

Relay still does not submit applications. There are no write-plane adapters in this release: nothing here fills in a form, sends an email, or messages anyone, and recording a submission is you telling Relay what you already did.

## Integration boundaries

The connectors are runnable local commands with file import/export in the app. Notion and Claude require your own credentials. Real Notion records were retrieved read-only through the connected Notion tool; that does not validate the standalone Notion command connector. Claude live access has not been tested. Grok Bot uses a documented command/file adapter, not an assumed proprietary API. A draft was exchanged with the installed Bot, transcribed into a validated file, then loaded in the browser; fully automatic Bot file transfer is not validated. There is no automatic background sync, autonomous hunting, application sending, or LinkedIn messaging. Agents may log and, for a graduated cluster, stage drafts; they cannot accept one or change an application status. Board pulls read public endpoints only and use no account identity. No component submits an application: there are no write-plane adapters, and a recorded submission is your own report of something you did elsewhere, carrying the receipt to prove it. Citation enforcement checks that a claim traces to a fact you verified, which is not the same as checking that the surrounding wording is true, so generated text still requires your review. Production deployment has not been validated.

## Checks

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
node tests/api.test.mjs
node tests/calibration.test.mjs
node tests/orchestration.test.mjs
node tests/cli-live.test.mjs
```

For an existing local database already on migration 0003, apply only 0004; it adds the preference, choice and outcome tables and adds nullable or defaulted posting columns to `jobs`, leaving existing rows untouched. From 0002, apply 0003 then 0004; from 0001, apply 0002 first. It preserves observations and repairs imported Ready records that lack matching accepted text. Imported Ready is research evidence; a new record stays Held until its exact draft is accepted in Relay.

The last command needs a running local server and writes only fictional test records. Domain, import, editor and connector tests cover status preservation, duplicate matching, imported acceptance, observation identity, editor version conflicts, draft review rules, provider errors and pagination. Connector tests mock vendor responses; they do not prove live account access. Profile tests cover claim detection, citation support, resume extraction, review triggers and cluster graduation. Selection tests cover the preference fit, the expected-maximum arithmetic against hand-computed cases, budget-respecting portfolio choice, board normalisation, and the rule that a terminal outcome can never be reopened by import — checked against the real upsert SQL as well as the TypeScript. The three live suites each need a **fresh local database**, because they exercise one signed-in workspace end to end; run them one at a time after re-applying the migrations. API checks verify database read-back, stale edits, exact acceptance, status-preserving follow-up edits and authentication rejection. Calibration checks run the whole loop against a local server: extraction writing nothing, an unverified citation and an unsupported claim both refused without a row being written, a correction proposing rules, a closed session advancing the profile version, a cluster graduating into unattended staging that leaves status and acceptance alone, and a retired fact blocking further citation. Local browser and WebMCP reads/import checks were exercised. Preview works before the first import. Browser file import, save and reload preserved source history. User acceptance and post-acceptance reimport are pending.

## Hosting and privacy

React/Vinext on Cloudflare Workers with D1 persistence and Sites authentication. The checked-in hosting manifest declares logical bindings only; it includes no owner's project ID. A production deployment needs its own Sites project and trusted authentication gateway. The app reads identity headers supplied by that gateway; deploying the raw Worker without equivalent trusted authentication is unsafe. This repository does not contain a public hosted service.

Keep real imports, packets and draft results in ignored `private-data/`. Keep API keys in environment variables. Local databases, build output, credentials, personal records and the original development Git history are excluded from this release.

Maintained by SyberLabs. Early release: no hiring outcomes, reliability targets or throughput improvements have been established. The bundled `grokcell/` templates are covered by their [MIT license](grokcell/LICENSE). No open-source license is granted for the rest of Relay in this release; contact SyberLabs for licensing.
