import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  boardKey,
  MAX_SNAPSHOT_BOARDS,
  PROVIDERS,
  usableSlug,
} from './load.mjs';
import {
  extractAtsFromUrl,
  refuseRemoteYc,
  resolveScout,
  scoutCandidates,
} from './scout.mjs';

export const LASTROUND_ATTRIBUTION =
  'LastRound AI ATS Company Directory (CC BY 4.0). https://lastroundai.com/blog/salary-transparency-study-2026';
export const MAX_SOURCE_BYTES = 10_000_000;
const LASTROUND_VENDORS = {
  greenhouse: 'greenhouse',
  lever: 'lever',
  ashby: 'ashby',
  ashbyhq: 'ashby',
};

const SNAPSHOT_FORMATS = new Set([
  'lastround',
  'ats-jobs-mcp',
  'intern-engine',
  'africa',
  'cdx',
  'relay',
]);
const SCOUT_FORMATS = new Set([
  'hn-algolia',
  'yc-hiring',
  'startups',
  'speedrun',
]);

export function parseSource({ format, text, path }) {
  if (format === 'feashliaa')
    throw Error(
      'Feashliaa company lists are CC BY-NC 4.0. Do not use them. Query a Common Crawl CDX snapshot yourself.',
    );
  if (format === 'yc-hiring') refuseRemoteYc(path);
  if (format === 'lastround') return capRows(fromLastround(text), format);
  if (format === 'ats-jobs-mcp')
    return capRows(fromAtsJobsMcp(parseJson(text, format)), format);
  if (format === 'intern-engine')
    return capRows(fromInternEngine(parseJson(text, format)), format);
  if (format === 'africa')
    return capRows(fromAfrica(parseJson(text, format)), format);
  if (format === 'cdx') return capRows(fromCdx(text), format);
  if (format === 'relay')
    return capRows(fromRelay(parseJson(text, format)), format);
  if (SCOUT_FORMATS.has(format))
    throw Error(`${format} is a scout corpus. Load it under catalog.scout.`);
  throw Error(`Unknown directory format ${format}.`);
}

export function unionBoards(boards) {
  const byKey = new Map();
  for (const row of boards) {
    const key = boardKey(row);
    const source = row.source || 'relay';
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      continue;
    }
    byKey.set(key, {
      provider: row.provider,
      board: row.board,
      company: row.company || row.board,
      source,
      sources: [source],
    });
  }
  return [...byKey.values()];
}

