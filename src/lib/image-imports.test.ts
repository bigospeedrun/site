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

// A bare package import (not node: and not relative) on the server's graph must be a dependency in server/package.json, the
// only node_modules in the image (2026-11-25: b38aac4 made chat-knowledge.ts reach math.ts, which imports katex; the new
// container failed at start and the deploy rolled back while CI passed).
const packages = (file: string): string[] => {
  const source = readFileSync(join(root, file), 'utf8');
  return [...source.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^'"`;]*?from\s*['"]([^.'"][^'"]*)['"]|^\s*import\s+['"]([^.'"][^'"]*)['"]/gm)]
    .filter(match => !match[1]).map(match => match[2] ?? match[3]).filter(name => !name.startsWith('node:'))
    .map(name => name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);
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
  const dependencies = new Set(Object.keys(JSON.parse(readFileSync(join(root, 'server/package.json'), 'utf8')).dependencies ?? {}));
  const needed = [...seen].filter(file => file.endsWith('.ts') && existsSync(join(root, file))).flatMap(file => packages(file).map(name => `${file}: ${name}`));
  assert.deepEqual(needed.filter(entry => !dependencies.has(entry.split(': ')[1])), [], 'a package the server imports is not in server/package.json');
  assert.ok(needed.some(entry => entry.endsWith(': parse5')), 'the check sees the packages the server needs');
  assert.ok(seen.has('src/lib/closed-boards.ts') && !seen.has('src/lib/closed-boards-html.ts') && !seen.has('src/lib/math.ts'), 'the server does not reach katex');
  assert.ok(seen.has('src/lib/submission.ts') && seen.has('src/lib/prove2me-campaigns.ts'), 'the crawl reaches the campaign list');
  assert.ok(existsSync(join(root, 'src/lib/prove2me-campaigns.ts')));
});
