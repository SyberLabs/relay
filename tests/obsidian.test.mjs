import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  obsidianRow,
  obsidianNote,
  obsidianExample,
  obsidianDraftNote,
  loadObsidian,
  obsidianResearchBatch,
  obsidianResearchNote,
  obsidianWorkflows,
} from '../lib/obsidian.ts';
import {
  readIntegrationFiles,
  draftFromResult,
} from '../lib/integration-files.ts';
import { loadEditor, applyLoadedDraft } from '../lib/editor.ts';
import { parseDocument } from 'yaml';

const handoff = {
  id: 'job-123',
  key: 'https://example.com/jobs/a',
  name: 'Example role',
  url: 'https://example.com/jobs/a',
  version: 7,
};

void test('Obsidian properties and Markdown are preserved without following links', () => {
  const note =
    obsidianExample.replace(
      'Example Company — Platform Engineer',
      '"Example: Platform #1"',
    ) + '\n[[Private note]]\n![[resume.pdf]]\n';
  const row = obsidianRow('\uFEFF' + note.replaceAll('\n', '\r\n'));
  assert.equal(row.Name, 'Example: Platform #1');
  assert.equal(row.Job, 'https://example.com/jobs/platform-engineer');
  assert.equal(row.url, 'obsidian:example-company-platform-engineer');
  assert.match(row.Notes, /\[\[Private note\]\]/);
  assert.match(row.Notes, /!\[\[resume.pdf\]\]/);
  assert.equal(row.Status, 'Held');
  assert.deepEqual(row, obsidianRow(note));
});

void test('note status, draft and acceptance properties never become Relay actions', () => {
  for (const status of ['Ready', 'Submitted', 'Live loop', 'Unknown']) {
    const note = obsidianExample.replace(
      'relay_id:',
      `status: ${status}\nrelay_status_snapshot: ${status}\naccepted_draft: untrusted\ndraft: untrusted\nrelay_id:`,
    );
    const row = obsidianRow(note);
    assert.equal(row.Status, 'Held');
    assert.equal(row.draft, undefined);
    assert.equal(row.accepted_draft, undefined);
  }
});

void test('missing identity, invalid URLs and malformed properties reject the note', () => {
  for (const note of [
    '# Plain note',
    obsidianExample.replace(
      'relay_id: example-company-platform-engineer\n',
      '',
    ),
    obsidianExample.replace(
      'relay_id: example-company-platform-engineer',
      'relay_id: ../private',
    ),
    obsidianExample.replace(
      'relay_name: Example Company — Platform Engineer',
      'relay_name: []',
    ),
    obsidianExample.replace(
      'https://example.com/jobs/platform-engineer',
      'javascript:alert(1)',
    ),
    obsidianExample.replace('https://example.com/jobs/platform-engineer', ''),
    obsidianExample.replace(
      'relay_id:',
      'relay_job: https://example.com/other\nrelay_id:',
    ),
    obsidianExample.replace('relay_id:', 'extra: !unknown value\nrelay_id:'),
    obsidianExample.replace('relay_id:', 'extra: [broken\nrelay_id:'),
    '---\n[]\n---\nbody',
  ])
    assert.throws(() => obsidianRow(note));
});

void test('aliases and oversized input are bounded', () => {
  assert.throws(
    () =>
      obsidianRow(
        obsidianExample.replace(
          'relay_id:',
          'a: &a [one, two]\nb: *a\nrelay_id:',
        ),
      ),
    /aliases/,
  );
  assert.throws(() => obsidianRow('x'.repeat(100001)), /100,000/);
  assert.throws(
    () => obsidianRow(obsidianExample + 'x'.repeat(20000)),
    /20,000/,
  );
  assert.throws(
    () =>
      obsidianRow(
        obsidianExample.replace(
          'relay_id:',
          'extra: ' + 'x'.repeat(10000) + '\nrelay_id:',
        ),
      ),
    /properties are too large/,
  );
});

