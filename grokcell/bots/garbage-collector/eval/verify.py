"""Check the original, published example, and sensitivity to deliberate regressions.

Executes only repository-owned synthetic fixtures. Temporary copies isolate files,
not the process's privileges. No package installation or network access is needed.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT / 'fixture'
ORIGINAL = (FIXTURE / 'src' / 'report.py').read_text(encoding='utf-8')


def check(source_root):
    environment = dict(os.environ, DELETION_FIXTURE_ROOT=str(source_root))
    return subprocess.run(
        [sys.executable, '-B', '-m', 'unittest', 'discover',
         '-s', str(FIXTURE / 'tests'), '-v'],
        env=environment, capture_output=True, text=True, timeout=30,
    )


def main():
    cases = [
        ('original', ORIGINAL, True, None),
        ('published example', (ROOT / 'example-after.py').read_text(encoding='utf-8'), True, None),
        ('precision-changing sum', 'import math\n' + ORIGINAL.replace(
            'strategy = StrategyFactory().create()', 'return math.fsum(values)'),
         False, 'test_float_addition_order'),
        ('retry all exceptions', ORIGINAL.replace('except TimeoutError:', 'except Exception:'),
         False, 'test_non_timeout_propagates_once'),
        ('retry falsey success', ORIGINAL.replace('return fetch()', 'return fetch() or fetch()', 1),
         False, 'test_success_is_not_retried'),
        ('weaken Unicode folding', ORIGINAL.replace('.casefold()', '.lower()'),
         False, 'test_labels'),
    ]
    failed = []
    with tempfile.TemporaryDirectory(prefix='deletion-eval-') as temporary:
        for number, (name, source, should_pass, expected_failure) in enumerate(cases):
            candidate = Path(temporary) / str(number)
            shutil.copytree(FIXTURE, candidate, ignore=shutil.ignore_patterns('__pycache__'))
            (candidate / 'src' / 'report.py').write_text(source, encoding='utf-8')
            result = check(candidate)
            passed = result.returncode == 0
            detected = expected_failure is None or f'FAIL: {expected_failure}' in result.stderr
            okay = passed == should_pass and detected
            print(f'{"PASS" if okay else "FAIL"}: {name} '
                  f'({"contract preserved" if passed else "regression rejected"})')
            if not okay:
                failed.append(name)
                print(result.stdout + result.stderr)
    return bool(failed)


if __name__ == '__main__':
    sys.exit(main())
