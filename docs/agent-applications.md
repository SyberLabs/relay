# Applications coordinated by Relay

Owner: Seth. Implementation: #112, #128, #135, #144; authenticated assistant verification: #111.

Relay coordinates an external operative filling an employer form while the human authorizes send from Inspect. Relay owns durable evidence and authorization. It does not POST the employer form. The existing peer merge review and production environment approval remain required.

For the exact existing requests and interruption rules without WebMCP or file
transfer, use the [direct browser handoff](../integrations/BROWSER-API.md) (#144).

## Handshake

Default Inspect path is policy `review: all`: freeze always lands `proposed`, never auto-`authorized`. Overlay `/apply` shows the operative Inspect summary; it has no Accept control. There is no approve tool — the human clicks **Accept and send** in the signed-in workspace.

```text
prepare → arm → human Inspect Accept → begin (execute:true) → employer Submit once → complete
```

1. The operative overwrites the live preparation for one owner+job (`prepare`): exact destination, fields, and files. Unknown answers use `unknown: true` and stop the send path. This does not insert an operation.
2. The operative `arm`s a complete snapshot. Relay freezes the exact JSON into an immutable operation (`proposed`) and keeps a 20-second presence window. Incomplete or unknown fields are refused. Repeat `arm` to extend presence without changing the digest.
3. The human Inspects the selected job. **Accept and send** is enabled only while the payload is complete and `armed_until` is in the future. Clicking it approves that digest (`authorized`). Draft Ready, chat “yes”, and policy `review: sensitive` ordinary-field shortcuts are not send permission on Inspect.
4. The waiting operative calls `begin`. A true `execute` is the one permit to click the employer Submit control once. Relay does not POST the form. A lost `begin` response is inspected on GET; `executing` is not permission to submit again. Never retry `executing`.
5. The operative records the observed receipt with `complete` (Submitted), `uncertain` (do not retry), or `not-submitted` (evidence no send occurred). Cancellation cannot recall data already sent.

Each assistant signs into Relay through its own supported browser and the existing Cloudflare Access flow. A desktop login does not sign in a remote agent. Use `/apply?job=` in the operative VM next to the employer page when WebMCP is available. Do not export session cookies, add service-token access, inject into the employer origin, or expose the development application.

Scout imports still use Held and cannot grant approval. Existing jobs are deduplicated by posting identity. Imports add evidence; they cannot authorize send.

## Trust and limits

The initial transport uses the owner's authenticated browser session. Agent names are reported provenance, not independently authenticated identities or scoped credentials. This does not yet establish revocable per-agent access (#111); closing sessions and account access remain the identity controls. Browser agents have the same account capabilities as their owner. Relay cannot prevent an external agent from independently opening an employer site or verify an agent-reported receipt with no employer integration. Those limitations must remain visible in the release evidence.

No new scheduler, provider catalog, chat frontend, paid model call, or hosted crawler is needed. Recurring scouting runs on the external assistant's existing scheduling and resources, after the direct workflow passes. No Relay-funded background work is introduced.

All routes inherit gateway authentication, owner/global work quotas, body bounds, CAPTCHA, and kill switch. Owner isolation on every read/write: no other owner's preparation or operation is visible. One mutation weighs ten work units; `arm` is presence weight 1, 6 per user per minute. Proposals are bounded to 100 fields, two files, and 240,000 serialized UTF-8 bytes. Up to 500 immutable proposals and 500 preparation rows per owner; never prune history to admit work. Listing returns at most 20 manifests with cursor pagination. One policy per owner; at most 100 allowed jobs, expiration at most 30 days, maximum 10 submissions per UTC day and 100 per policy. Submission starts use atomic database predicates; failures and uncertainty retain consumed capacity.

## Verification and release

- Database tests: competing agents, duplicate/ambiguous requests, owner isolation, policy revocation, stale content, capacity, immutable evidence, arm window, approve-requires-arm, and no changes after refusal.
- Browser tests: prepare exact fields/files, Inspect Accept only while armed, consume once, resume uncertainty, inspect receipt and archived payload, compact `/apply` overlay without Accept.
- Required delivery checks and final peer review precede merge. Pin the staged artifact; obtain separate production approval.
- Real pilot: use Seth's confirmed profile, constraints, and prior application history; select ten unsubmitted roles. Record each agent handoff, exact manifest, interventions, employer receipt, and final Relay state privately. Ten fictional fixtures are not ten real applications. Do not claim complete until ten employer confirmations and matching Relay records exist.

Current open prerequisites: confirm Seth's pilot constraints/review setting, establish the actual ChatGPT browser execution path, and prove revocable scoped access for #111. The existing authenticated browser route can validate the application ledger independently, but cannot close #111 by itself.
