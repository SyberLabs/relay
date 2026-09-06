# Security

Use [GitHub private vulnerability reporting](https://github.com/SyberLabs/relay/security/advisories/new). Do not include personal applicant data or live credentials in a public issue. Maintainers are `@sdcarlson` and `@sykosyber`.

Only the current main branch is maintained. RELAY is pre-pilot; no response-time guarantee or external security certification is claimed.

Production must validate identity cryptographically and isolate every query by user. The Sites development server simulates sign-in and must bind only to loopback. A raw Worker that trusts incoming `oai-authenticated-*` headers is not a safe deployment.

On an incident, stop promotion, revoke exposed credentials, preserve redacted evidence, assess affected users and records, and record the recovery decision. Never publish a production database snapshot as a build artifact. Application rollback does not roll back database state; restore only through an explicitly reviewed recovery procedure.
