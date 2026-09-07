import { boards as boardUrls } from '../../../lib/postings.ts';
import { ashbyBoardUrl } from './sources.mjs';
import { PROVIDERS, usableSlug } from './load.mjs';

const BLOCKED_HOSTS = [
  'linkedin.com',
  'indeed.com',
  'wellfound.com',
  'angel.co',
  'angellist.com',
  'crunchbase.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'monster.com',
  'ycombinator.com',
];

const ATS_PATTERNS = [
  {
    provider: 'greenhouse',
    re: /(?:job-boards(?:\.eu)?|boards(?:-api)?)\.greenhouse\.io\/(?:v1\/boards\/)?([a-z0-9][\w.-]{0,79})/i,
  },
  {
    provider: 'greenhouse',
    re: /[?&]for=([a-z0-9][\w.-]{0,79})/i,
    host: /greenhouse\.io/i,
  },
  {
    provider: 'lever',
    re: /(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([a-z0-9][\w.-]{0,79})/i,
  },
  {
    provider: 'ashby',
    re: /(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9][\w.-]{0,79})/i,
  },
];

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const STOP = new Set([
  'ai',
  'co',
  'company',
  'corp',
  'inc',
  'labs',
  'llc',
  'ltd',
  'systems',
  'the',
]);

export function blockedJobHost(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return BLOCKED_HOSTS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

export function extractAtsFromUrl(url) {
  if (!url || blockedJobHost(url)) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const forParam = parsed.searchParams.get('for') || parsed.searchParams.get('board');
  if (forParam) {
    const board = usableSlug(forParam);
    if (board && /greenhouse\.io$/i.test(host))
      return { provider: 'greenhouse', board };
    if (board && /ashbyhq\.com$/i.test(host))
      return { provider: 'ashby', board };
  }
  const href = parsed.href;
  for (const pattern of ATS_PATTERNS) {
    if (pattern.host && !pattern.host.test(parsed.hostname)) continue;
    const match = href.match(pattern.re);
    if (!match) continue;
    const board = usableSlug(match[1]);
    if (!board) continue;
    return { provider: pattern.provider, board };
  }
  return null;
}

export function candidatesFromNameWebsite(name, website) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const slug = usableSlug(value);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push(slug);
  };
  if (website) {
    try {
      const host = new URL(website).hostname.toLowerCase().replace(/^www\./, '');
      add(host.split('.')[0]);
    } catch {
      /* website is optional */
    }
  }
  const rawWords = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (rawWords.length) {
    add(rawWords.join(''));
    if (rawWords.length > 1) add(rawWords.join('-'));
  }
  const words = rawWords.filter((word) => !STOP.has(word));
  if (words.length) {
    add(words.join(''));
    if (words.length > 1) add(words.join('-'));
    add(words[0]);
  }
  return out.slice(0, 8);
}

export function scoutCandidates({ format, text, path }) {
  if (format === 'hn-algolia') return fromHn(parseJson(text, 'hn-algolia'));
  if (format === 'yc-hiring') {
    refuseRemoteYc(path);
    return fromYc(parseJson(text, 'yc-hiring'));
  }
  if (format === 'startups') return fromNamedSites(parseJson(text, 'startups'));
  if (format === 'speedrun') return fromSpeedrun(parseJson(text, 'speedrun'));
  throw Error(`Unknown scout format ${format}.`);
}

export function refuseRemoteYc(path) {
  if (path && /ycombinator\.com/i.test(path))
    throw Error(
      'Do not fetch ycombinator.com. Use a frozen local yc-hiring JSON snapshot.',
    );
}

