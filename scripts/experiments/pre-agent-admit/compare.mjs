import { jobKey } from '../../../lib/domain.ts';
import {
  admitControlKnown,
  admitControlQuery,
  admitTreatment,
} from './arms.mjs';
import { isKnownPosting, postingKey } from './filter.mjs';

export function compareArms({ postings, spec, known, labels = null, now }) {
  const arms = {
    control_known: admitControlKnown(postings, spec, known, now),
    control_query: admitControlQuery(postings, spec, now),
    treatment: admitTreatment(postings, spec, now),
  };
  const metrics = Object.fromEntries(
    Object.entries(arms).map(([name, result]) => [
      name,
      armMetrics(result, known, labels),
    ]),
  );
  return {
    schema: 'relay.pre-agent-admit.compare.v1',
    issue: 105,
    writing_agent: 'asleep',
    arms: metrics,
    deltas: {
      treatment_minus_control_known: delta(
        metrics.treatment,
        metrics.control_known,
      ),
      treatment_minus_control_query: delta(
        metrics.treatment,
        metrics.control_query,
      ),
    },
    decision: suggestDecision(metrics.treatment, labels),
    rows: Object.fromEntries(
      Object.entries(arms).map(([name, result]) => [
        name,
        result.kept.map((posting) => posting.row),
      ]),
    ),
  };
}

export function armMetrics(result, known, labels) {
  const kept = result.kept;
  const unknown = kept.filter((posting) => !isKnownPosting(posting, known));
  const labeled = tallyLabels(kept, labels);
  const relevantUnknown =
    labeled.relevant_keys === null
      ? null
      : unknown.filter((posting) =>
          labeled.relevant_keys.has(postingKey(posting)),
        ).length;
  const relevant = labeled.relevant;
  return {
    admitted: kept.length,
    cap_hit: result.cap_hit,
    omitted_by_cap: result.omitted,
    unknown_company_among_admitted: unknown.length,
    unknown_company_share_admitted: share(unknown.length, kept.length),
    relevant,
    not_relevant: labeled.not,
    duplicate: labeled.duplicate,
    unlabeled: labeled.unlabeled,
    precision: relevant == null ? null : share(relevant, kept.length),
    unknown_company_among_relevant: relevantUnknown,
    unknown_company_share: share(relevantUnknown, relevant),
  };
}

function tallyLabels(kept, labels) {
  if (!labels) {
    return {
      relevant: null,
      not: null,
      duplicate: null,
      unlabeled: null,
      relevant_keys: null,
    };
  }
  let relevant = 0,
    not = 0,
    duplicate = 0,
    unlabeled = 0;
  const relevant_keys = new Set();
  for (const posting of kept) {
    const key = postingKey(posting);
    const mark =
      labels[key] || labels[posting.row.Job] || labels[posting.row.url];
    if (mark === 'relevant') {
      relevant++;
      relevant_keys.add(key);
    } else if (mark === 'not') not++;
    else if (mark === 'duplicate') duplicate++;
    else unlabeled++;
  }
  return { relevant, not, duplicate, unlabeled, relevant_keys };
}

function delta(treatment, control) {
  return {
    admitted: treatment.admitted - control.admitted,
    unknown_company_among_admitted:
      treatment.unknown_company_among_admitted -
      control.unknown_company_among_admitted,
    relevant:
      treatment.relevant == null || control.relevant == null
        ? null
        : treatment.relevant - control.relevant,
  };
}

function share(num, den) {
  if (num == null || !den) return den === 0 && num === 0 ? 0 : null;
  return num / den;
}

export function suggestDecision(treatment, labels) {
  if (!labels || treatment.relevant == null) {
    return {
      verdict: null,
      reason:
        'Label admitted rows relevant|not|duplicate before applying the #105 threshold.',
    };
  }
  if (treatment.relevant < 5 || treatment.unknown_company_share === 0) {
    return {
      verdict: 'stop',
      reason:
        'Fewer than five relevant new jobs, or no relevant employer outside the pre-run known list.',
    };
  }
  if (treatment.precision != null && treatment.precision < 0.5) {
    return {
      verdict: 'change',
      reason:
        'Yield exists but precision is under half; do not auto-admit into Held.',
    };
  }
  return {
    verdict: 'continue',
    reason:
      'Relevant yield, precision, and unknown-company share all cleared the predeclared bar. A later issue may add an explicit owner-run admit path; this harness is not that path.',
  };
}

export function importRows(rows) {
  if (!rows.length) return [];
  if (rows.length > 200)
    throw Error('Import between 1 and 200 records.');
  return rows.map((row) => {
    jobKey(row.Job, row.url);
    return row;
  });
}
