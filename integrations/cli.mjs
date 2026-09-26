import { createReadStream } from 'node:fs';
import { EXIT, RelayError, login, request } from './client.mjs';
import { clusterOf, profileBrief } from '../lib/profile.ts';
import { DraftStageError, stageDraft } from '../lib/draft-stage.ts';
import {
  ApplicationContextError,
  readApplicationContext,
} from '../lib/application-context.ts';

let io = { fetchImpl: fetch, session: undefined };
function api(path, body) {
  return request(path, body, { fetchImpl: io.fetchImpl, session: io.session });
}
// Argument parsing, formatting and exit codes for the local assistant handoff.
export function parseArgs(argv) {
  const positional = [],
    flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) flags[name] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--'))
      flags[name] = argv[++i];
    else flags[name] = true;
  }
  return { positional, flags };
}
export function outcomeBody(job, kind, flags = {}) {
  return {
    action: 'record',
    id: job.id,
    version: job.version,
    kind,
    receipt: flags.receipt,
    occurred: flags.at,
  };
}
const out = (line = '') => process.stdout.write(line + '\n');
const note = (line) => process.stderr.write(line + '\n');
const json = (value) => out(JSON.stringify(value, null, 2));
async function jobById(id) {
  const workspace = await api('/api/workspace');
  const job = workspace.jobs.find((j) => j.id === id);
  if (!job)
    throw new RelayError(
      `No job with id ${id}. Check its id in Relay.`,
      EXIT.refused,
    );
  return job;
}
// The brief an agent writes from: confirmed facts, style rules, and rules of
// use. Composed by lib/, not here.
async function buildBrief(jobId) {
  const [profile, job] = await Promise.all([
    api('/api/profile'),
    jobById(jobId),
  ]);
  const cluster = clusterOf(job.name);
  return {
    job,
    cluster,
    profile,
    brief: profileBrief(
      profile.facts,
      profile.rules,
      cluster,
      new Date().toISOString(),
      profile.version,
    ),
  };
}
const commands = {
  async stage(args, flags) {
    const [id, file] = args;
    if (
      args.length !== 2 ||
      !id ||
      !file ||
      typeof flags.version !== 'string' ||
      !/^[1-9]\d*$/.test(flags.version) ||
      !Number.isSafeInteger(Number(flags.version)) ||
      typeof flags.blocker !== 'string' ||
      (flags.json !== undefined && flags.json !== true) ||
      Object.keys(flags).some(
        (key) => !['version', 'blocker', 'json'].includes(key),
      )
    )
      throw new RelayError(
        'Usage: relay stage <job_id> <draft-file> --version <generation-time-version> --blocker=<text-or-empty> [--json]',
        EXIT.usage,
      );
    let draft;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of createReadStream(file)) {
        size += chunk.length;
        if (size > 80_000) throw Error('Draft file exceeds 80000 bytes.');
        chunks.push(chunk);
      }
      // Do not trim, normalize newlines, strip a BOM or replace invalid UTF-8.
      draft = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        Buffer.concat(chunks),
      );
    } catch {
      throw new RelayError(
        'Cannot read draft file: provide UTF-8 text of at most 80000 bytes. Input file preserved.',
        EXIT.usage,
      );
    }
    try {
      const result = await stageDraft(api, {
        id,
        version: Number(flags.version),
        draft,
        blocker: flags.blocker,
      });
      if (flags.json) return json(result);
      out('Saved for human review. Not accepted or sent.');
    } catch (error) {
      if (error instanceof DraftStageError)
        throw new RelayError(error.message, EXIT.refused);
      throw error;
    }
  },
  async context([id], flags) {
    try {
      json(await readApplicationContext(api, id, flags.before));
    } catch (error) {
      if (error instanceof ApplicationContextError)
        throw new RelayError(error.message, EXIT.refused);
      throw error;
    }
  },
  async login() {
    await login(io.fetchImpl);
    const profile = await api('/api/profile');
    out(
      `Signed in. Profile v${profile.version} · ${profile.usable} verified facts.`,
    );
  },

  async brief([id], flags) {
    if (!id) throw new RelayError('Usage: relay brief <job_id>', EXIT.usage);
    const { job, brief } = await buildBrief(id);
    if (flags.json) return json(brief);
    out(`${job.name}`);
    out(`cluster ${brief.cluster} · profile v${brief.profile_version}`);
    out('');
    out(`confirmed facts available to include (${brief.facts.length}):`);
    for (const f of brief.facts) out(`  ${f.id}  [${f.tag}] ${f.claim}`);
    if (!brief.facts.length)
      out('  none — verify facts in the browser before drafting');
    out('');
    out(`style rules (${brief.style.length}):`);
    for (const r of brief.style) out(`  · ${r}`);
    if (!brief.style.length) out('  none learned yet');
  },

  async outcome([id, kind], flags) {
    if (!id || !kind)
      throw new RelayError(
        'Usage: relay outcome <job_id> <kind> [--receipt "…"] [--at ISO] [--yes]',
        EXIT.usage,
      );
    // Terminal kinds close the job permanently, so they are never a silent
    // side effect of a script.
    if (
      ['rejected', 'ghosted', 'withdrawn', 'accepted'].includes(kind) &&
      !flags.yes
    )
      throw new RelayError(
        `"${kind}" closes this job permanently and no further outcome can be recorded. Pass --yes to confirm.`,
        EXIT.usage,
      );
    const job = await jobById(id);
    const result = await api('/api/outcomes', outcomeBody(job, kind, flags));
    if (flags.json) return json(result);
    out(`recorded ${kind} · status now ${result.status}`);
  },
};
export async function run(argv, overrides = {}) {
  const previous = io;
  io = {
    fetchImpl: overrides.fetchImpl ?? fetch,
    session: overrides.session,
  };
  try {
    return await invoke(argv);
  } finally {
    io = previous;
  }
}
async function invoke(argv) {
  const { positional, flags } = parseArgs(argv);
  const [name, ...rest] = positional;
  const command = commands[name];
  if (!command) {
    note(`Unknown command "${name ?? ''}".`);
    note(`Commands: ${Object.keys(commands).join(', ')}`);
    return EXIT.usage;
  }
  try {
    await command(rest, flags);
    return EXIT.ok;
  } catch (error) {
    if (name === 'stage')
      note(
        'Stage did not complete successfully. Input file preserved; no automatic retry. Retrieve the workspace before deciding what to do next.',
      );
    if (error instanceof RelayError) {
      if (error.code === EXIT.refused) {
        note(
          name === 'context'
            ? 'context unavailable — no changes made'
            : name === 'stage'
              ? 'stage refused — input file preserved'
              : 'refused — no changes made',
        );
        note(`  ${error.message}`);
      } else if (error.message) note(error.message);
      return error.code;
    }
    note(error.message);
    return EXIT.server;
  }
}
