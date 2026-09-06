import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const routeSrc = readFileSync(join(root, 'app/api/workspace/route.ts'), 'utf8');
const recentSql =
  'SELECT * FROM events WHERE owner=? ORDER BY created DESC LIMIT 200';
const jobSql =
  'SELECT * FROM events WHERE owner=? AND job_id=? ORDER BY created DESC LIMIT 200';

await test('workspace route keeps initial event reads bounded and job history owner-scoped', () => {
  assert.equal(routeSrc.includes(recentSql), true);
  assert.equal(routeSrc.includes(jobSql), true);
  assert.match(routeSrc, /searchParams\.get\('job'\)/);
});

await test('selected-job history remains retrievable after 200 newer unrelated events', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of readdirSync(join(root, 'drizzle'))
      .filter((file) => file.endsWith('.sql'))
      .sort())
      for (const part of readFileSync(
        join(root, 'drizzle', name),
        'utf8',
      ).split('--> statement-breakpoint')) {
        const sql = part.trim();
        if (sql) db.exec(sql);
      }
    const owner = 'owner-a';
    const other = 'owner-b';
    db.prepare(
      'INSERT INTO jobs (id,owner,job_key,name,url,status,blocker,draft,accepted_draft,version,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'job-old',
      owner,
      'https://example.com/jobs/old',
      'Old role',
      'https://example.com/jobs/old',
      'Ready',
      '',
      'Exact accepted text',
      'Exact accepted text',
      2,
      '2026-01-01T00:00:00.000Z',
    );
    db.prepare(
      'INSERT INTO events (id,owner,job_id,kind,detail,created) VALUES (?,?,?,?,?,?)',
    ).run(
      'evt-old',
      owner,
      'job-old',
      'Draft accepted',
      JSON.stringify({
        status: 'Ready',
        draft: 'Exact accepted text',
        blocker: '',
      }),
      '2026-01-01T00:00:00.000Z',
    );
    for (let i = 0; i < 201; i++) {
      db.prepare(
        'INSERT INTO events (id,owner,job_id,kind,detail,created) VALUES (?,?,?,?,?,?)',
      ).run(
        `evt-new-${i}`,
        owner,
        'job-other',
        'Review saved',
        JSON.stringify({ status: 'Held', draft: `later ${i}`, blocker: '' }),
        `2026-02-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      );
    }
    db.prepare(
      'INSERT INTO events (id,owner,job_id,kind,detail,created) VALUES (?,?,?,?,?,?)',
    ).run(
      'evt-foreign',
      other,
      'job-old',
      'Draft accepted',
      JSON.stringify({
        status: 'Ready',
        draft: 'Other owner text',
        blocker: '',
      }),
      '2026-01-01T00:00:00.000Z',
    );
    const recent = db.prepare(recentSql).all(owner);
    assert.equal(recent.length, 200);
    assert.equal(
      recent.some((event) => event.id === 'evt-old'),
      false,
    );
    const selected = db.prepare(jobSql).all(owner, 'job-old');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].kind, 'Draft accepted');
    assert.equal(JSON.parse(selected[0].detail).draft, 'Exact accepted text');
    assert.equal(db.prepare(jobSql).all(other, 'job-old').length, 1);
    assert.equal(
      JSON.parse(db.prepare(jobSql).get(other, 'job-old').detail).draft,
      'Other owner text',
    );
    assert.equal(db.prepare(jobSql).all(owner, 'missing').length, 0);
  } finally {
    db.close();
  }
});
