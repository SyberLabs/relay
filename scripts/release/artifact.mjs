import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const roots = ['dist', 'deploy', 'drizzle'];
function files(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = `${directory}/${name}`;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlinks forbidden: ${path}`);
    return stat.isDirectory() ? files(path) : [path];
  });
}
function checksums() {
  return Object.fromEntries(roots.flatMap(files).map(path => [path,
    createHash('sha256').update(readFileSync(path)).digest('hex')]));
}
export function verifyManifest(manifest, expectedSha, actual) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '') || manifest.sha !== expectedSha || manifest.version !== 1) {
    throw new Error('Release provenance mismatch');
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(actual)) throw new Error('Release files changed');
  for (const file of ['dist/server/index.js', 'dist/server/wrangler.json', 'dist/gateway/worker.js', 'deploy/worker.mjs', 'deploy/access.mjs', 'deploy/handler.mjs']) {
    if (!actual[file]) throw new Error(`Release missing ${file}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sha = process.env.RELEASE_SHA ?? process.env.GITHUB_SHA;
  const actual = checksums();
  if (process.argv[2] === 'create') {
    const manifest = { version: 1, sha, files: actual };
    verifyManifest(manifest, sha, actual);
    writeFileSync('release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  } else if (process.argv[2] === 'verify') {
    verifyManifest(JSON.parse(readFileSync('release-manifest.json', 'utf8')), sha, actual);
  } else throw new Error('Use create or verify');
}
