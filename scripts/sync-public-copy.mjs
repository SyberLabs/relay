#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const start = '<!-- relay:public:start -->';
export const end = '<!-- relay:public:end -->';
export const targets = {
  project: 'README.md',
  organization: 'profile/README.md',
  profile: 'README.md',
  website: 'index.html',
};
const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

export function render(copy, target) {
  if (!Object.hasOwn(targets, target))
    throw Error('Unknown public-copy target.');
  for (const value of [copy.repository, copy.leadProfile, copy.peerProfile]) {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.username ||
      url.password
    )
      throw Error(
        'Public repository and profile links must use HTTPS on github.com without credentials.',
      );
  }
  const guide = `${copy.repository}/blob/main/integrations/OPENAI.md`;
  const integrations = copy.integrations.map((item) => item.name).join(', ');
  const credit = `**Relay lead engineer: [${copy.leadEngineer}](${copy.leadProfile}).** **Product: [${copy.peerEngineer}](${copy.peerProfile}).**`;
  if (target === 'project')
    return `**${copy.tagline}**

${copy.summary}

${credit}

## Available in this early release

${copy.capabilities.map((item) => `- ${item}`).join('\n')}
- Explore fictional example records; no real applicant data is included.

## Integrations

${copy.integrations.map((item) => `- **[${item.name}](${item.guide})**: ${item.description}`).join('\n')}

${copy.boundary}

${copy.openaiBoundary}

[Integration setup](integrations/README.md) | [ChatGPT and Codex guide](integrations/OPENAI.md) | [Launch copy](LAUNCH.md)`;
  if (target === 'organization')
    return `A two-person lab. **[${copy.peerEngineer}](${copy.peerProfile})** · SyberLabs / RISE. **[${copy.leadEngineer}](${copy.leadProfile})** · Relay lead engineer; systems on RISE and OSAHR.

## RELAY - our flagship project

**[${copy.name}](${copy.repository}) is SyberLabs' current product focus.**

${copy.summary}

${credit}

${copy.stage}. Review and approve wording for each job; Relay does not POST the employer form.

<details>
<summary>Integrations and review boundaries</summary>

Works with **${integrations}** through explicit integrations. ${copy.openaiBoundary}

${copy.boundary}

</details>

**[Explore RELAY](${copy.repository})** | [ChatGPT and Codex setup](${guide})`;
  if (target === 'profile')
    return `- **[${copy.name}](${copy.repository}) - Lead engineer.** ${copy.summary} ${copy.stage}; drafts require human review and Relay does not POST the employer form. [Integration guides, including ChatGPT and Codex](${guide}).`;
  return `<p class="relay-release">${escapeHtml(copy.summary)} ${escapeHtml(copy.stage)}. ${escapeHtml(copy.boundary)} <a href="${escapeHtml(guide)}" target="_blank" rel="noopener">ChatGPT and Codex setup &#8599;</a></p>`;
}

export function replaceBlock(source, content) {
  if (source.split(start).length !== 2 || source.split(end).length !== 2)
    throw Error(
      'Expected exactly one managed RELAY block. Restore its markers before syncing.',
    );
  const first = source.indexOf(start),
    last = source.indexOf(end);
  if (last < first) throw Error('RELAY markers are reversed.');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return (
    source.slice(0, first) +
    start +
    newline +
    content.replace(/\r?\n/g, newline) +
    newline +
    end +
    source.slice(last + end.length)
  );
}

async function main() {
  const args = process.argv.slice(2);
  const target = args[args.indexOf('--target') + 1];
  const root = args[args.indexOf('--root') + 1];
  if (
    !args.includes('--target') ||
    !args.includes('--root') ||
    !root ||
    !Object.hasOwn(targets, target)
  )
    throw Error(
      'Usage: node scripts/sync-public-copy.mjs --target project|organization|profile|website --root checkout [--check]',
    );
  const copy = JSON.parse(
    await readFile(
      new URL('../docs/public-copy.json', import.meta.url),
      'utf8',
    ),
  );
  const path = resolve(root, targets[target]);
  const previous = await readFile(path, 'utf8');
  const next = replaceBlock(previous, render(copy, target));
  if (previous === next) {
    console.log(`${target}: current`);
    return;
  }
  if (args.includes('--check'))
    throw Error(
      `${target}: RELAY copy is stale. Run the same command without --check.`,
    );
  await writeFile(path, next, 'utf8');
  console.log(`${target}: updated managed RELAY block`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
