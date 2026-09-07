import { pullBoard } from '../../../integrations/connectors.mjs';
import { validateRows } from '../../../lib/domain.ts';
import { selectBoards } from './catalog.mjs';
import { compactPosting } from './instruments.mjs';
import { boardKey } from './load.mjs';
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

export function realClock() {
  return {
    now: () => Date.now(),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export function resolveClock(clock) {
  if (!clock) return realClock();
  if (typeof clock.now === 'function') {
    return {
      now: () => clock.now(),
      delay:
        typeof clock.delay === 'function'
          ? (ms) => clock.delay(ms)
          : realClock().delay,
    };
  }
  if (Number.isFinite(clock.now)) {
    const frozen = clock.now;
    return {
      now: () => frozen,
      delay:
        typeof clock.delay === 'function' ? (ms) => clock.delay(ms) : async () => {},
    };
  }
  return realClock();
}

export function startGate(clock, minInterval) {
  const resolved = resolveClock(clock);
  let tail = Promise.resolve();
  let nextAllowed = 0;
  return async function reserveStart() {
    let startAt = 0;
    const assigned = tail.then(() => {
      startAt = Math.max(resolved.now(), nextAllowed);
      nextAllowed = startAt + minInterval;
    });
    tail = assigned.catch(() => {});
    await assigned;
    const wait = startAt - resolved.now();
    if (wait > 0) await resolved.delay(wait);
    return startAt;
  };
}

export async function fetchDirectory({
  directory,
  known,
  spec,
  arm,
  fetchImpl,
  now = Date.now(),
  clock = realClock(),
  reserveStart,
  skip = new Set(),
  onBoard,
  compact = true,
}) {
  const caps = spec.caps;
  const selected = boardsForArm(directory, known, arm);
  const picked = selectBoards(selected, spec);
  const pending = picked.boards.filter((entry) => !skip.has(boardKey(entry)));
  const skipped = picked.boards.length - pending.length;
  const boards_capped = picked.sampled;
  const stats = [];
  const postings = [];
  let cursor = 0;
  const admit = reserveStart || startGate(resolveClock(clock), caps.min_interval_ms);
  const worker = async () => {
    while (cursor < pending.length) {
      const index = cursor++;
      await admit();
      const result = await fetchBoard(pending[index], {
        fetchImpl,
        timeout: caps.request_timeout_ms,
      });
      stats[index] = result;
      if (onBoard) await onBoard(result, pending[index]);
    }
  };
  const workers = Math.min(caps.concurrency, pending.length || 1);
  if (pending.length)
    await Promise.all(Array.from({ length: workers }, worker));
  for (const result of stats) {
    if (!result?.ok) continue;
    for (const row of result.rows) {
      const posting = {
        row,
        board: result.board,
        provider: result.provider,
        company: result.company,
      };
      postings.push(compact ? compactPosting(posting) : posting);
    }
  }
  return {
    arm,
    fetched_at: new Date(now).toISOString(),
    boards_selected: selected.length,
    boards_fetched: pending.length,
    boards_capped,
    boards: stats,
    postings,
    skipped,
    failures: stats.filter((item) => item && !item.ok).length,
    sample_seed: picked.sampled ? picked.seed : undefined,
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
