"""Differential checks for the structural review, using the versioned task source."""
import itertools
import json
from pathlib import Path


def simplified(rows, kind):
    selected = 'paid' if kind == 'paid' else 'trial' if kind == 'trial' else None
    answer = 0
    for row in rows:
        if selected is None or row['kind'] == selected:
            answer += row['value']
    return answer


def reviewed(rows, kind):
    filtered = kind in ('paid', 'trial')
    answer = 0
    for row in rows:
        if not filtered or row['kind'] == kind:
            answer = answer + row['value']
    return answer


class PaidAlias:
    """Hashable custom equality is explicitly inside the scenario's domain."""
    def __eq__(self, other):
        return other in ('paid', 'other')

    __hash__ = object.__hash__


if __name__ == '__main__':
    task = json.loads(Path(__file__).with_name('scenarios.json').read_text())[1]['task']
    namespace = {}
    exec(task.split('Code: ', 1)[1].split(' Give the replacement;', 1)[0], namespace)
    original = namespace['total']
    rows = [{'kind': 'other', 'value': 7}]
    assert original(iter(rows), PaidAlias()) == 0
    assert reviewed(iter(rows), PaidAlias()) == 7
    pool = [{'kind': kind, 'value': value}
            for kind in ('paid', 'trial', 'other') for value in (-2, 0, 3)]
    checks = 0
    for length in range(4):
        for rows in itertools.product(pool, repeat=length):
            for kind in ('paid', 'trial', 'other', None, 0, PaidAlias()):
                assert simplified(iter(rows), kind) == original(iter(rows), kind)
                checks += 1
    for kind in ('other', None, 0):
        assert simplified(iter([{'value': 4}]), kind) == original(iter([{'value': 4}]), kind)
        checks += 1
    print(f'PASS: corrected structural replacement ({checks} comparisons); '
          'saved proposal custom-equality counterexample reproduced')
