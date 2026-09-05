# Garbage Collector behavior checks

From the repository root, with Python 3.10 or newer:

```sh
python bots/garbage-collector/eval/verify.py
python bots/garbage-collector/eval/check_structure.py
```

The first runner checks the original fixture and simplified example against the same 13 contract tests, then confirms rejection of four deliberately broken rewrites: altered numeric precision, overly broad retries, repeated falsey successes, and weakened Unicode folding.

The structural runner reproduces a custom-equality counterexample in a prior review proposal and compares the corrected replacement with the original across 4,923 cases. These are deterministic example checks. They make no model calls and require no network access or external packages.

Both commands were rerun successfully from the migrated package on September 5, 2026: the original and simplified example passed, all four deliberate regressions were rejected, and all 4,923 structural comparisons passed. Native Bot behavior was not retested during this migration.

The [fixture contract](fixture/README.md) and [scenario corpus](scenarios.json) are reusable. For an instruction evaluation, give the Bot only a scenario's `task`, then judge against `acceptance` afterward. Do not supply the expected answer in the request.

## Prior native observations

During the September 4, 2026 publication sessions, Garbage Collector passed two initial native checks: useful structural simplification and refusal of a behavior-breaking cut. A later reciprocal review with First Principles led to clearer repository inspection and recovery requirements; four subsequent native cases passed.

Historical details remain in the original repository's [native record](https://github.com/SyberLabs/grok-bot-aggressive-deletion/blob/main/eval/NATIVE.md) and [reciprocal review](https://github.com/SyberLabs/grok-bot-aggressive-deletion/blob/main/eval/CROSS-REVIEW.md). They are bounded observations from setup conversations, not fresh-import or general reliability results.

Temporary copies isolate fixture files, not process privileges. These runners execute the inspected synthetic code included here. Passing them establishes behavior on these examples, not that an arbitrary Bot-generated simplification is correct.
