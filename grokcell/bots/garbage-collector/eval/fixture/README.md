# Report helpers

Public contract:

- `report.total(values)` adds the values of an iterable from left to right, starting at integer zero. Preserve that evaluation order, including floating-point rounding and custom addition behavior. Empty input returns zero. Exceptions from invalid values propagate without consuming later values.
- `report.normalize_labels(values)` returns unique, case-folded labels in input order. Labels may contain Unicode; strings are not trimmed.
- `report.read_with_retry(fetch)` makes at most two attempts. Retry only `TimeoutError`; other exceptions propagate. Return the successful result, even if empty or zero.
- The module named in `plugins.json` is imported by an external consumer. Its `render(values)` entry point returns a comma-separated string of the values. This registry is part of the supported interface.

Python 3.10 or newer. No external dependencies. Source lives in `src`.
