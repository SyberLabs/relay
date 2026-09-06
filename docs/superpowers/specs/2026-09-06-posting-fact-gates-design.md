# Posting vs verified facts (ATS-aligned resume work)

**Issue:** [#71](https://github.com/SyberLabs/relay/issues/71)
**Date:** 2026-09-06
**Decision owner:** Seth Carlson

## Problem

Applicant tracking systems parse a file, drop candidates who miss stated requirements, then search or rank on overlapping terms. Relay cannot observe those scores. A match percentage would be a lie.

Relay already seeds a fact ledger from resume text and refuses draft claims that are not cited. Cover letters are exact-accepted. Resumes are not a per-job artifact. People still get filtered because the posting's required lines are not compared with facts they have actually verified.

## Decision

Do **A then B**. Never **C**.

- **A (this issue):** On a selected job, show derived hit / miss / unknown for required lines in source notes versus verified facts. A miss is a reason to set the job aside or to verify a real fact. It does not change status, invent a skill, or produce a score.
- **B (later issue):** A job-specific resume projection: parseable layout, posting vocabulary for skills that already exist in the ledger, citation-gated, exact-accepted like a letter.
- **C (deleted):** Match-percentage theater, per-vendor simulators, hidden text, keyword stuffing.

Who owns "ATS success"? Nobody with ground truth. The honest product is evidence, then an accepted document, not an adversarial optimizer.

## Approaches considered

1. **Employer-system clone.** Simulate Workday/Greenhouse parsers and rankers. High cost, no ground truth, unmaintainable. Rejected.
2. **Resume mill.** Generate a new PDF per job with stuffed keywords. Duplicates Simplify/Teal, fights the fact ledger, invites false claims. Rejected for now; a later projection may exist only if every line cites a verified fact and a human accepts the exact text.
3. **Derived gates (chosen).** Reuse the ledger, citation overlap, job identity, and the existing "imports do not grant approval" rule. No new tables. No automation of skip.

## Slice 1 (this implementation)

### What it does

A pure function reads posting text (job name + that job's observation notes) and the caller's verified, unexpired facts. It extracts required lines and marks each:

- **hit** — a usable fact covers the line: every number in the line appears in that fact, and content-word overlap is at least `min(2, remaining word count)` after dropping requirement filler (must, required, minimum, need, least, ability, strong).
- **miss** — required line with checkable words and no covering fact.
- **unknown** — no usable facts, or the line has no checkable words after dropping requirement filler.

The selected job in the workspace lists those lines. Copy states this is not an employer score. Set aside remains a human action.

### What it does not do

- Write gates to the database
- Change `status`, `draft`, or `accepted_draft`
- Auto-skip on miss
- Fetch employer applicant-tracking systems
- Emit a percentage
- Generate or accept a resume

### Extraction (mechanical)

- Lines after a short heading matching requirements / qualifications / must have / minimum qualifications, until another short heading.
- Any line containing must / required / minimum / need to / at least.
- Cap 20 lines. Deduplicate. Ignore empty and oversized lines.
- Preferred/"nice to have" headings are not required sections.

Filler words such as must, required, minimum, need, least, ability, strong are removed before overlap so "Must have Kubernetes" can hit a Kubernetes fact. Years and other numbers still have to appear in the cited fact.

### Data flow

Workspace `GET` already returns owner-scoped jobs and observations. It also returns usable facts for that owner (verified, not expired). The client derives gates; nothing is stored.

On 401, facts clear with jobs, sources, and events.

### Failure modes

- No required lines → tell the user to import posting text as research.
- No usable facts → every extracted line is unknown; tell them to verify facts on Profile.
- Proposed, retired, and expired facts never cover a line.

### Testing

Fictional fixtures. Unit tests for extraction, hit/miss/unknown, unused proposed facts, posting text assembly, and expiry of private facts on workspace sign-out. No migration.

## Slice 2 (not this issue)

Citation-gated resume variant: parseability lint (standard headings, no tables/columns), synonym mapping only for facts that exist, exact acceptance, fresh review if wording changes. Agents cannot accept it. No score.

## Contracts preserved

- Every read is the authenticated owner.
- Imports remain evidence; they cannot skip or approve.
- Accepted letters stay exact and versioned. This slice does not add a second accepted document.
- Personal records stay out of Git and logs.
