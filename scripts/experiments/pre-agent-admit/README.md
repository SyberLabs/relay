# Pre-agent admit harness

Local experiment for [#105](https://github.com/SyberLabs/relay/issues/105). Protocol: [docs/experiments/pre-agent-admit.md](../../../docs/experiments/pre-agent-admit.md). Directory ranking: [docs/experiments/directory-sources.md](../../../docs/experiments/directory-sources.md).

```sh
node scripts/experiments/pre-agent-admit/run.mjs --help
pnpm experiment:pre-agent-admit -- --fixtures --out /tmp/pre-agent-admit
pnpm experiment:pre-agent-admit -- --fixtures \
  --catalog scripts/experiments/pre-agent-admit/fixtures/catalog/catalog.json \
  --out /tmp/pre-agent-admit-catalog
```

`--fixtures` (default) uses the fictional boards in `fixtures/` and makes no network calls.

`--live` requires a private `--catalog` or `--directory` and refuses this folder. `--catalog` unions LastRound / MIT JSON / CDX snapshots, optionally scouts HN/YC/startups/Speedrun with public GETs, then samples by provider share to `max_boards`. `--full-directory` fetches the snapshot instead of sampling. `--instruments` is intern regex plus local vocabulary cosine, not an embedder. Keep real CSVs and tokens in ignored `private-data/`. Attribute LastRound (CC BY 4.0) when that CSV is used.

Compare JSON is counts and rates only. Sampled board tokens are written to `directory.used.json` under `--out`. The writing/review agent stays asleep.
