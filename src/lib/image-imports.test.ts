import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// The site image holds dist, the server, and src/lib/*.ts without tests (Dockerfile, .dockerignore, and
// imageInputs in scripts/site-image-digest.mjs, which self-host.test.ts keeps in step with them). A file
// that the server imports outside that set makes the container fail at start, and the deploy rolls back
// (2026-10-19, src/data/prove2me-campaigns.json). Astro builds and the other tests still pass then, so
// this test follows the server's import graph the way node does and checks it against the image files.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const imported = (file: string): string[] => {
  const source = readFileSync(join(root, file), 'utf8');
  const found: string[] = [];
  // Static imports and re-exports; `import type` is erased by --experimental-strip-types and never loaded.
  for (const match of source.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^'"`;]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/gm)) {
    if (match[1]) continue;
    found.push(relative(root, resolve(root, dirname(file), match[2] ?? match[3])).split('\\').join('/'));
  }
  return found;
};

test('every file the site server imports is in the site image', () => {
  const inImage = new Set<string>(['server/site-server.ts', 'ops/self-host/egress-proxy.mjs',
    ...readdirSync(join(root, 'src/lib')).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => 'src/lib/' + name)]);
  const seen = new Set<string>(), queue = ['server/site-server.ts'], missing: string[] = [];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!inImage.has(file)) { missing.push(file); continue; }
    if (file.endsWith('.ts')) queue.push(...imported(file));
  }
  assert.deepEqual(missing, [], 'imported by the server but not copied into the image');
  assert.ok(seen.has('src/lib/submission.ts') && seen.has('src/lib/prove2me-campaigns.ts'), 'the crawl reaches the campaign list');
  assert.ok(existsSync(join(root, 'src/lib/prove2me-campaigns.ts')));
});
