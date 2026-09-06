import { parse } from 'csv-parse/browser/esm/sync';
import { jobKey, validateRows, type SourceRow } from './domain.ts';

export type TrackerCsv = { headers: string[]; records: string[][] };
export type TrackerMapping = {
  company: string;
  role: string;
  url: string;
  status: string;
  notes: string;
};

export function readTrackerCsv(text: string): TrackerCsv {
  if (new TextEncoder().encode(text).length > 2000000)
    throw Error('Choose a CSV smaller than 2 MB.');
  let rows: string[][];
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 100000,
      // Reject overflow rather than silently importing only the first page.
      on_record(record: string[], context: { records: number }) {
        if (context.records > 201)
          throw Error('Choose at most 200 opportunity rows.');
        return record;
      },
    });
  } catch (error) {
    throw Error(
      'Unable to read CSV: ' +
        (error instanceof Error ? error.message : 'check quoting and columns.'),
    );
  }
  if (rows.length < 2)
    throw Error('Include a header and at least one opportunity.');
  const headers = rows[0].map((h) => h.trim());
  if (
    headers.length > 50 ||
    headers.some((h) => !h || h.length > 200) ||
    new Set(headers.map((h) => h.toLowerCase())).size !== headers.length
  )
    throw Error(
      'Use 1–50 distinct, nonempty column names of at most 200 characters.',
    );
  return { headers, records: rows.slice(1) };
}

export function suggestTrackerMapping(headers: string[]): TrackerMapping {
  function find(names: string[]) {
    const matches = headers.filter((h) => names.includes(h.toLowerCase()));
    return matches.length === 1 ? matches[0] : '';
  }
  return {
    company: find(['company', 'company name']),
    role: find(['role', 'position title', 'job title']),
    url: find(['url', 'job url', 'posting url', 'job link']),
    status: find(['status', 'application status']),
    notes: find(['notes']),
  };
}

export function trackerRows(
  csv: TrackerCsv,
  mapping: TrackerMapping,
  source: string,
): SourceRow[] {
  const label = source.trim();
  if (!label || label.length > 100 || /[\r\n]/.test(label))
    throw Error('Name the source tracker in 1–100 characters on one line.');
  for (const field of ['company', 'role', 'url'] as const)
    if (!mapping[field])
      throw Error('Choose the company, role and posting URL columns.');
  const selected = Object.values(mapping).filter(Boolean);
  if (
    selected.some((column) => !csv.headers.includes(column)) ||
    new Set(selected).size !== selected.length
  )
    throw Error('Choose a different existing column for each field.');
  return validateRows(
    csv.records.map((record, index) => {
      const cell = (field: keyof TrackerMapping) =>
        mapping[field] ? record[csv.headers.indexOf(mapping[field])] : '';
      const company = cell('company').trim();
      const role = cell('role').trim();
      const url = cell('url').trim();
      try {
        if (!company || !role || !url)
          throw Error('Company, role and posting URL are required.');
        if (url.length > 4000)
          throw Error('Posting URL exceeds 4,000 characters.');
        const key = jobKey(url, '');
        const name = `${company} — ${role}`;
        const notes = `Tracker: ${label}\nSource status: ${cell('status') || '(not supplied)'}\nImported as research; source status does not change Relay status.\n\n${cell('notes')}`;
        if (name.length > 500 || notes.length > 20000)
          throw Error(
            'Keep the combined title within 500 characters and research within 20,000.',
          );
        return {
          url: `tracker-csv:${encodeURIComponent(label.toLowerCase())}:${key}`,
          Name: name,
          Job: url,
          Status: 'Held',
          Notes: notes,
        };
      } catch (error) {
        throw Error(
          `Opportunity row ${index + 1}: ${error instanceof Error ? error.message : 'Invalid record.'} No rows were imported.`,
        );
      }
    }),
  );
}
