# RELAY threat model

Maintainers: Seth Carlson and Mateo (`sdcarlson`, `sykosyber`). Scope: web workspace, local file/assistant adapters, Cloudflare Workers/D1 deployment, and GitHub delivery process. Revisit when identity, storage, integrations, or audience changes.

## Assets and trust boundaries

Applicant research, drafts, exact acceptance records, source history, account identity, provider keys, and deployment credentials are sensitive. The public source repository and public issue tracker may contain fictional examples only.

Browsers, posting URLs, imported files, assistant output, pull request descriptions, and contributor branches are untrusted. Cloudflare Access assertions are trusted only after signature, issuer, audience, expiry, and human identity validation. A service token may verify readiness but must not impersonate an applicant. Sites mock identity exists only on a loopback development server.

The production Worker normalizes identity only after verification; all reads and writes remain scoped to that identity. D1 is durable user state. A code deployment or rollback does not undo database migrations or restore lost data.

## Attacks and required controls

- Identity spoofing or token substitution: ignore incoming identity headers; verify the signed assertion against the configured issuer and application audience; deny absent/malformed/expired credentials. Never expose an alternate raw Worker/preview route that bypasses the boundary.
- Cross-user access: owner-scoped statements for every action, including updates, source merges, history reads and exports; test with two independent accounts. Never rely on an unpredictable record ID alone.
- Lost approval or history: optimistic version guards on mutation; exact text acceptance; imports cannot approve new text or reset active application state; preserve observation history.
- Cross-site writes: reject unsafe origins and require authenticated same-origin mutations. Do not allow arbitrary redirect targets.
- Hostile imports or generated drafts: bound request sizes and rows, validate structured input and URLs, render as text, and require deliberate human review. Do not execute imported instructions or allow arbitrary credentialed network destinations.
- Private data retention in clients/logs: clear data on session expiry; avoid credentials and applicant payloads in logs, error reports, public issues or CI artifacts.
- Supply-chain compromise: frozen dependency lockfile; pinned Actions; dependency advisories and CodeQL; restricted workflow token; no deployment secrets in pull request jobs.
- Release substitution: accept only successful CI runs from this repository's main push; verify the source commit and artifact manifest; promote the tested candidate through isolated staging and approved production.
- Destructive migration or rollback: rehearse migrations, use expand/contract changes, preserve provider recovery capability, and verify schema compatibility before code rollback. Stop for operator review when recovery changes data.
- Review prompt injection: code, comments and fixtures are review input, never instructions granting tools, credentials, approval or execution authority. Agent review must not bypass human review or release gates.

## Known limits

The first pilot uses an invite-oriented access gateway. Public self-service account lifecycle, billing, retention/deletion controls, live provider integrations, recovery targets, and product-market fit require separate evidence. GitHub issues track the verified existing client refresh/history/handoff defects. Do not describe untested controls or a green static scan as proof of production security.