export function sampleBoards(boards, { limit, seed }) {
  if (!Number.isInteger(limit) || limit < 1)
    throw Error('sample limit must be a positive integer.');
  if (boards.length <= limit) return boards.slice();
  const groups = { greenhouse: [], lever: [], ashby: [] };
  for (const row of boards) {
    if (groups[row.provider]) groups[row.provider].push(row);
  }
  const total = boards.length;
  const seats = Object.entries(groups).map(([provider, list]) => {
    const exact = (list.length / total) * limit;
    return {
      provider,
      list,
      n: Math.min(list.length, Math.floor(exact)),
      frac: exact - Math.floor(exact),
    };
  });
  let used = seats.reduce((sum, seat) => sum + seat.n, 0);
  const remainder = [...seats].sort(
    (a, b) => b.frac - a.frac || a.provider.localeCompare(b.provider),
  );
  while (used < limit) {
    let progressed = false;
    for (const seat of remainder) {
      if (used >= limit) break;
      if (seat.n >= seat.list.length) continue;
      seat.n += 1;
      used += 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  const sampled = [];
  for (const seat of seats) {
    const shuffled = [...seat.list].sort((a, b) =>
      fingerprint(seed, a).localeCompare(fingerprint(seed, b)),
    );
    sampled.push(...shuffled.slice(0, seat.n));
  }
  return sampled.sort((a, b) => boardKey(a).localeCompare(boardKey(b)));
}

export function selectBoards(boards, spec) {
  const limit = spec.caps.max_boards;
  const seed = spec.sample_seed;
  if (boards.length <= limit)
    return { boards: boards.slice(), sampled: false, seed };
  return {
    boards: sampleBoards(boards, { limit, seed }),
    sampled: true,
    seed,
  };
}

export async function buildCatalog({
  catalog,
  catalogDir,
  spec,
  fetchImpl,
  now,
  clock,
  reserveStart,
}) {
  if (!catalog || typeof catalog !== 'object')
    throw Error('Catalog must be an object with sources.');
  const sources = Array.isArray(catalog.sources) ? catalog.sources : [];
  const scout = Array.isArray(catalog.scout) ? catalog.scout : [];
  if (!sources.length && !scout.length)
    throw Error('Catalog needs sources or scout entries.');
  const seed = catalog.seed == null ? spec.sample_seed : catalog.seed;
  if (!Number.isInteger(seed) || seed < 1 || seed > 1_000_000_000)
    throw Error('catalog.seed must be an integer from 1 to 1000000000.');
  const collected = [];
  const sourceStats = [];
  for (const entry of sources) {
    const format = entry?.format;
    if (!SNAPSHOT_FORMATS.has(format) && format !== 'feashliaa')
      throw Error(`Catalog source format ${format} is not a slug snapshot.`);
    const path = resolveCatalogPath(catalogDir, entry.path);
    const text = await readSource(path);
    const rows = capRows(parseSource({ format, text, path }), format);
    collected.push(...rows);
    sourceStats.push({ format, rows: rows.length, kept: rows.length });
  }
  let union = unionBoards(collected);
  const scoutStats = [];
  let probes = 0;
  if (scout.length) {
    const candidates = [];
    for (const entry of scout) {
      const format = entry?.format;
      if (!SCOUT_FORMATS.has(format))
        throw Error(`Catalog scout format ${format} is not supported.`);
      const path = resolveCatalogPath(catalogDir, entry.path);
      const text = await readSource(path);
      const found = scoutCandidates({ format, text, path });
      candidates.push(...found);
      scoutStats.push({ format, candidates: found.length, resolved: 0 });
    }
    const resolved = await resolveScout(candidates, {
      fetchImpl,
      timeout: spec.caps.request_timeout_ms,
      existing: union.map(boardKey),
      max_probes: spec.caps.max_boards * 3,
      reserveStart,
      clock,
    });
    probes = resolved.probes;
    union = unionBoards([...union, ...resolved.boards]);
    for (const board of resolved.boards) {
      const stat = scoutStats.find((row) => row.format === board.source);
      if (stat) stat.resolved += 1;
    }
  }
  union = capRows(union, 'catalog union');
  const selected = selectBoards(union, { ...spec, sample_seed: seed });
  if (!selected.boards.length)
    throw Error('Catalog produced no public Greenhouse, Lever, or Ashby boards.');
  const attribution = sourceStats.some((row) => row.format === 'lastround')
    ? LASTROUND_ATTRIBUTION
    : '';
  const summary = {
    seed,
    sampled: selected.sampled,
    snapshot: union.length,
    selected: selected.boards.length,
    by_provider: countProviders(selected.boards),
    sources: sourceStats,
    scout: scoutStats,
    probes,
    attribution: attribution || undefined,
  };
  return {
    boards: selected.boards.map((row) => ({
      provider: row.provider,
      board: row.board,
      company: row.company,
    })),
    attribution,
    sources: sourceStats,
    summary,
    now,
  };
}

export function countProviders(boards) {
  const counts = { greenhouse: 0, lever: 0, ashby: 0 };
  for (const row of boards) {
    if (counts[row.provider] != null) counts[row.provider] += 1;
  }
  return counts;
}

function fromLastround(text) {
  const table = parseCsv(text);
  if (!table.length) throw Error('LastRound CSV is empty.');
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const vendor = header.indexOf('ats_vendor');
  const name = header.indexOf('company_name');
  const slug = header.indexOf('board_slug');
  if (vendor < 0 || name < 0 || slug < 0)
    throw Error('LastRound CSV needs ats_vendor, company_name, and board_slug.');
  return table.slice(1).flatMap((row) => {
    const provider =
      LASTROUND_VENDORS[String(row[vendor] || '').trim().toLowerCase()];
    if (!provider) return [];
    const board = usableSlug(row[slug]);
    if (!board) return [];
    const company = String(row[name] || board).trim() || board;
    return [{ provider, board, company, source: 'lastround' }];
  });
}

function fromAtsJobsMcp(payload) {
  const rows = payload?.boards || payload?.rows || [];
  if (!Array.isArray(rows)) throw Error('ats-jobs-mcp JSON needs a boards array.');
  return rows.flatMap((row) =>
    tokenBoard({
      provider: row?.ats || row?.provider,
      board: row?.board,
      company: row?.company,
      source: 'ats-jobs-mcp',
    }),
  );
}

function fromInternEngine(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.companies || [];
  return rows.flatMap((row) => {
    const fromUrl = extractAtsFromUrl(row?.url || row?.board_url || '');
    return tokenBoard({
      provider: row?.ats || row?.provider || fromUrl?.provider,
      board: row?.slug || row?.board || fromUrl?.board,
      company: row?.name || row?.company,
      source: 'intern-engine',
    });
  });
}

function fromAfrica(payload) {
  const rows =
    payload?.entries ||
    payload?.boards ||
    (Array.isArray(payload) ? payload : []);
  return rows.flatMap((row) => {
    const meta = row?.platform_metadata || {};
    const fromUrl = extractAtsFromUrl(row?.board_url || row?.careers_url || '');
    return tokenBoard({
      provider: row?.ats || row?.provider || fromUrl?.provider,
      board:
        meta.board_token ||
        meta.org_slug ||
        meta.account_slug ||
        row?.board ||
        fromUrl?.board,
      company: row?.company || row?.name,
      source: 'africa',
    });
  });
}

function fromCdx(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let url = line.trim();
    if (url.startsWith('{')) {
      try {
        url = JSON.parse(url).url || '';
      } catch {
        continue;
      }
    }
    const ats = extractAtsFromUrl(url);
    if (!ats) continue;
    out.push({
      provider: ats.provider,
      board: ats.board,
      company: ats.board,
      source: 'cdx',
    });
  }
  return out;
}

function fromRelay(payload) {
  const rows = payload?.boards;
  if (!Array.isArray(rows)) throw Error('relay directory needs a boards array.');
  return rows.flatMap((row) =>
    tokenBoard({
      provider: row?.provider,
      board: row?.board,
      company: row?.company,
      source: 'relay',
    }),
  );
}

function tokenBoard({ provider, board, company, source }) {
  const vendor = String(provider || '').trim().toLowerCase();
  if (!PROVIDERS.has(vendor)) return [];
  const slug = usableSlug(board);
  if (!slug) return [];
  return [
    {
      provider: vendor,
      board: slug,
      company: String(company || slug).trim() || slug,
      source,
    },
  ];
}

function resolveCatalogPath(catalogDir, rel) {
  if (!rel || typeof rel !== 'string')
    throw Error('Catalog entries need a local path.');
  if (/^https?:\/\//i.test(rel))
    throw Error('Catalog sources must be local files, not URLs.');
  const root = resolve(catalogDir);
  const resolved = resolve(root, rel);
  const prefix = root.endsWith('/') ? root : `${root}/`;
  if (resolved !== root && !resolved.startsWith(prefix))
    throw Error('Source path escapes the catalog directory.');
  return resolved;
}

function fingerprint(seed, row) {
  const input = `${seed}:${row.provider}:${row.board}`;
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseCsv(text) {
  assertSourceSize(text, 'LastRound CSV');
  let rows;
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_quotes: false,
      max_record_size: 100_000,
    });
  } catch (error) {
    throw Error(
      'Unable to read LastRound CSV: ' +
        (error instanceof Error ? error.message : 'check quoting and columns.'),
    );
  }
  if (rows.length - 1 > MAX_SNAPSHOT_BOARDS)
    throw Error(`LastRound CSV may list at most ${MAX_SNAPSHOT_BOARDS} rows.`);
  return rows;
}

async function readSource(path) {
  const text = await readFile(path, 'utf8');
  assertSourceSize(text, path);
  return text;
}

function assertSourceSize(text, label) {
  if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES)
    throw Error(`${label} exceeds ${MAX_SOURCE_BYTES} bytes.`);
}

function capRows(rows, label) {
  if (rows.length > MAX_SNAPSHOT_BOARDS)
    throw Error(`${label} may list at most ${MAX_SNAPSHOT_BOARDS} boards.`);
  return rows;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw Error(`${label} is not valid JSON.`);
  }
}
