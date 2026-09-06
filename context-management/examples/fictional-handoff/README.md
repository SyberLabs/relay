# Try a fictional context handoff

This example turns the [evaluation plan](../../evaluations.md) into a concrete first exercise. Everything here is invented test data. It is safe to inspect without supplying a resume, credentials, or an employer account.

## Exercise with two assistant sessions

1. Give the first session [packet.json](packet.json) and [evidence.md](evidence.md). Request one short application paragraph using only supported career facts, with separate evidence notes.
2. Review its paragraph against the ground truth in the evidence file. [draft.txt](draft.txt) is a manually authored reference answer, not a measured model output.
3. Give a fresh session the packet, original evidence, actual first-session draft, and an updated copy of [checkpoint.md](checkpoint.md). Ask it to continue the review.
4. Check whether the fresh session preserves the missing qualifications, location conflict, version 4, and absence of acceptance/submission. Keep the actual outputs and model names in ignored `private-data/`.

The supplied checkpoint refers to the supplied sample paragraph. Update its references if using a model-generated paragraph. This exercise does not prove every case in the evaluation plan.

## Validate the existing file adapter

From the Relay repository root, with Node 24 and the repository dependencies installed:

```sh
node integrations/relay.mjs grok-draft context-management/examples/fictional-handoff/packet.json context-management/examples/fictional-handoff/draft.txt private-data/context-trial/draft-result.json
```

The adapter wraps the existing text; it does not call Grok or generate a new answer. The output uses the adapter's `grok-bot` provider label, which in this exercise identifies the adapter rather than authorship. Use a new output filename on subsequent runs because existing output files are intentionally not overwritten.

The result should retain the original job key, URL, and version and set `reviewRequired: true`. It is only loadable for a matching selected job/version. This fictional identity is not automatically created in a live workspace; do not relabel it to match a real job.

The repository's existing connector, import, editor, and Obsidian checks exercise the underlying protections:

```sh
npm test
```

This command tests local behavior; it does not evaluate model truthfulness or prove an employer submission. See [validation record](validation.md) for the checks performed while preparing this example.
