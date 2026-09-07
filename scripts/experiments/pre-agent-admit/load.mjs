import { readFile } from 'node:fs/promises';
import { levels } from '../../../lib/utility.ts';

const BOARD = /^[\w.-]{1,80}$/;
const PROVIDERS = new Set(['greenhouse', 'lever', 'ashby']);

export const DEFAULT_CAPS = {
  max_boards: 40,
  max_admitted: 200,
  concurrency: 3,
  request_timeout_ms: 15_000,
  min_interval_ms: 250,
};

export function normName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function loadCaps(raw = {}) {
  const source =
    raw.caps && typeof raw.caps === 'object' && !Array.isArray(raw.caps)
      ? raw.caps
      : raw;
  const caps = { ...DEFAULT_CAPS };
  for (const key of Object.keys(DEFAULT_CAPS)) {
    if (source[key] != null) caps[key] = source[key];
  }
  for (const [key, max] of [
    ['max_boards', 80],
    ['max_admitted', 200],
    ['concurrency', 8],
    ['request_timeout_ms', 30_000],
    ['min_interval_ms', 5_000],
  ]) {
    const value = caps[key];
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw Error(`${key} must be an integer from 1 to ${max}.`);
  }
  return caps;
}

export function loadSpec(raw) {
  if (!raw || typeof raw !== 'object') throw Error('Relevance spec must be an object.');
  const title_any = asStringList(raw.title_any);
  const queries = asStringList(raw.queries);
  if (!title_any.length && !queries.length)
    throw Error('Spec needs title_any or queries so admission is not every posting.');
  const specLevels = asStringList(raw.levels);
  if (specLevels.some((level) => !levels.includes(level)))
    throw Error('Spec levels must be junior, mid, senior, staff, or principal.');
  const freshness =
    raw.freshness_days == null ? null : raw.freshness_days;
  if (
    freshness != null &&
    (!Number.isInteger(freshness) || freshness < 1 || freshness > 730)
  )
    throw Error('freshness_days must be an integer from 1 to 730.');
  const query_k = raw.query_k == null ? 10 : raw.query_k;
  if (!Number.isInteger(query_k) || query_k < 1 || query_k > 50)
    throw Error('query_k must be an integer from 1 to 50.');
  return {
    title_any,
    title_none: asStringList(raw.title_none),
    levels: specLevels,
    remote_any: asStringList(raw.remote_any),
    location_any: asStringList(raw.location_any),
    location_none: asStringList(raw.location_none),
    freshness_days: freshness,
    queries: queries.length ? queries : title_any,
    query_k,
    caps: loadCaps(raw.caps || {}),
  };
}

export function loadDirectory(raw) {
  const boards = raw?.boards;
  if (!Array.isArray(boards) || !boards.length)
    throw Error('Directory needs a non-empty boards array.');
  if (boards.length > 200) throw Error('Directory may list at most 200 boards.');
  return boards.map((entry, i) => {
    if (!PROVIDERS.has(entry?.provider))
      throw Error(`Directory board ${i} needs provider greenhouse, lever, or ashby.`);
    if (typeof entry.board !== 'string' || !BOARD.test(entry.board))
      throw Error(`Directory board ${i} needs a public board identifier.`);
    const company =
      typeof entry.company === 'string' && entry.company.trim()
        ? entry.company.trim()
        : entry.board;
    if (company.length > 120)
      throw Error(`Directory board ${i} company is too long.`);
    return { provider: entry.provider, board: entry.board, company };
  });
}

export function loadKnown(raw) {
  return {
    companies: asStringList(raw?.companies),
    boards: asStringList(raw?.boards),
  };
}

export function loadLabels(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('Labels must be an object of job key or URL to relevant|not|duplicate.');
  const labels = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || !['relevant', 'not', 'duplicate'].includes(value))
      throw Error(`Label for ${key} must be relevant, not, or duplicate.`);
    labels[key] = value;
  }
  return labels;
}

function asStringList(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw Error('Expected a string array.');
  if (value.length > 40) throw Error('A spec list may have at most 40 entries.');
  return value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.length > 80)
      throw Error('List entries must be non-empty strings of 80 characters or fewer.');
    return item.trim();
  });
}
