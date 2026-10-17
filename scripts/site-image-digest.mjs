// Digest of everything the site image contains: the built dist plus the server files the
// Dockerfile copies. The image workflow skips the build and push when an image with this
// digest exists.
// Usage: node scripts/site-image-digest.mjs [repo root]   -> prints a sha256 hex digest
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

// Two builds of one commit give identical files (tooltip ids come from their content,
// src/lib/tooltip-id.ts), so the files are hashed as they are.

function files(dir) {
 return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
 });
}

// The same set as the Dockerfile and .dockerignore: dist, the server, src/lib/*.ts without tests.
export function imageInputs(root) {
 const lib = readdirSync(join(root, 'src/lib')).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => join(root, 'src/lib', name));
 const fixed = ['Dockerfile', '.dockerignore', 'server/site-server.ts', 'server/package.json', 'server/package-lock.json', 'ops/self-host/egress-proxy.mjs'].map(name => join(root, name));
 return [...files(join(root, 'dist')), ...fixed, ...lib].map(path => relative(root, path).split(sep).join('/')).sort();
}

export function imageDigest(root) {
 const hash = createHash('sha256');
 for (const path of imageInputs(root)) {
  const body = readFileSync(join(root, path));
  hash.update(`${path}\0${statSync(join(root, path)).mode & 0o111 ? 'x' : '-'}\0${createHash('sha256').update(body).digest('hex')}\n`);
 }
 return hash.digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(imageDigest(process.argv[2] ?? '.'));
