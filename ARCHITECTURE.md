# Relay architecture

Relay is a private, owner-scoped job record with explicit assistant handoffs and human-controlled application actions. Its core is one record per job: selected research, user-confirmed facts, draft wording, accepted text, state, and history.

## Record and ownership

The React application runs on Vinext and Cloudflare Workers, with D1 persistence. Production identity comes from the trusted Cloudflare Access gateway; local sign-in is a development mock and must not be exposed.

Every workspace read and write is scoped to the authenticated owner. Jobs hold the current application state, draft, accepted wording, receipt, and version. Observations preserve imported research; events preserve review and state changes; outcomes preserve user- and operative-reported results. Imports can add evidence, but cannot accept wording or reset existing state.

## Draft handoff

The user prepares a packet for an external assistant and chooses which confirmed facts to include. Relay does not independently verify claims or automatically select facts as true for a draft. The assistant returns wording for the selected job. Relay checks job identity and the version used to create the draft; stale writes are refused. Saving a draft is not acceptance. The user reviews and accepts its exact wording, and any edit requires fresh acceptance.

File and local-command integrations read or write only the selected files or packet. Signed-in browser tools expose the owner's permitted Relay records. There is no background account synchronization.

## Application actions and history

Users enter application state and outcomes manually. In the fictional fixture, the included operative can also record Submitted when it reports a receipt. Relay does not independently verify employer-side action; a receipt records only what the user or operative reported.

The separate application coordination flow can prepare and freeze one exact operation. A human must review it in Inspect and choose **Accept and send** before Relay issues a one-use permit to an external browser operative. Relay itself does not POST an employer form. The included Chrome operative is demonstrated only against a fictional fixture. A lost or uncertain result is inspected; it must never be retried as a new submission without evidence that the first action did not occur.

Acceptance of draft wording alone is not permission to submit. Imports, assistant output, policy settings, and chat messages cannot grant that permission.

## Compatibility and history

The SQL migration history and existing database tables are preserved. Some tables and fields belonged to removed experimental surfaces, including preference fitting, batch review, and the internal agent runtime. The current pilot does not expose those features. Keeping their historical schema avoids deleting or rewriting stored records; future schema cleanup requires a separate compatibility plan.

## Local development

Use Node 24 and pnpm. `pnpm dev` starts the local app on `http://localhost:3000/`; use fictional records because local sign-in is simulated. Never expose that server publicly.

The API and orchestration checks create isolated local databases and apply the full migration history. See [hosting and recovery](docs/hosting.md) for the deployment boundary and [delivery checks](docs/delivery.md) for release validation.
