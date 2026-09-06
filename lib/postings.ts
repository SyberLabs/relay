import { levels, sizes } from './utility.ts';
// The read plane is wide, cheap and safe: it only ever reads. Everything it
// produces is normalised onto the same job identity the workspace already uses,
// so the same role found on four boards stays one record with four observations.
export type Normalised = {
  url: string;
  Name: string;
  Job: string;
  Status: string;
  Notes: string;
  company: string;
  level: string;
  remote: string;
  comp_min: number | null;
  comp_max: number | null;
  location: string;
  size: string;
  posted: string | null;
  source: string;
  effort: number;
};
const levelPatterns: [RegExp, string][] = [
  [/\b(principal|distinguished|fellow)\b/i, 'principal'],
  [/\b(staff|architect|lead engineer)\b/i, 'staff'],
  [/\b(senior|sr\.?|snr)\b/i, 'senior'],
  [/\b(junior|jr\.?|new grad|graduate|entry[- ]level|intern)\b/i, 'junior'],
];
export function inferLevel(title: string): string {
  for (const [pattern, level] of levelPatterns)
    if (pattern.test(title)) return level;
  return 'mid';
}
export function inferRemote(text: string): string {
  if (
    /\b(fully remote|remote[- ]first|100% remote|work from home)\b/i.test(text)
  )
    return 'remote';
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bremote\b/i.test(text)) return 'remote';
  if (/\b(on[- ]?site|in[- ]office)\b/i.test(text)) return 'onsite';
  return '';
}
// Compensation is published as free text far more often than as structured
// fields, so it is parsed here and left null when genuinely absent. Null means
// unknown and is scored neutrally; it must never be read as zero.
export function parseComp(text: string): [number | null, number | null] {
  if (!text) return [null, null];
  const money =
    /(?:[$£€]\s?)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s?[kK]\b|\d{5,7})/g;
  const found: number[] = [];
  for (const m of text.matchAll(money)) {
    const raw = m[1].replace(/,/g, '').trim();
    const value = /[kK]$/.test(raw)
      ? Number.parseFloat(raw) * 1000
      : Number.parseFloat(raw);
    if (Number.isFinite(value) && value >= 20_000 && value <= 2_000_000)
      found.push(Math.round(value));
  }
  if (!found.length) return [null, null];
  const min = Math.min(...found),
    max = Math.max(...found);
  return [min, max === min ? null : max];
}
const htmlEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi,
    (entity, body: string) => {
      if (body[0] === '#') {
        const hex = body[1] === 'x' || body[1] === 'X';
        const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff)
          return entity;
        if (code >= 0xd800 && code <= 0xdfff) return entity;
        return String.fromCodePoint(code);
      }
      return htmlEntities[body.toLowerCase()] ?? entity;
    },
  );
}

function tagNameEndsAt(html: string, nameEnd: number): boolean {
  if (nameEnd >= html.length) return true;
  const c = html.charCodeAt(nameEnd);
  // `>`, `/`, or whitespace/control — browsers also accept `</script\t\n bar>`.
  return c === 62 || c === 47 || c <= 32;
}

function dropElement(html: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}`;
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf(open, i);
    if (start === -1) {
      out += html.slice(i);
      break;
    }
    if (!tagNameEndsAt(html, start + open.length)) {
      out += html.slice(i, start + open.length);
      i = start + open.length;
      continue;
    }
    out += html.slice(i, start);
    const openGt = html.indexOf('>', start + open.length);
    if (openGt === -1) break;
    let end = lower.indexOf(close, openGt + 1);
    while (end !== -1 && !tagNameEndsAt(html, end + close.length))
      end = lower.indexOf(close, end + close.length);
    if (end === -1) break;
    const closeGt = html.indexOf('>', end + close.length);
    if (closeGt === -1) break;
    out += ' ';
    i = closeGt + 1;
  }
  return out;
}

function dropTags(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) break;
    out += ' ';
    i = gt + 1;
  }
  return out;
}

export function stripHtml(html: string): string {
  return decodeHtmlEntities(
    dropTags(dropElement(dropElement(html, 'script'), 'style')),
  )
    .replace(/\s+/g, ' ')
    .trim();
}
// Longer, denser postings cost more to answer well. This is a coarse estimate
// that the attention budget is spent against, and it is deliberately visible
// and adjustable rather than hidden inside the scorer.
export function estimateEffort(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const supplemental =
    /\b(cover letter|why do you want|tell us about|essay|short answer)\b/i.test(
      text,
    );
  return Math.min(
    90,
    15 + Math.round(words / 220) * 5 + (supplemental ? 25 : 0),
  );
}
function assemble(
  partial: Omit<Normalised, 'Status' | 'level' | 'effort' | 'size'> & {
    body: string;
  },
): Normalised {
  const { body, ...rest } = partial;
  return {
    ...rest,
    Status: 'Held',
    level: inferLevel(rest.Name),
    size: '',
    effort: estimateEffort(body),
  };
}
export function fromGreenhouse(payload: unknown, board: string): Normalised[] {
  const jobs = (payload as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs))
    throw Error('Greenhouse board returned no jobs array.');
  return jobs.flatMap((raw) => {
    const j = raw as {
      absolute_url?: string;
      title?: string;
      updated_at?: string;
      location?: { name?: string };
      content?: string;
      company_name?: string;
    };
    if (!j.absolute_url || !j.title) return [];
    const body = stripHtml(j.content || ''),
      location = j.location?.name || '';
    const [comp_min, comp_max] = parseComp(body);
    const company = j.company_name || board;
    return [
      assemble({
        url: j.absolute_url,
        Job: j.absolute_url,
        Name: `${company} — ${j.title}`,
        Notes: body.slice(0, 4000),
        company,
        remote: inferRemote(`${location} ${body}`),
        comp_min,
        comp_max,
        location,
        posted: j.updated_at || null,
        source: 'greenhouse',
        body,
      }),
    ];
  });
}
export function fromLever(payload: unknown, company: string): Normalised[] {
  if (!Array.isArray(payload))
    throw Error('Lever board returned no postings array.');
  return payload.flatMap((raw) => {
    const j = raw as {
      hostedUrl?: string;
      text?: string;
      createdAt?: number;
      categories?: { location?: string; commitment?: string };
      descriptionPlain?: string;
      availability?: string;
    };
    if (!j.hostedUrl || !j.text) return [];
    const body = j.descriptionPlain || '',
      location = j.categories?.location || '';
    const [comp_min, comp_max] = parseComp(body);
    return [
      assemble({
        url: j.hostedUrl,
        Job: j.hostedUrl,
        Name: `${company} — ${j.text}`,
        Notes: body.slice(0, 4000),
        company,
        remote: inferRemote(`${location} ${body}`),
        comp_min,
        comp_max,
        location,
        posted: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        source: 'lever',
        body,
      }),
    ];
  });
}
export const boards = {
  greenhouse: (token: string) =>
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
  lever: (company: string) =>
    `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`,
};
export function validateNormalised(rows: Normalised[]): Normalised[] {
  if (!rows.length) throw Error('The board returned no usable postings.');
  return rows.filter(
    (r) =>
      r.Job.startsWith('http') &&
      r.Name.trim().length > 1 &&
      r.Name.length <= 500 &&
      levels.includes(r.level) &&
      (r.size === '' || sizes.includes(r.size)),
  );
}
