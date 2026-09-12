import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

void test('deployed schema metadata does not regenerate applied migrations', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'relay-migration-metadata-'));
  const output = join(scratch, 'drizzle');
  try {
    cpSync('drizzle', output, { recursive: true });
    const before = readdirSync(output)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const result = execFileSync(
      process.execPath,
      [
        resolve('node_modules/drizzle-kit/bin.cjs'),
        'generate',
        '--dialect',
        'sqlite',
        '--schema',
        resolve('db/schema.ts').replaceAll('\\', '/'),
        '--out',
        './drizzle',
      ],
      { cwd: scratch, timeout: 30000, encoding: 'utf8', stdio: 'pipe' },
    );
    assert.deepEqual(
      readdirSync(output)
        .filter((name) => name.endsWith('.sql'))
        .sort(),
      before,
    );
    assert.match(result, /No schema changes/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
