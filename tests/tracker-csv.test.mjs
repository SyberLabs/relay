import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readTrackerCsv,
  suggestTrackerMapping,
  trackerRows,
} from '../lib/tracker-csv.ts';

const header = 'Company,Role,Job URL,Status,Notes';
const row =
  'Example,Engineer,https://example.com/jobs/engineer,Offer,Follow up';
function convert(text) {
  const csv = readTrackerCsv(text);
  return trackerRows(csv, suggestTrackerMapping(csv.headers), 'Simplify');
}

void test('quoted CSV keeps commas, line breaks, escaped quotes, BOM and Unicode as text', () => {
  const [result] = convert(
    '\uFEFF' +
      header +
      '\r\n"Example, Inc.",Engineer,https://example.com/jobs/engineer,Rejected,"Ask about café\nSaid ""hello"""\r\n',
  );
  assert.equal(result.Name, 'Example, Inc. — Engineer');
  assert.match(result.Notes, /Source status: Rejected/);
  assert.match(result.Notes, /café\nSaid "hello"/);
  assert.equal(result.Status, 'Held');
});

void test('source lifecycle and Ready never confer local state or draft acceptance', () => {
  for (const state of [
    'Ready',
    'Applied',
    'Interview',
    'Offer',
    'Rejected',
    'Withdrawn',
    'Unknown future status',
  ]) {
    const [result] = convert(header + '\n' + row.replace('Offer', state));
    assert.equal(result.Status, 'Held');
    assert.ok(result.Notes.includes('Source status: ' + state));
    assert.equal(result.draft, undefined);
    assert.equal(result.accepted_draft, undefined);
  }
});

void test('repeat exports and reordered records keep source identity; source changes retain observations', () => {
  const first = convert(header + '\n' + row)[0];
  const secondRow = row.replaceAll('engineer', 'designer');
  const reordered = convert(header + '\n' + secondRow + '\n' + row);
  assert.deepEqual(reordered[1], first);
  const changed = convert(
    header + '\n' + row.replace('Follow up', 'New research'),
  )[0];
  assert.equal(changed.url, first.url);
  assert.notEqual(changed.Notes, first.Notes);
  const csv = readTrackerCsv(header + '\n' + row);
  assert.notEqual(
    trackerRows(csv, suggestTrackerMapping(csv.headers), 'Huntr')[0].url,
    first.url,
  );
});

void test('malformed, ambiguous, oversized and empty CSVs fail without truncating', () => {
  for (const value of [
    '',
    header,
    'Company,company\na,b',
    header + '\n"unclosed',
    header + '\na,b',
    'A,\nx,y',
  ])
    assert.throws(() => readTrackerCsv(value));
  assert.throws(() => readTrackerCsv('x'.repeat(2000001)), /2 MB/);
  assert.equal(
    convert(header + '\n' + Array(200).fill(row).join('\n')).length,
    200,
  );
  assert.throws(
    () => convert(header + '\n' + Array(201).fill(row).join('\n')),
    /200/,
  );
  assert.throws(
    () => convert(header + '\n' + row.replace('Follow up', 'x'.repeat(20000))),
    /20,000/,
  );
});

void test('a missing or unsafe URL rejects the whole batch and identifies its row', () => {
  for (const url of [
    '',
    'javascript:alert(1)',
    'ftp://example.com',
    'not a URL',
  ]) {
    const bad = row.replace('https://example.com/jobs/engineer', url);
    assert.throws(
      () => convert(header + '\n' + row + '\n' + bad),
      /Opportunity row 2:/,
    );
  }
});

void test('mapping requires distinct selected columns and ambiguous headers need a choice', () => {
  const csv = readTrackerCsv(header + '\n' + row);
  const mapping = suggestTrackerMapping(csv.headers);
  assert.throws(
    () => trackerRows(csv, { ...mapping, url: '' }, 'Simplify'),
    /Choose/,
  );
  assert.throws(
    () => trackerRows(csv, { ...mapping, role: 'Company' }, 'Simplify'),
    /different/,
  );
  assert.throws(
    () => trackerRows(csv, { ...mapping, notes: 'Absent' }, 'Simplify'),
    /existing/,
  );
  assert.throws(() => trackerRows(csv, mapping, ''), /Name the source/);
  assert.equal(
    suggestTrackerMapping(['Company', 'Role', 'URL', 'Job URL']).url,
    '',
  );
  assert.match(
    trackerRows(csv, { ...mapping, status: '', notes: '' }, 'Simplify')[0]
      .Notes,
    /not supplied/,
  );
});
