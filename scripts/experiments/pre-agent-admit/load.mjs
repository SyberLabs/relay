import { readFile } from 'node:fs/promises';
import { levels } from '../../../lib/utility.ts';

export const BOARD = /^[\w.-]{1,80}$/;
export const PROVIDERS = new Set(['greenhouse', 'lever', 'ashby']);
export const MAX_SNAPSHOT_BOARDS = 20_000;
export const JUNK_SLUGS = new Set([
  'api',
  'boards',
  'careers',
  'embed',
  'embedjs',
  'job',
  'jobboard',
  'jobs',
  'postingapi',
  'postings',
  'robotstxt',
  'search',
  'v0',
  'v1',
  'www',
]);

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
    ['max_boards', MAX_SNAPSHOT_BOARDS],
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
  const sample_seed = raw.sample_seed == null ? 105 : raw.sample_seed;
  if (!Number.isInteger(sample_seed) || sample_seed < 1 || sample_seed > 1_000_000_000)
    throw Error('sample_seed must be an integer from 1 to 1000000000.');
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
    sample_seed,
    caps: loadCaps(raw.caps || {}),
  };
}

export function loadDirectory(raw) {
  const boards = parseRelayBoards(raw?.boards, 'directory');
  if (!boards.length) throw Error('Directory needs a non-empty boards array.');
  return boards;
}

export function parseRelayBoards(boards, label = 'directory') {
  if (!Array.isArray(boards))
    throw Error(`${label} needs a boards array.`);
  if (boards.length > MAX_SNAPSHOT_BOARDS)
    throw Error(`${label} may list at most ${MAX_SNAPSHOT_BOARDS} boards.`);
  return boards.map((entry, i) => canonicalBoard(entry, `${label} board ${i}`));
}

export function canonicalBoard(entry, label) {
  if (!PROVIDERS.has(entry?.provider))
    throw Error(`${label} needs provider greenhouse, lever, or ashby.`);
  if (typeof entry.board !== 'string' || !BOARD.test(entry.board))
    throw Error(`${label} needs a public board identifier.`);
  const slug = entry.board.toLowerCase();
  if (JUNK_SLUGS.has(slug.replace(/[^a-z0-9]/g, '')))
    throw Error(`${label} slug is a generic path, not a company board.`);
  const company =
    typeof entry.company === 'string' && entry.company.trim()
      ? entry.company.trim()
      : entry.board;
  if (company.length > 120) throw Error(`${label} company is too long.`);
  const board = {
    provider: entry.provider,
    board: entry.board,
    company,
  };
  if (entry.source) board.source = entry.source;
  if (Array.isArray(entry.sources)) board.sources = entry.sources;
  return board;
}

export function usableSlug(value) {
  if (typeof value !== 'string') return null;
  const board = value.trim().toLowerCase().replace(/\/+$/, '');
  if (!BOARD.test(board)) return null;
  if (JUNK_SLUGS.has(board.replace(/[^a-z0-9]/g, ''))) return null;
  if (board.endsWith('.txt')) return null;
  return board;
}

export function boardKey(entry) {
  return `${entry.provider}:${String(entry.board).toLowerCase()}`;
}

export function loadKnown(raw) {
  return {
    companies: asStringList(raw?.companies, {
      max: 250,
      label: 'known companies',
    }),
    boards: asStringList(raw?.boards, {
      max: 250,
      label: 'known boards',
    }),
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

function asStringList(value, { max = 40, label = 'A spec list' } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw Error('Expected a string array.');
  if (value.length > max) throw Error(`${label} may have at most ${max} entries.`);
  return value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.length > 80)
      throw Error('List entries must be non-empty strings of 80 characters or fewer.');
    return item.trim();
  });
}
