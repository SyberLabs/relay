# RELAY hosting and release operations

Owner: **sdcarlson**. Peer reviewer: **sykosyber (Mateo)**.

## Decision and current boundary

Use the existing **sdcarlson-owned Cloudflare account**, Workers for application execution, D1 for persistence, and Access for the first invited users. The application already executes as a Worker and uses D1. Staging and production have separate Workers, databases, hostnames, and GitHub environment configuration. The accepted `workers.dev` pilot uses the account-level **All Workers** Access application with one audience shared by both environments; separate audiences are not a pilot requirement. Keep deployment and smoke credentials in their respective protected GitHub environments.

A purchased custom domain is not a prerequisite for the invited pilot. Cloudflare issues a single account `workers.dev` subdomain for personal or hobby use and recommends a custom domain for business-critical production ([workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)). That recommendation must not block this invited-pilot path. Preview URLs stay disabled in both paths.

The [hosting ticket](https://github.com/SyberLabs/relay/issues/3) records the configured account and release evidence. [Two-user staging isolation](https://github.com/SyberLabs/relay/issues/4#issuecomment-5562043385) and [staging recovery](https://github.com/SyberLabs/relay/issues/6#issuecomment-5562128477) have completed evidence. **Staging success does not establish a production release.** Verify the current commit, source CI run, protected smoke, and successful `relay-release` record for the target environment. A missing setting fails the release before migrations. Product usefulness still requires evidence from actual users.

Access is appropriate for an invited pilot, with explicitly allowed people and short sessions. Protect the **exact** staging and production hostnames with Access **before** the first deployment ([Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)). Before public self-service enrollment, decide the customer identity, invitation, recovery, deletion, and organization model from pilot evidence. Users signing in through Access have `cloudflare:<subject>` ownership identifiers. Existing Sites accounts are a different identity namespace; do not silently transfer their data.

## Account and environment setup

1. Reuse the account recorded in the hosting ticket; do not create a second account. sdcarlson owns account security and billing. Mateo uses his own account membership rather than shared credentials. Preserve multifactor authentication and account spending notifications. No paid purchase is made by these workflows. Do not buy a domain to start the invited pilot.
2. Choose a hostname path. Preview URLs stay off in both cases.
   - **Invited-pilot `workers.dev`:** read the account's configured single DNS label from the Cloudflare dashboard. Do not invent one. Set `WORKERS_DEV_SUBDOMAIN` to that label and set `DEPLOY_URL` to the exact origin `https://<WORKER_NAME>.<WORKERS_DEV_SUBDOMAIN>.workers.dev` (`relay-staging` or `relay-production`). Confirm in the dashboard that this label belongs to the same account as `CLOUDFLARE_ACCOUNT_ID` before any credentialed smoke request; matching the URL string does not prove account ownership. Release config then sets `workers_dev: true` and omits custom-domain routes.
   - **Optional custom domain:** add an owned DNS zone on the target account and decide `staging.<domain>` plus the production hostname. Leave `WORKERS_DEV_SUBDOMAIN` unset, or ignore it: custom-domain releases keep `workers_dev: false` and the current custom-domain route.
3. Create databases named `relay-staging` and `relay-production`, using `pnpm exec wrangler d1 create relay-staging` and the corresponding production command after authenticating. Preserve their returned identifiers. Never use the Sites placeholder identifier.
4. Protect **every path** of both hostnames with Access **before** deploying. For the accepted `workers.dev` setup, preserve the account-level **All Workers** application and configure its same audience in both environments. Confirm coverage of `relay-staging.<WORKERS_DEV_SUBDOMAIN>.workers.dev` and `relay-production.<WORKERS_DEV_SUBDOMAIN>.workers.dev`; preview URLs remain disabled. Do not replace this arrangement with hostname-specific applications as routine release preparation. If an owned custom domain is deliberately adopted later, configure separate self-hosted applications for its exact staging and production hostnames. Allow only invited people through the chosen identity provider or email one-time code; never add bypass or everyone policies. Keep short pilot sessions (one hour) and record the application's audience and team issuer.
5. Create a separate Access service token per environment and a **Service Auth** policy for it. The pipeline uses it only to test readiness. The application rejects service identities on user workspace routes. Store both returned token fields as GitHub environment secrets.
6. Create deployment API tokens scoped to the target account with Workers Scripts edit, D1 edit, and account read. Add zone and DNS permissions **only** when installing a custom-domain Worker route. A `workers.dev` pilot token does not need zone or DNS access. Prefer one token per environment; Cloudflare permissions may still permit multiple Workers/databases within the account. Do not reuse a personal global API key. Verify the minimal successful scope in staging and rotate tokens on personnel changes.
7. In GitHub Settings → Environments, configure `staging` and `production`. Both allow only `main`. Production requires a peer approval, prevents self-review, and disallows administrator bypass. Keep production credentials unavailable to pull request jobs.

Set these **variables in each environment**: `CLOUDFLARE_ACCOUNT_ID` (32 hex characters), `D1_DATABASE_ID` (that environment's real database identifier), `DEPLOY_URL` (HTTPS origin with no path), `ACCESS_ISSUER` (team URL without trailing slash), and `ACCESS_AUD` (the 64-character audience of the Access application protecting that origin; shared for the accepted All Workers setup). For a `workers.dev` target, also set `WORKERS_DEV_SUBDOMAIN` to the account's real single DNS label and set `DEPLOY_URL` to that exact worker origin; the optional variable is unused for custom-domain releases.

Set these **secrets in each environment**: `CLOUDFLARE_API_TOKEN`, `ACCESS_CLIENT_ID`, and `ACCESS_CLIENT_SECRET`. `WORKER_NAME` is fixed by the workflow to `relay-staging` or `relay-production`; the release commit is injected as `RELEASE_SHA`.

The existing `.openai/hosting.json`, Sites plugin, and local authentication path are retained for local development. They are not production identity configuration. Never deploy `dist/server/wrangler.json` directly to your account: it contains placeholder bindings and omits the production identity gateway.

## Identity protection

`deploy/worker.mjs` is the sole production entry. The gateway validates the Access token's RSA signature, issuer, audience, expiration, issued-at time, and human subject/email before replacing application identity headers. Arbitrary `oai-*` headers are removed. Static assets pass through this gateway before being served. Missing provider configuration returns 503; absent or invalid identity returns 401.

`/healthz` returns only health and the release commit, and `/readyz` validates Access authentication and checks the jobs table without returning user data. Access still protects the hostname at the edge. A separate local test fixture injects a generated public key in code to exercise the built application; that fixture is absent from the release artifact and cannot be enabled by a production request or setting.

## Release sequence

1. Required CI checks validate source, dependencies, migrations, browser behavior, identity, and the built production composition.
2. CI compiles the application and then bundles the production gateway once with `node scripts/release/prepare.mjs`. This is a credentialless Wrangler dry run. `artifact.mjs create` seals checksums for every release file and the exact source commit.
3. A successful CI **push on this repository's main branch** triggers Deploy. Pull requests, forks, manual CI runs, and failed runs cannot start releases. Each release validates the exact CI run, commit, repository, branch, event, artifact name, and checksums. A newer main commit prevents stale promotion.
4. Staging applies forward migrations and publishes the verified gateway with bundling disabled. For a `workers.dev` target, confirm the configured `WORKERS_DEV_SUBDOMAIN` is the label on `CLOUDFLARE_ACCOUNT_ID` before that credentialed smoke: syntax equality with `DEPLOY_URL` cannot establish account ownership. Protected smoke checks require the expected release, database readiness, and service identity isolation.
5. Production waits for environment approval after staging passes. The release records a D1 recovery bookmark, applies migrations, publishes the same compiled artifact, and repeats the protected smoke checks. Secrets/configuration differ by environment; application code does not rebuild.
6. Only after smoke passes does the workflow record a separate `relay-release` deployment tied to the **actual release commit and source CI run**. This evidence is distinct from GitHub's automatic environment record, whose commit may refer to the triggering workflow.

A failed smoke check blocks success and requires investigation; it does not automatically undo data or silently redeploy another version. Logs contain no imported resumes, drafts, or database exports. Worker observability samples requests; avoid adding personal content to logs. Add an external authenticated availability monitor once the real hostname and its operational owner exist.

### Superseded approval waits

Deploy and Rollback share `relay-delivery` concurrency with cancellation disabled. A production approval wait can therefore block staging for a newer main commit. Before requesting approval, compare the candidate SHA with current main: a non-rollback release checks this again after approval and refuses a stale commit before migrations or publication. Approval cannot select an older release or override that check.

To unblock the intended newer release, recheck the older run and all its jobs immediately before cancellation. Cancel only a conclusively superseded run whose staging job is complete and whose production job is still waiting for approval. Never cancel an active migration or publication. Let the queued workflow run and verify its actual staging result before handing its exact SHA and run URL to Mateo. Do not approve the obsolete run, bypass protection, or dispatch a second deployment mechanism.

## Rollback and database safety

Dispatch **Rollback** from `main` with the prior successful production commit and its original successful main CI run ID. The artifact must still be retained. The production reviewer approves the action. The workflow accepts only matching `relay-release` success evidence, validates every artifact byte again, and refuses a rollback when `drizzle/` differs from current main. It republishes the old application artifact with no database migration or restoration.

The first production release has no previous successful production artifact to select. A staging version-switch rehearsal does not satisfy the production Rollback gate. If the first release fails, investigate the failed step and prepare a reviewed forward fix; a database restore remains a separate authorized recovery decision.

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
