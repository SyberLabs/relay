# RELAY hosting and release operations

Owner: **sdcarlson**. Peer reviewer: **sykosyber (Mateo)**.

## Decision and current boundary

Use a new **sdcarlson-owned Cloudflare account**, Workers for application execution, D1 for persistence, and Access for the first invited users. The application already executes as a Worker and uses D1. Staying on that runtime avoids introducing a database migration, a second execution platform, or a server to maintain before users validate the workflow. Staging and production each receive their own Worker, database, hostname, Access application audience, and release credentials.

A purchased custom domain is not a prerequisite for the invited pilot. Cloudflare issues a single account `workers.dev` subdomain for personal or hobby use and recommends a custom domain for business-critical production ([workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)). That recommendation must not block this invited-pilot path. Preview URLs stay disabled in both paths.

This repository contains the deployable implementation and delivery process. **It does not establish that an account exists, credentials are connected, or a live release has succeeded.** A missing setting fails the release before migrations. Product usefulness and unique market fit still require evidence from actual users; infrastructure cannot establish them.

Access is appropriate for an invited pilot, with explicitly allowed people and short sessions. Protect the **exact** staging and production hostnames with Access **before** the first deployment ([Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)). Before public self-service enrollment, decide the customer identity, invitation, recovery, deletion, and organization model from pilot evidence. Users signing in through Access have `cloudflare:<subject>` ownership identifiers. Existing Sites accounts are a different identity namespace; do not silently transfer their data.

## Account and environment setup

1. sdcarlson creates the Cloudflare account, enables multifactor authentication, and chooses billing. Give Mateo his own account membership rather than sharing credentials. Set account spending notifications. No paid purchase is made by these workflows. Do not buy a domain to start the invited pilot.
2. Choose a hostname path. Preview URLs stay off in both cases.
   - **Invited-pilot `workers.dev`:** read the account's configured single DNS label from the Cloudflare dashboard. Do not invent one. Set `WORKERS_DEV_SUBDOMAIN` to that label and set `DEPLOY_URL` to the exact origin `https://<WORKER_NAME>.<WORKERS_DEV_SUBDOMAIN>.workers.dev` (`relay-staging` or `relay-production`). Confirm in the dashboard that this label belongs to the same account as `CLOUDFLARE_ACCOUNT_ID` before any credentialed smoke request; matching the URL string does not prove account ownership. Release config then sets `workers_dev: true` and omits custom-domain routes.
   - **Optional custom domain:** add an owned DNS zone on the target account and decide `staging.<domain>` plus the production hostname. Leave `WORKERS_DEV_SUBDOMAIN` unset, or ignore it: custom-domain releases keep `workers_dev: false` and the current custom-domain route.
3. Create databases named `relay-staging` and `relay-production`, using `pnpm exec wrangler d1 create relay-staging` and the corresponding production command after authenticating. Preserve their returned identifiers. Never use the Sites placeholder identifier.
4. In Zero Trust, create separate self-hosted Access applications covering **every path** of the two exact hostnames **before** deploying. For `workers.dev`, that hostname is `relay-staging.<WORKERS_DEV_SUBDOMAIN>.workers.dev` or `relay-production.<WORKERS_DEV_SUBDOMAIN>.workers.dev`, not the `workers.dev` apex and not preview labels. Allow only the invited user emails through the chosen identity provider or email one-time code. Do not add bypass or everyone policies. Set the pilot session duration to one hour. Record each application's audience and the team issuer, such as `https://your-team.cloudflareaccess.com`.
5. Create a separate Access service token per environment and a **Service Auth** policy for it. The pipeline uses it only to test readiness. The application rejects service identities on user workspace routes. Store both returned token fields as GitHub environment secrets.
6. Create deployment API tokens scoped to the target account with Workers Scripts edit, D1 edit, and account read. Add zone and DNS permissions **only** when installing a custom-domain Worker route. A `workers.dev` pilot token does not need zone or DNS access. Prefer one token per environment; Cloudflare permissions may still permit multiple Workers/databases within the account. Do not reuse a personal global API key. Verify the minimal successful scope in staging and rotate tokens on personnel changes.
7. In GitHub Settings → Environments, configure `staging` and `production`. Both allow only `main`. Production requires a peer approval, prevents self-review, and disallows administrator bypass. Keep production credentials unavailable to pull request jobs.

Set these **variables in each environment**: `CLOUDFLARE_ACCOUNT_ID` (32 hex characters), `D1_DATABASE_ID` (that environment's real database identifier), `DEPLOY_URL` (HTTPS origin with no path), `ACCESS_ISSUER` (team URL without trailing slash), and `ACCESS_AUD` (that environment's 64-character audience). For a `workers.dev` target, also set `WORKERS_DEV_SUBDOMAIN` to the account's real single DNS label and set `DEPLOY_URL` to that exact worker origin; the optional variable is unused for custom-domain releases.

Set these **secrets in each environment**: `CLOUDFLARE_API_TOKEN`, `ACCESS_CLIENT_ID`, and `ACCESS_CLIENT_SECRET`. `WORKER_NAME` is fixed by the workflow to `relay-staging` or `relay-production`; the release commit is injected as `RELEASE_SHA`.

The existing `.openai/hosting.json`, Sites plugin, and local authentication path are retained for local development. They are not production identity configuration. Never deploy `dist/server/wrangler.json` directly to your account: it contains placeholder bindings and omits the production identity gateway.

## Identity protection

`deploy/worker.mjs` is the sole production entry. The gateway validates the Access token's RSA signature, issuer, audience, expiration, issued-at time, and human subject/email before replacing application identity headers. Arbitrary `oai-*` headers are removed. Static assets pass through this gateway before being served. Missing provider configuration returns 503; absent or invalid identity returns 401.

