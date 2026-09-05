def total(values):
    answer = 0
    for value in values:
        answer = answer + value
    return answer


def normalize_labels(values):
    return list(dict.fromkeys(value.casefold() for value in values))


def read_with_retry(fetch):
    try:
        return fetch()
    except TimeoutError:
        return fetch()
