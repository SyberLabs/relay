# Pre-agent admit harness

Local experiment for [#105](https://github.com/SyberLabs/relay/issues/105). Protocol: [docs/experiments/pre-agent-admit.md](../../../docs/experiments/pre-agent-admit.md).

```sh
node scripts/experiments/pre-agent-admit/run.mjs --help
pnpm experiment:pre-agent-admit -- --fixtures --out /tmp/pre-agent-admit
```

`--fixtures` (default) uses the fictional boards in `fixtures/` and makes no network calls. `--live` requires a private `--directory` and refuses this folder.