`/healthz` returns only health and the release commit, and `/readyz` validates Access authentication and checks the jobs table without returning user data. Access still protects the hostname at the edge. A separate local test fixture injects a generated public key in code to exercise the built application; that fixture is absent from the release artifact and cannot be enabled by a production request or setting.

## Release sequence

1. Required CI checks validate source, dependencies, migrations, browser behavior, identity, and the built production composition.
2. CI compiles the application and then bundles the production gateway once with `node scripts/release/prepare.mjs`. This is a credentialless Wrangler dry run. `artifact.mjs create` seals checksums for every release file and the exact source commit.
3. A successful CI **push on this repository's main branch** triggers Deploy for staging only. Pull requests, forks, manual CI runs, and failed runs cannot supply release artifacts. Each release validates the exact CI run, commit, repository, branch, event, artifact name, and checksums. A newer main commit prevents stale promotion.
4. Staging applies forward migrations and publishes the verified gateway with bundling disabled. For a `workers.dev` target, confirm the configured `WORKERS_DEV_SUBDOMAIN` is the label on `CLOUDFLARE_ACCOUNT_ID` before that credentialed smoke: syntax equality with `DEPLOY_URL` cannot establish account ownership. Protected smoke checks require the expected release, database readiness, and service identity isolation.
5. After staging and human acceptance pass, dispatch **Promote production** from `main` with the full tested `release_sha` and the source CI `run_id` (not the Deploy run ID). Production still requires the independent environment reviewer; dispatching is not approval. After approval, the release checks that the commit is still current main and has matching successful staging `relay-release` evidence for that CI artifact. It then records a D1 recovery bookmark, applies migrations, publishes the same compiled artifact, and repeats protected smoke. Secrets/configuration differ by environment; application code does not rebuild.
6. Only after smoke passes does the workflow record a separate `relay-release` deployment tied to the **actual release commit and source CI run**. This evidence is distinct from GitHub's automatic environment record, whose commit may refer to the triggering workflow.

A failed smoke check blocks success and requires investigation; it does not automatically undo data or silently redeploy another version. Logs contain no imported resumes, drafts, or database exports. Worker observability samples requests; avoid adding personal content to logs. Add an external authenticated availability monitor once the real hostname and its operational owner exist.

### Choose and promote a candidate

1. Open the successful **Deploy** staging run. Record its full release SHA and source **CI** run ID from the release evidence. Complete the signed-in checks in [abuse controls](abuse-controls.md#provision-and-release) and the pilot journey on that build. Smoke alone is not human acceptance.
2. Confirm that SHA is still current `main`. In Actions → **Promote production** → **Run workflow**, select `main`, enter `release_sha` and `run_id`, and dispatch once for this candidate.
3. The eligible peer reviews that candidate's evidence and approves its `production` environment gate. GitHub prevents self-review; the eligible reviewer depends on who dispatched this run. Existing environment protections and secrets stay unchanged.
4. Confirm production protected smoke and matching `relay-release` success, then perform the required signed-in production acceptance. If main advances while approval is pending, reject the obsolete promotion and select the newer staged candidate after acceptance. An accidentally approved stale candidate fails before publication.

Staging and production use independent [job concurrency groups](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) because they have separate Workers and databases. Promotion and rollback share the production group. `cancel-in-progress: false` keeps an active migration/publication running; a newer pending job can replace an older pending job under GitHub's default queue policy. Ordering is not a release guarantee: the current-main check runs after the gate and queue, before any release work. A deliberately dispatched but abandoned production approval can still need rejection before another production operation; it cannot block staging. Dispatch promotion only when the candidate is ready.

**Transition from the old workflow:** before merging this scheduling change, let any active legacy Deploy/Rollback migration or publication finish. The old `relay-delivery` group does not coordinate with the new environment groups. Cancel a superseded legacy Deploy only after confirming staging completed and production is still approval-only with no steps started. Do not rerun legacy release workflows after transition; use current-main Deploy, Promote production, or Rollback with the original eligible CI artifact. Existing runs keep their old workflow definition, so a merge cannot remove their approval waits retroactively. No provider settings or database migration are needed for this scheduling change.

## Rollback and database safety

Dispatch **Rollback** from `main` with the prior successful production commit and its original successful main CI run ID. The artifact must still be retained. The production reviewer approves the action. The workflow accepts only matching `relay-release` success evidence, validates every artifact byte again, and refuses a rollback when `drizzle/` differs from current main. It republishes the old application artifact with no database migration or restoration.

The schema check is deliberately conservative. If schema files differ, investigate the specific compatibility boundary and ship a reviewed forward fix. Do not override the gate to make a failing deployment appear recovered. Use additive migrations and a later reviewed cleanup once older application versions are no longer needed. Review initial data-changing migrations before the first real-user release.

For actual database corruption, sdcarlson owns the separate incident decision: stop writes, identify the last good D1 Time Travel bookmark and its retention, determine what user changes would be lost, obtain explicit restore authorization, restore in a controlled recovery procedure, then verify data integrity and two-user isolation. **No workflow automatically reverses the database.** Rehearse recovery on staging with fictional records before inviting users.

## First live acceptance

Confirm staging CI and protected smoke passed; sign in separately as sdcarlson and Mateo; verify each can import, edit, save, and reload their own fictional records and cannot read or change the other's records. Confirm logout and expired sessions. Rehearse a compatible artifact rollback and staging database recovery. Then approve the first production deployment and repeat the two-user check. Record actual URLs and successful run links in the launch ticket, without copying secrets.

## Provider references

- [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Access application token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Workers configuration, assets and bindings](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Rollback limitations](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
