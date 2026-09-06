#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  pullNotion,
  draftClaude,
  validatePacket,
  pullBoard,
} from './connectors.mjs';
import { validateRows } from '../lib/domain.ts';
const [command, input, output] = process.argv.slice(2);
async function read(path) {
  if (!path) throw Error('An input file is required.');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function save(path, data) {
  if (!path) throw Error('An output file is required.');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Saved. Import the output in Relay for review.');
}
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
  } else if (command === 'claude-draft') {
    if (!output) throw Error('Usage: claude-draft packet.json output.json');
    const result = await draftClaude({
      token: process.env.ANTHROPIC_API_KEY,
      model: process.env.RELAY_CLAUDE_MODEL,
      packet: await read(input),
    });
    await save(output, result);
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
      'Relay integrations\n  notion-pull output.json\n  claude-draft packet.json output.json\n  grok-research rows.json output.json\n  grok-draft packet.json draft.txt output.json\nCredentials are read from environment variables. See integrations/README.md.',
    );
    if (command && command !== '--help') process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
