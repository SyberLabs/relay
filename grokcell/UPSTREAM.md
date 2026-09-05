# GrokCell source record

This folder is a complete, unmodified snapshot of the tracked files from
[sdcarlson/grokcell](https://github.com/sdcarlson/grokcell) at commit
[`4a54df2d9bf6276de610b4f89228315015282419`](https://github.com/sdcarlson/grokcell/commit/4a54df2d9bf6276de610b4f89228315015282419),
plus this source record. The cleanup is proposed in
[GrokCell pull request #1](https://github.com/sdcarlson/grokcell/pull/1).

GrokCell remains the maintained source. Propose template improvements through
its [contribution guide](CONTRIBUTING.md) and upstream pull requests. Relay
includes the packages for convenient use; they do not automatically install
Bots, access job records, or connect to Relay. Public Bots remain separately
deployed snapshots.

## Refresh this copy

1. Select a reviewed upstream commit and record its full hash.
2. Export its tracked files with `git archive` from an upstream checkout.
3. In a clean Relay branch, replace only this folder's imported files with that
   export, removing files retired upstream. Preserve and update this source
   record. Do not copy `.git`, local data, credentials, or generated output.
4. Verify that every imported file matches the selected upstream commit and
   that there are no extra files other than this record.
5. Run the three checks below and open a Relay pull request with the upstream
   commit and validation results. Source changes should be accepted upstream
   before routine copy refreshes.

From Relay's repository root, with Python 3.10 or newer:

```sh
python grokcell/scripts/validate_templates.py
python grokcell/bots/garbage-collector/eval/verify.py
python grokcell/bots/garbage-collector/eval/check_structure.py
```

The nested `.github/` files are retained as upstream source; GitHub does not
use them as Relay's workflows or contribution templates. Relay's root
`.github/workflows/grokcell.yml` runs the bundled checks. They validate static
packages and synthetic examples, not live Bot behavior or Relay integration.

The [MIT license](LICENSE) applies to this bundled source. It does not grant
an open-source license for the rest of Relay.
