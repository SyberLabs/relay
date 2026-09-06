#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  pullNotion,
  draftClaude,
  validatePacket,
  pullBoard,
} from './connectors.mjs';
import { validateRows } from '../lib/domain.ts';
import { obsidianDraftNote } from '../lib/obsidian.ts';
import { readIntegrationFiles } from '../lib/integration-files.ts';
import { assistantPrompt, assistantResult } from '../lib/assistant-handoff.ts';
import { draftCodex } from './codex.mjs';
import { run as runCli } from './cli.mjs';
const [command, input, output] = process.argv.slice(2);
// API-backed commands live in cli.mjs and exit with the agent contract's codes.
// The file-producing connectors below predate it and stay as they were.
const apiCommands = new Set([
  'login',
  'brief',
  'log',
  'draft',
  'plan',
  'status',
  'outcome',
]);
if (apiCommands.has(command)) {
  // Forced process.exit after fetch aborts Windows Node 24: libuv asserts
  // UV_HANDLE_CLOSING on a still-closing async handle (nodejs/node#56645).
  process.exitCode = await runCli(process.argv.slice(2));
} else {
  await runFileCommand();
}
async function read(path) {
  if (!path) throw Error('An input file is required.');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function save(path, data, markdown = false) {
  if (!path) throw Error('An output file is required.');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    markdown ? data : JSON.stringify(data, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  console.log(
    markdown
      ? 'Saved. Follow the selected integration guide, then return the result to Relay for review.'
      : 'Saved. Import the output in Relay for review.',
  );
}
async function runFileCommand() {
try {
  if (command === 'board-pull') {
    // Usage: board-pull greenhouse northstar out.json
    const [, provider, board, target] = process.argv.slice(2);
    if (!provider || !board || !target)
      throw Error('Usage: board-pull <greenhouse|lever> <board> output.json');
    const rows = await pullBoard({ provider, board });
    await save(target, rows);
    console.log(`${rows.length} postings normalised from ${provider}.`);
  } else if (command === 'notion-pull') {
    // One page per call makes truncation explicit and avoids unbounded API work.
    const page = await pullNotion({
      token: process.env.NOTION_TOKEN,
      dataSource: process.env.NOTION_DATA_SOURCE_ID,
      cursor: process.env.NOTION_CURSOR,
      fields: process.env.RELAY_NOTION_FIELDS
        ? JSON.parse(process.env.RELAY_NOTION_FIELDS)
        : {},
    });
    if (!page.rows.length) console.log('No records in this page.');
    else await save(input, page.rows);
    if (page.cursor)
      console.log(
        'More records remain. Set NOTION_CURSOR for the next call: ' +
          page.cursor,
      );
  } else if (command === 'obsidian-pull') {
    const paths = process.argv.slice(3, -1);
    if (!input || !output || paths.some((path) => !/\.md$/i.test(path)))
      throw Error('Usage: obsidian-pull note.md [another.md ...] output.json');
    if (paths.length > 200) throw Error('Select at most 200 research notes.');
    const files = await Promise.all(
      paths.map(async (path) => ({
        name: path,
        size: (await stat(path)).size,
        text: () => readFile(path, 'utf8'),
      })),
    );
    await save(process.argv.at(-1), await readIntegrationFiles(files));
  } else if (command === 'obsidian-draft') {
    if (!input || !output)
      throw Error('Usage: obsidian-draft packet.json output.md');
    const packet = await read(input);
    if (packet?.schema !== 'relay.packet.v1')
      throw Error('Choose a Relay job packet.');
    await save(output, obsidianDraftNote(packet.job, packet.draft), true);
  } else if (command === 'claude-draft') {
    if (!output) throw Error('Usage: claude-draft packet.json output.json');
    const result = await draftClaude({
      token: process.env.ANTHROPIC_API_KEY,
      model: process.env.RELAY_CLAUDE_MODEL,
      packet: await read(input),
    });
    await save(output, result);
  } else if (command === 'chatgpt-prompt' || command === 'codex-prompt') {
    await save(
      output,
      assistantPrompt(
        await read(input),
        command === 'chatgpt-prompt' ? 'chatgpt' : 'codex',
      ),
      true,
    );
  } else if (command === 'codex-run') {
    if (!output) throw Error('Usage: codex-run packet.json output.json');
    try {
      await stat(output);
      throw Error('Output already exists. Choose a new filename.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await save(output, await draftCodex(await read(input)));
  } else if (command === 'chatgpt-draft' || command === 'codex-draft') {
    if (!input || !output || !process.argv[5])
      throw Error(`Usage: ${command} packet.json draft.txt output.json`);
    await save(
      process.argv[5],
      assistantResult(
        await read(input),
        await readFile(output, 'utf8'),
        command === 'chatgpt-draft' ? 'chatgpt' : 'codex',
      ),
    );
  } else if (command === 'grok-research') {
    await save(output, validateRows(await read(input)));
  } else if (command === 'grok-draft') {
    const packet = validatePacket(await read(input));
    const draftFile = process.argv[5];
    // Syntax: grok-draft packet.json draft.txt output.json
    const draft = (await readFile(output, 'utf8')).trim();
    if (!draft || draft.length > 20000)
      throw Error('Draft must contain between 1 and 20,000 characters.');
    await save(draftFile, {
      schema: 'relay.draft.v1',
      job: packet.job,
      draft,
      provider: 'grok-bot',
      reviewRequired: true,
    });
  } else {
    console.log(
      'Relay integrations\n  login | brief | log | draft | plan | status | outcome   (local API; see integrations/README.md)\n  notion-pull output.json\n  obsidian-pull note.md [another.md ...] output.json\n  obsidian-draft packet.json output.md\n  claude-draft packet.json output.json\n  chatgpt-prompt packet.json output.md\n  codex-prompt packet.json output.md\n  codex-run packet.json output.json\n  chatgpt-draft packet.json draft.txt output.json\n  codex-draft packet.json draft.txt output.json\n  grok-research rows.json output.json\n  grok-draft packet.json draft.txt output.json\nCredentials are read from environment variables or Codex CLI sign-in. See integrations/README.md.',
    );
    if (command && command !== '--help') process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
}