function fromHn(payload) {
  const hits = payload?.hits || payload?.children || [];
  if (!Array.isArray(hits)) throw Error('hn-algolia needs hits or children.');
  const out = [];
  for (const hit of hits) {
    const text = decodeEntities(
      hit?.comment_text || hit?.commentText || hit?.story_text || hit?.text || '',
    );
    const urls = [...text.matchAll(URL_RE)].map((match) =>
      match[0].replace(/[.,;]+$/, ''),
    );
    if (urls.some((url) => blockedJobHost(url)) && !urls.some(extractAtsFromUrl))
      continue;
    const company = firstCompany(text);
    let usedAts = false;
    for (const url of urls) {
      const ats = extractAtsFromUrl(url);
      if (!ats) continue;
      usedAts = true;
      out.push({
        provider: ats.provider,
        board: ats.board,
        company: company || ats.board,
        url,
        needs_probe: false,
        source: 'hn-algolia',
      });
    }
    if (!usedAts && company)
      out.push({
        company,
        url: urls.find((url) => !blockedJobHost(url)) || '',
        website: urls.find((url) => !blockedJobHost(url)) || '',
        needs_probe: true,
        source: 'hn-algolia',
      });
  }
  return out;
}

function fromYc(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.companies || [];
  return rows.flatMap((row) => {
    if (row?.isHiring === false) return [];
    const name = String(row?.name || '').trim();
    const website = row?.website || row?.url || '';
    if (!name) return [];
    return [
      {
        company: name,
        website,
        needs_probe: true,
        source: 'yc-hiring',
      },
    ];
  });
}

function fromNamedSites(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.companies || [];
  return rows.flatMap((row) => {
    const name = String(row?.name || '').trim();
    const website = row?.website || row?.url || '';
    if (!name) return [];
    const ats = website ? extractAtsFromUrl(website) : null;
    if (ats)
      return [
        {
          provider: ats.provider,
          board: ats.board,
          company: name,
          website,
          needs_probe: false,
          source: 'startups',
        },
      ];
    return [
      {
        company: name,
        website,
        needs_probe: true,
        source: 'startups',
      },
    ];
  });
}

function fromSpeedrun(payload) {
  const rows = payload?.companies || (Array.isArray(payload) ? payload : []);
  return rows.flatMap((row) => {
    const name = String(row?.name || '').trim();
    if (!name) return [];
    return [
      {
        company: name,
        website: '',
        needs_probe: true,
        source: 'speedrun',
      },
    ];
  });
}

export async function resolveScout(candidates, options) {
  const existing = new Set(options.existing || []);
  const resolved = [];
  let probes = 0;
  const maxProbes = options.max_probes ?? 120;
  for (const candidate of candidates) {
    if (candidate.provider && candidate.board && !candidate.needs_probe) {
      const key = `${candidate.provider}:${candidate.board}`;
      if (existing.has(key)) continue;
      existing.add(key);
      resolved.push({
        provider: candidate.provider,
        board: candidate.board,
        company: candidate.company || candidate.board,
        source: candidate.source,
      });
      continue;
    }
    const slugs = candidatesFromNameWebsite(
      candidate.company,
      candidate.website || candidate.url,
    );
    let found = null;
    for (const slug of slugs) {
      for (const provider of PROVIDERS) {
        if (probes >= maxProbes) break;
        const key = `${provider}:${slug}`;
        if (existing.has(key)) {
          found = {
            provider,
            board: slug,
            company: candidate.company || slug,
            source: candidate.source,
          };
          break;
        }
        probes += 1;
        if (options.reserveStart) await options.reserveStart();
        const ok = await boardExists(provider, slug, options);
        if (!ok) continue;
        found = {
          provider,
          board: slug,
          company: candidate.company || slug,
          source: candidate.source,
        };
        break;
      }
      if (found || probes >= maxProbes) break;
    }
    if (!found) continue;
    const key = `${found.provider}:${found.board}`;
    if (existing.has(key)) continue;
    existing.add(key);
    resolved.push(found);
  }
  return { boards: resolved, probes };
}

async function boardExists(provider, board, options) {
  const url =
    provider === 'ashby' ? ashbyBoardUrl(board) : boardUrls[provider](board);
  try {
    const response = await options.fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeout || 15_000),
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

function firstCompany(text) {
  const line = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')[0];
  const raw = line.split('|')[0].replace(/\([^)]*\)/g, '').trim();
  if (!raw || raw.length > 80) return '';
  return raw;
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x2F;/gi, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw Error(`${label} is not valid JSON.`);
  }
}
