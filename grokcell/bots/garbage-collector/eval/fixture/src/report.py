class AdditionStrategy:
    def combine(self, left, right):
        return left + right


class StrategyFactory:
    def create(self):
        return AdditionStrategy()


def total(values):
    strategy = StrategyFactory().create()
    answer = 0
    for value in values:
        answer = strategy.combine(answer, value)
    return answer


def normalize_labels(values):
    result = []
    for value in values:
        normalized = value.casefold()
        if normalized not in result:
            result.append(normalized)
    return result


def read_with_retry(fetch):
    try:
        return fetch()
    except TimeoutError:
        return fetch()