void test('context exports source history and literal drafts without becoming importable research', () => {
  const job = {
    id: 'job-123',
    name: 'Example: "Role"\nstatus: Ready',
    url: 'https://example.com/jobs/a',
    status: 'Live loop',
    version: 7,
  };
  const draft = 'Draft\n```\n# Literal heading\n````';
  const exported = obsidianNote(job, draft, 'Follow up tomorrow.', [
    {
      name: 'Research',
      notes: 'Prior observation',
      status: 'Held',
      source_url: 'obsidian:research-123',
    },
  ]);
  const properties = parseDocument(exported.split('---')[1]).toJS();
  assert.equal(properties.relay_name, job.name);
  assert.equal(properties.relay_job, job.url);
  assert.equal(properties.relay_kind, 'snapshot');
  assert.ok(exported.includes(draft));
  assert.match(exported, /`````text/);
  assert.match(exported, /Follow up tomorrow/);
  assert.match(exported, /Prior observation/);
  assert.match(exported, /obsidian:research-123/);
  assert.match(exported, /unsaved edits/);
  assert.throws(() => loadObsidian(exported), /reference only/);
});

void test('each workflow creates a research note tied to the selected posting', () => {
  for (const workflow of Object.keys(obsidianWorkflows)) {
    const row = obsidianRow(
      obsidianResearchNote(handoff, workflow, `note-${workflow}`),
    );
    assert.equal(row.Job, handoff.url);
    assert.equal(row.Name, handoff.name);
    assert.equal(row.Status, 'Held');
    assert.ok(row.Notes.startsWith('# '));
  }
});

void test('batch import rejects duplicate IDs and any malformed note without returning partial data', () => {
  const notes = [
    { name: 'one.md', text: obsidianExample },
    {
      name: 'two.md',
      text: obsidianExample.replace('relay_id: example', 'relay_id: second'),
    },
  ];
  assert.equal(obsidianResearchBatch(notes).length, 2);
  assert.throws(
    () => obsidianResearchBatch([notes[0], notes[0]]),
    /share a relay_id/,
  );
  assert.throws(
    () =>
      obsidianResearchBatch([
        notes[0],
        { name: 'broken.md', text: '# no properties' },
      ]),
    /broken.md/,
  );
  assert.throws(() => obsidianResearchBatch(Array(201).fill(notes[0])), /200/);
  const large = Array.from({ length: 100 }, (_, i) => ({
    name: `${i}.md`,
    text:
      obsidianResearchNote(handoff, 'research', `note-${i}`) +
      'x'.repeat(19000),
  }));
  assert.throws(() => obsidianResearchBatch(large), /too large/);
});

void test('draft round trip stages exact wording only for its job and version', () => {
  const result = loadObsidian(
    obsidianDraftNote(handoff, 'Edited in Obsidian.'),
  );
  assert.equal(result.provider, 'obsidian');
  assert.equal(result.reviewRequired, true);
  const editor = loadEditor({
    id: handoff.id,
    version: handoff.version,
    draft: 'Original',
    blocker: '',
  });
  const target = {
    jobId: editor.jobId,
    version: editor.version,
    session: editor.session,
    draft: editor.draft,
    job_key: handoff.key,
  };
  const text = draftFromResult(result, target);
  assert.equal(
    applyLoadedDraft(editor, text, target).draft,
    'Edited in Obsidian.',
  );
  assert.equal(
    applyLoadedDraft({ ...editor, draft: 'Typed while loading' }, text, target)
      .draft,
    'Typed while loading',
  );
  for (const changed of [
    { ...target, version: 8 },
    { ...target, jobId: 'different' },
    { ...target, job_key: 'https://example.com/other' },
    undefined,
  ])
    assert.throws(() => draftFromResult(result, changed), /matching job/);
  assert.throws(
    () => loadObsidian(obsidianDraftNote(handoff, '')),
    /between 1/,
  );
  assert.throws(() =>
    loadObsidian(
      obsidianDraftNote(handoff, 'Body').replace(
        'relay_version: 7',
        'relay_version: -1',
      ),
    ),
  );
  assert.throws(() =>
    obsidianDraftNote({ ...handoff, key: 'mismatch' }, 'Body'),
  );
  assert.throws(
    () =>
      obsidianResearchBatch([
        { name: 'draft.md', text: obsidianDraftNote(handoff, 'Body') },
      ]),
    /individually/,
  );
});

await test('draft handoffs work for valid jobs without a posting URL', () => {
  const sourceJob = {
    id: 'job-123',
    key: 'source:https://example.com/research/no-url',
    name: 'Example role',
    url: null,
    version: 7,
  };
  const result = loadObsidian(
    obsidianDraftNote(sourceJob, 'Reviewed without a posting URL.'),
  );
  assert.equal(result.job.key, sourceJob.key);
  const target = {
    jobId: sourceJob.id,
    version: sourceJob.version,
    session: 'session-1',
    draft: 'Original',
    job_key: sourceJob.key,
  };
  assert.equal(
    draftFromResult(result, target),
    'Reviewed without a posting URL.',
  );
  assert.equal(
    draftFromResult(
      {
        schema: 'relay.draft.v1',
        draft: 'Assistant wording',
        job: { key: sourceJob.key, url: null, version: 7 },
      },
      target,
    ),
    'Assistant wording',
  );
  assert.throws(
    () =>
      draftFromResult(
        {
          schema: 'relay.draft.v1',
          draft: 'Wrong job',
          job: {
            key: sourceJob.key,
            url: 'https://example.com/jobs/a',
            version: 7,
          },
        },
        target,
      ),
    /matching job/,
  );
  assert.throws(
    () => draftFromResult(result, { ...target, version: 8 }),
    /matching job/,
  );
  assert.throws(() =>
    obsidianDraftNote(
      { ...sourceJob, url: 'https://example.com/jobs/a' },
      'Body',
    ),
  );
});

await test('file loading supports Markdown batches, individual drafts and existing JSON handoffs', async () => {
  const file = (name, text) => ({
    name,
    size: new TextEncoder().encode(text).length,
    text: async () => text,
  });
  const note = file('research.MD', obsidianExample);
  assert.deepEqual(await readIntegrationFiles([note]), [
    obsidianRow(obsidianExample),
  ]);
  const draft = file('draft.md', obsidianDraftNote(handoff, 'Edited draft'));
  assert.equal((await readIntegrationFiles([draft])).draft, 'Edited draft');
  const json = file(
    'result.json',
    JSON.stringify([obsidianRow(obsidianExample)]),
  );
  assert.deepEqual(await readIntegrationFiles([json]), [
    obsidianRow(obsidianExample),
  ]);
  await assert.rejects(readIntegrationFiles([note, json]), /separately/);
  await assert.rejects(readIntegrationFiles([note, draft]), /individually/);
  await assert.rejects(
    readIntegrationFiles([
      {
        ...note,
        size: 1800001,
        text: () => {
          throw Error('Must not read');
        },
      },
    ]),
    /1.8 MB/,
  );
});

void test('CLI creates a draft note without facts or credentials and converts it back for review', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'relay-obsidian-draft-'));
  try {
    const packet = join(folder, 'packet.json');
    const note = join(folder, 'draft.md');
    const output = join(folder, 'draft.json');
    await writeFile(
      packet,
      JSON.stringify({
        schema: 'relay.packet.v1',
        job: handoff,
        draft: 'Initial draft',
        facts: '',
      }),
    );
    const run = (...args) =>
      spawnSync(process.execPath, ['integrations/relay.mjs', ...args], {
        encoding: 'utf8',
      });
    const exported = run('obsidian-draft', packet, note);
    assert.equal(exported.status, 0, exported.stderr);
    await writeFile(
      note,
      (await readFile(note, 'utf8')).replace('Initial draft', 'Revised draft'),
    );
    const imported = run('obsidian-pull', note, output);
    assert.equal(imported.status, 0, imported.stderr);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(result.job, handoff);
    assert.equal(result.draft, 'Revised draft');
    assert.equal(result.reviewRequired, true);
    assert.equal(run('obsidian-draft', packet, note).status, 1);
    const one = join(folder, 'one.md'),
      two = join(folder, 'two.md'),
      batch = join(folder, 'batch.json');
    await writeFile(one, obsidianResearchNote(handoff, 'research', 'one'));
    await writeFile(two, obsidianResearchNote(handoff, 'interview', 'two'));
    const batched = run('obsidian-pull', one, two, batch);
    assert.equal(batched.status, 0, batched.stderr);
    assert.equal(JSON.parse(await readFile(batch, 'utf8')).length, 2);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('command reads only the selected note, leaves it intact, and refuses overwrite', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'relay-obsidian-'));
  try {
    const input = join(folder, 'selected.md');
    const output = join(folder, 'result.json');
    await writeFile(input, obsidianExample);
    await writeFile(join(folder, 'private.md'), 'PRIVATE UNSELECTED NOTE');
    const run = (...args) =>
      spawnSync(
        process.execPath,
        ['integrations/relay.mjs', 'obsidian-pull', ...args],
        { encoding: 'utf8' },
      );
    const first = run(input, output);
    assert.equal(first.status, 0, first.stderr);
    const result = await readFile(output, 'utf8');
    assert.deepEqual(JSON.parse(result), [obsidianRow(obsidianExample)]);
    assert.doesNotMatch(result, /PRIVATE UNSELECTED/);
    assert.equal(await readFile(input, 'utf8'), obsidianExample);
    assert.equal(run(input, output).status, 1);
    assert.equal(await readFile(output, 'utf8'), result);
    assert.equal(run(input).status, 1);
    await writeFile(input, '# malformed note');
    const rejected = join(folder, 'rejected.json');
    assert.equal(run(input, rejected).status, 1);
    await assert.rejects(readFile(rejected), { code: 'ENOENT' });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
