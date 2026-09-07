import { pullBoard } from '../../../integrations/connectors.mjs';
import { validateRows } from '../../../lib/domain.ts';
import { ashbyBoardUrl, usableAshby } from './sources.mjs';
import { isKnownPosting } from './filter.mjs';

export function boardsForArm(directory, known, arm) {
  if (arm === 'control_known')
    return directory.filter((entry) =>
      isKnownPosting(
        {
          row: { company: entry.company },
          board: entry.board,
          company: entry.company,
        },
        known,
      ),
    );
  return directory;
}

export async function fetchDirectory({
  directory,
  known,
  spec,
  arm,
  fetchImpl,
  now = Date.now(),
}) {
  const caps = spec.caps;
  const selected = boardsForArm(directory, known, arm);
  const capped = selected.slice(0, caps.max_boards);
  const boards_capped = selected.length > caps.max_boards;
  const stats = [];
  const postings = [];
  let cursor = 0;
  let lastStart = 0;
  const worker = async () => {
    while (cursor < capped.length) {
      const index = cursor++;
      const wait = caps.min_interval_ms - (Date.now() - lastStart);
      if (wait > 0) await delay(wait);
      lastStart = Date.now();
      stats[index] = await fetchBoard(capped[index], {
        fetchImpl,
        timeout: caps.request_timeout_ms,
      });
    }
  };
  const workers = Math.min(caps.concurrency, capped.length || 1);
  if (capped.length)
    await Promise.all(Array.from({ length: workers }, worker));
  for (const result of stats) {
    if (!result?.ok) continue;
    for (const row of result.rows) {
      postings.push({
        row,
        board: result.board,
        provider: result.provider,
        company: result.company,
      });
    }
  }
  return {
    arm,
    fetched_at: new Date(now).toISOString(),
    boards_selected: selected.length,
    boards_fetched: capped.length,
    boards_capped,
    boards: stats,
    postings,
    failures: stats.filter((item) => item && !item.ok).length,
  };
}

async function fetchBoard(entry, { fetchImpl, timeout }) {
  const started = Date.now();
  try {
    const rows = await pullOne(entry, { fetchImpl, timeout });
    return {
      ok: true,
      provider: entry.provider,
      board: entry.board,
      company: entry.company,
      count: rows.length,
      ms: Date.now() - started,
      rows,
    };
  } catch (error) {
    return {
      ok: false,
      provider: entry.provider,
      board: entry.board,
      company: entry.company,
      count: 0,
      ms: Date.now() - started,
      error: String(error.message || error),
      rows: [],
    };
  }
}

async function pullOne(entry, { fetchImpl, timeout }) {
  const timed = (url, options = {}) =>
    fetchImpl(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(timeout),
    });
  if (entry.provider === 'ashby') {
    const response = await timed(ashbyBoardUrl(entry.board), {
      headers: { accept: 'application/json' },
    });
    if (!response.ok)
      throw Error(`ashby responded ${response.status}. Check the board name.`);
    const payload = await response.json();
    return validateRows(usableAshby(payload, entry.board, entry.company));
  }
  return pullBoard({
    provider: entry.provider,
    board: entry.board,
    fetchImpl: timed,
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
