# Applications coordinated by Relay

Owner: Seth. Implementation: #112; authenticated assistant verification: #111.

Seth's September 7 direction expands Relay from draft review to coordinating external agents that discover roles and submit applications. Grok Bot scouts; ChatGPT with computer use applies. Relay owns durable evidence and authorization. The existing peer merge review and production environment approval remain required.

## Smallest complete workflow

1. Each assistant signs into Relay through its own supported browser and the existing Cloudflare Access flow. A desktop login does not sign in a remote agent. Use the browser interface when WebMCP is unavailable. Do not export session cookies, add service-token access, or expose the development application.
2. Grok uses existing research import and source history. Scout imports explicitly use Held and cannot grant approval. Existing source-reported outcomes remain historical records. Existing jobs are deduplicated by posting identity.
3. The user enables application automation for an explicit set of saved jobs, expiration, submission limit, and review setting. Default: disabled and review every application. Automation permission is separate from exact draft acceptance.
4. The applying agent saves an immutable proposed submission: exact destination, every field/value, and exact file bytes. Unknown answers stop preparation. A stable operation identifier survives response loss. Different content requires a new proposal.
5. The server binds permission to the job version and policy version. A review-required proposal displays its complete contents for explicit approval. Unattended permission is labeled policy-authorized, never human-reviewed.
6. Immediately before the first employer-side write (including form entry/upload), the agent obtains a single execution permit. This atomically consumes capacity and locks that job against another applying agent. An ambiguous permit response must be inspected; it must never result in another submission attempt.
7. The agent performs the approved operation once, records the employer confirmation, and retains the exact manifest. Uncertain employer outcomes remain uncertain and block another attempt. After explicitly verifying that no application was submitted, record that evidence to permit a fresh proposal; the earlier payload and consumed capacity remain. Cancellation cannot recall data already sent. No automatic expiry or retry of an executing operation.
8. The Relay interface shows proposals, authorization basis, execution state, and receipts. It exposes review and cancellation without requiring routine manual packet transfer.

## Trust and limits

The initial transport uses the owner's authenticated browser session. Agent names are reported provenance, not independently authenticated identities or scoped credentials. This does not yet establish revocable per-agent access (#111); closing sessions and account access remain the identity controls. Browser agents have the same account capabilities as their owner. Relay cannot prevent an external agent from independently opening an employer site or verify an agent-reported receipt with no employer integration. Those limitations must remain visible in the release evidence.

No new scheduler, provider catalog, chat frontend, paid model call, or hosted crawler is needed. Recurring scouting runs on the external assistant's existing scheduling and resources, after the direct workflow passes. No Relay-funded background work is introduced.

All routes inherit gateway authentication, owner/global work quotas, body bounds, CAPTCHA, and kill switch. One mutation weighs ten work units. Proposals are bounded to 100 fields, two files, and 180,000 serialized UTF-8 bytes. Up to 500 immutable proposals per owner; never prune history to admit work. Listing returns at most 20 manifests with cursor pagination. One policy per owner; at most 100 allowed jobs, expiration at most 30 days, maximum 10 submissions per UTC day and 100 per policy. Submission starts use atomic database predicates; failures and uncertainty retain consumed capacity.

## Verification and release

- Database tests: competing agents, duplicate/ambiguous requests, owner isolation, policy revocation, stale content, capacity, immutable evidence, and no changes after refusal.
- Browser tests: configure policy, prepare exact fields/files, review, consume once, resume uncertainty, inspect receipt and archived payload.
- Required delivery checks and final peer review precede merge. Pin the staged artifact; obtain separate production approval.
- Real pilot: use Seth's confirmed profile, constraints, and prior application history; select ten unsubmitted roles. Record each agent handoff, exact manifest, interventions, employer receipt, and final Relay state privately. Ten fictional fixtures are not ten real applications. Do not claim complete until ten employer confirmations and matching Relay records exist.

Current open prerequisites: confirm Seth's pilot constraints/review setting, establish the actual ChatGPT browser execution path, and prove revocable scoped access for #111. The existing authenticated browser route can validate the application ledger independently, but cannot close #111 by itself.
