import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boards as boardUrls } from '../../../lib/postings.ts';
import { ashbyBoardUrl } from './sources.mjs';

export const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

const FILES = {
  [boardUrls.greenhouse('northstar')]: 'boards/greenhouse-northstar.json',
  [boardUrls.greenhouse('exampleco')]: 'boards/greenhouse-exampleco.json',
  [boardUrls.lever('harbor')]: 'boards/lever-harbor.json',
  [ashbyBoardUrl('acme')]: 'boards/ashby-acme.json',
};

export async function loadFixtureFile(relative) {
  return JSON.parse(
    await readFile(join(FIXTURE_ROOT, relative), 'utf8'),
  );
}

export function fixtureFetch(overrides = {}) {
  const table = { ...FILES, ...overrides };
  return async (url) => {
    const relative = table[url];
    if (!relative)
      return new Response('not in fixtures', { status: 404 });
    const payload = await loadFixtureFile(relative);
    return Response.json(payload);
  };
}
