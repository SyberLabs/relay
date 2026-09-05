import importlib
import json
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(os.environ.get('DELETION_FIXTURE_ROOT', Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(ROOT / 'src'))
from report import normalize_labels, read_with_retry, total


class ReportTests(unittest.TestCase):
    def test_total(self):
        self.assertEqual(total(iter([2, -1, 4])), 5)
        self.assertEqual(total([]), 0)
        with self.assertRaises(TypeError):
            total([2, None])

    def test_float_addition_order(self):
        self.assertEqual(total([1e16, 1.0, -1e16]), 0.0)

    def test_integer_result_type(self):
        self.assertIs(type(total([1, 2])), int)

    def test_invalid_value_does_not_consume_tail(self):
        values = iter([1, None, 99])
        with self.assertRaises(TypeError):
            total(values)
        self.assertEqual(next(values), 99)

    def test_custom_addition(self):
        class Value:
            def __radd__(self, left):
                return left + 7
        self.assertEqual(total([Value(), Value()]), 14)

    def test_labels(self):
        self.assertEqual(normalize_labels(['Straße', 'STRASSE', ' B ', 'b']),
                         ['strasse', ' b ', 'b'])

    def test_label_order_and_generator(self):
        self.assertEqual(normalize_labels(iter(['Z', 'a', 'z', 'A', ''])), ['z', 'a', ''])
        self.assertEqual(normalize_labels([]), [])

    def test_retry(self):
        attempts = []
        def fetch():
            attempts.append(1)
            if len(attempts) == 1:
                raise TimeoutError()
            return 0
        self.assertEqual(read_with_retry(fetch), 0)
        self.assertEqual(len(attempts), 2)

    def test_success_is_not_retried(self):
        for result in [0, '', [], None, False]:
            with self.subTest(result=result):
                attempts = []
                def fetch():
                    attempts.append(1)
                    return result
                self.assertIs(read_with_retry(fetch), result)
                self.assertEqual(len(attempts), 1)

    def test_non_timeout_propagates_once(self):
        attempts = []
        failure = ValueError('invalid input')
        def fetch():
            attempts.append(1)
            raise failure
        with self.assertRaises(ValueError) as caught:
            read_with_retry(fetch)
        self.assertIs(caught.exception, failure)
        self.assertEqual(len(attempts), 1)

    def test_two_timeouts_stop(self):
        attempts = []
        def fetch():
            attempts.append(1)
            raise TimeoutError()
        with self.assertRaises(TimeoutError):
            read_with_retry(fetch)
        self.assertEqual(len(attempts), 2)

    def test_second_attempt_error_propagates(self):
        attempts = []
        def fetch():
            attempts.append(1)
            if len(attempts) == 1:
                raise TimeoutError()
            raise ValueError('second failure')
        with self.assertRaisesRegex(ValueError, 'second failure'):
            read_with_retry(fetch)
        self.assertEqual(len(attempts), 2)

    def test_external_plugin(self):
        registry = json.loads((ROOT / 'plugins.json').read_text())
        plugin = importlib.import_module(registry['report_renderer'])
        self.assertEqual(plugin.render([1, 2]), '1,2')


if __name__ == '__main__':
    unittest.main()
