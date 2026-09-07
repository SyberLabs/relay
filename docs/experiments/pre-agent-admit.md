# Pre-agent admission experiment

Issue: [#105](https://github.com/SyberLabs/relay/issues/105). Owner: Mateo. Peer: Seth.

This is a **local experimental space**, not a product spine. It does not schedule crawls, does not add a Relay-hosted search index, does not wake a writing agent, and does not send applications. Public copy is unchanged.

## Problem

Relay today admits jobs when a person or an already-awake assistant brings them in: one posting through ordinary fields, a tracker CSV, or `board-pull` of a Greenhouse/Lever slug the caller already knows. Assistants can also web-search, which is query-shaped: a role that was never retrieved never enters the workspace.

The hypothesis on #105 is different. **How many relevant Held opportunities can land in Relay before the writing/review agent wakes?** The seeker does not name companies. Lower-level public reads (ATS job-board JSON) exhaust boards from an operator-held directory, a frozen spec filters them, and importable Held rows are the output.

That is not “user types slugs.” Public Greenhouse, Lever, and Ashby board APIs have **no cross-tenant list endpoint**. Someone still has to supply board tokens. For this experiment that someone is the **operator**, using a snapshot independent of the seeker’s memory. The seeker’s pre-run known-company list is a **measurement instrument**, not the ingest allowlist.

## What the current system does without this

| Path | Who names the employer | What is retrieved |
| --- | --- | --- |
| Add a job | The user | One posting URL |
| Tracker CSV | The user’s existing tracker | Rows the user already collected |
| `board-pull` | The user/agent who supplies the slug | That company’s published board |
| Agent web search | The query | A SERP-sized set of postings, not full boards |

`/plan` still ranks only what is already Held. Empty or query-shaped workspaces understate the choice set for a throughput-oriented hunt. They do not by themselves justify a production crawler.

## Arms

All arms use the same frozen relevance spec (title terms, level, remote/location, freshness). None call an LLM. Discovery still arrives **Held**.

1. **`control_known`** — current Relay read plane. Fetch only boards whose token or company is on the seeker’s pre-run known list, then apply the spec. If the known list is empty, this arm admits nothing from ATS APIs.
2. **`control_query`** — query-shaped assistant search, simulated. From the same fetched corpus, keep up to `query_k` spec-matching hits per query (newest first). This is an *upper bound* on search recall given the treatment corpus: real web search would not have fetched every board first.
3. **`treatment`** — pre-agent exhaust. Fetch every directory board up to `max_boards`, apply the spec, cap at `max_admitted` (the import limit is 200; owner storage is 500 jobs).

The comparison of interest is **treatment versus `control_known`**: same spec, same time, writing agent asleep, companies the seeker would not have listed vs companies they already knew.

## Bounds

- Providers: public Greenhouse and Lever JSON (existing `pullBoard`) plus Ashby’s public job-board JSON (experiment-only; not a production connector).
- No login walls, CAPTCHA bypass, robots evasion, or ToS-hostile major-board scrapes.
- `--live` never uses the committed fixture directory and never runs without an explicit private `--directory`.
- Caps: boards, admitted rows, concurrency, timeout, minimum interval. A failed board is counted and skipped; it does not abort the run.
- Compare JSON contains counts and rates only. Import files that contain posting text stay in `--out` (use ignored `private-data/` for live hunts).
- This process is not admitted through the production Worker. It uses the operator’s machine. Do not add a Relay-funded crawl, embedder, or queue here; that would require the currency-budget controls in `docs/abuse-controls.md`.

Which public directories can fill `--directory` (already slugs vs name/website scout corpora) is recorded in [directory-sources.md](directory-sources.md). The live ranking: LastRound AI’s CC BY 4.0 Greenhouse/Lever/Ashby map as the primary snapshot; do not commit it.

## Decision (from #105)

After one frozen live run with human labels (`relevant` / `not` / `duplicate`):

- **Stop** if `relevant < 5` or unknown-company share among relevant rows is 0.
- **Change** if relevant yield exists but precision `< 0.5` (unread-queue failure). Do not auto-admit.
- **Continue** only then, in a **separate** implementation issue, to an explicit owner-run admit path. Still no cron, second store, embeddings, or resume graph.

Fixture numbers are not that decision. They prove the harness can see a delta.

## Run

Offline (committed fictional Northstar / ExampleCo / Harbor Labs / Acme Labs):

```sh
pnpm experiment:pre-agent-admit -- --fixtures --out /tmp/pre-agent-admit
```

Live (private spec, directory, known list; writing agent still asleep):

```sh
pnpm experiment:pre-agent-admit -- --live \
  --spec private-data/experiments/pre-agent-admit/spec.json \
  --directory private-data/experiments/pre-agent-admit/directory.json \
  --known private-data/experiments/pre-agent-admit/known.json \
  --labels private-data/experiments/pre-agent-admit/labels.json \
  --out private-data/experiments/pre-agent-admit/runs/current
```

Copy `scripts/experiments/pre-agent-admit/fixtures/spec.json` as a starting spec. Put real board tokens only under `private-data/`. Load `treatment.relay-import.json` with **Load research or draft** if you want those Held rows in a local workspace; load `control_known.relay-import.json` into a separate local D1 if you want to feel both workspaces. Preview still precedes import. Status stays Held.

## What this does not do

It does not implement closed PRs #70 or #72. It does not replace #5 (voluntary return). It does not prove hiring outcomes or PMF. It measures whether a sleeping writing agent would wake onto a larger relevant Held set than today’s known-company pull.
