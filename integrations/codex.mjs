import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { assistantPrompt, assistantResult } from '../lib/assistant-handoff.ts';

function run(executable, args, options, prompt) {
  return new Promise((resolveRun, reject) => {
    const child = execFile(executable, args, options, (error) => {
      if (error)
        reject(
          Error(
            'Codex did not complete. Check CLI installation, sign-in and account limits; no draft was saved.',
          ),
        );
      else resolveRun();
    });
    child.stdin.on('error', () => {}); // Process failure is reported by the callback.
    child.stdin.end(prompt);
  });
}

export async function draftCodex(packet, runner = run) {
  const prompt = assistantPrompt(packet, 'codex', true);
  const tempRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(tempRoot, 'relay-codex-'));
  try {
    const schema = join(directory, 'schema.json');
    const output = join(directory, 'response.json');
    await writeFile(
      schema,
      JSON.stringify({
        type: 'object',
        properties: { draft: { type: 'string' } },
        required: ['draft'],
        additionalProperties: false,
      }),
      { mode: 0o600 },
    );
    await runner(
      'codex',
      [
        'exec',
        '--sandbox',
        'read-only',
        '--ephemeral',
        '--skip-git-repo-check',
        '--output-schema',
        schema,
        '--output-last-message',
        output,
        '-',
      ],
      {
        cwd: directory,
        timeout: 180000,
        maxBuffer: 1048576,
        windowsHide: true,
      },
      prompt,
    );
    const response = JSON.parse(await readFile(output, 'utf8'));
    // Identity and review authority come from Relay, never from model output.
    return assistantResult(packet, response.draft, 'codex');
  } finally {
    if (resolve(directory).startsWith(tempRoot + sep))
      await rm(directory, { recursive: true, force: true });
  }
}
