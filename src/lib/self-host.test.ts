import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connect, createServer as createTcpServer, type AddressInfo} from 'node:net';
import {request} from 'node:http';
import {imageDigest, imageInputs} from '../../scripts/site-image-digest.mjs';
import {registryClient} from '../../scripts/site-image-registry.mjs';
import {createEgressProxy} from '../../ops/self-host/egress-proxy.mjs';
import {startSocketServer} from '../../server/site-server.ts';

function fixtureRoot() {
 const root = mkdtempSync(join(tmpdir(), 'bos-image-'));
 const write = (path: string, body: string) => { mkdirSync(join(root, path, '..'), {recursive: true}); writeFileSync(join(root, path), body); };
 write('dist/index.html', '<button aria-describedby="info-c901ce00-4f2b-4dff-8ef3-cb629c0c708d">i</button><div id="info-c901ce00-4f2b-4dff-8ef3-cb629c0c708d"></div>');
 write('dist/agent-pages.json', '{}');
 for (const path of ['Dockerfile', '.dockerignore', 'server/site-server.ts', 'server/package.json', 'server/package-lock.json', 'ops/self-host/egress-proxy.mjs', 'src/lib/ranking.ts', 'src/lib/ranking.test.ts']) write(path, path);
 return {root, write};
}

test('the image digest follows every image input and nothing else', () => {
 const {root, write} = fixtureRoot();
 try {
  assert.ok(!imageInputs(root).includes('src/lib/ranking.test.ts'));
  assert.ok(imageInputs(root).includes('server/site-server.ts'));
  const first = imageDigest(root);
  assert.equal(imageDigest(root), first);
  write('dist/index.html', '<p>new data</p>');
  const second = imageDigest(root);
  assert.notEqual(second, first);
  write('src/lib/ranking.test.ts', 'a test change');
  assert.equal(imageDigest(root), second);
  write('server/site-server.ts', 'a server change');
  assert.notEqual(imageDigest(root), second);
 } finally { rmSync(root, {recursive: true, force: true}); }
});

test('the egress proxy tunnels only to allowed hosts and refuses plain HTTP', async () => {
 const upstream = createTcpServer(socket => socket.on('data', data => socket.end('echo:' + data)));
 await new Promise<void>(done => upstream.listen(0, '127.0.0.1', done));
 const port = (upstream.address() as AddressInfo).port;
 const proxy = createEgressProxy(`127.0.0.1:${port}`, () => {});
 await new Promise<void>(done => proxy.listen(0, '127.0.0.1', done));
 const proxyPort = (proxy.address() as AddressInfo).port;
 const tunnel = (target: string) => new Promise<string>(done => {
  const socket = connect(proxyPort, '127.0.0.1', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
  let text = '';
  socket.on('data', chunk => { text += chunk; if (text.includes('200 Connection Established\r\n\r\n') && !text.includes('echo:')) socket.write('ping'); });
  socket.on('close', () => done(text));
 });
 try {
  assert.match(await tunnel(`127.0.0.1:${port}`), /200 Connection Established[\s\S]*echo:ping/);
  assert.match(await tunnel('example.com:443'), /^HTTP\/1\.1 403/);
  assert.match(await tunnel(`127.0.0.1:${port + 1}`), /^HTTP\/1\.1 403/);
  const plain = await new Promise<number>(done => request({host: '127.0.0.1', port: proxyPort, path: 'http://example.com/'}, res => { res.resume(); done(res.statusCode!); }).end());
  assert.equal(plain, 405);
 } finally { proxy.close(); upstream.close(); }
});

test('registry steps: exists, retag by copying the manifest, and prune keeps main and recent images', async () => {
 const calls: string[] = [];
 const manifests: Record<string, {body: string; digest: string}> = {'inputs-a': {body: '{"m":"a"}', digest: 'sha256:aaa'}, main: {body: '{"m":"b"}', digest: 'sha256:bbb'}};
 const versions = Array.from({length: 35}, (_, i) => ({id: i, created_at: new Date(Date.UTC(2026, 9, 16, 0, 0) - i * 3_600_000).toISOString(), metadata: {container: {tags: i === 34 ? ['main'] : [`sha-${i}`]}}}));
 versions.push({id: 99, created_at: new Date(Date.UTC(2026, 9, 1)).toISOString(), metadata: {container: {tags: []}}});
 const fetcher = (async (url: string, init: RequestInit = {}) => {
  const method = init.method ?? 'GET', path = new URL(url).pathname;
  calls.push(`${method} ${path}`);
  if (path === '/token') return Response.json({token: 't'});
  const tag = path.match(/\/manifests\/(.+)$/)?.[1];
  if (tag) {
   if (method === 'PUT') { manifests[tag] = {body: String(init.body), digest: 'sha256:aaa'}; return new Response(null, {status: 201}); }
   const found = manifests[tag];
   if (!found) return new Response(null, {status: 404});
   return new Response(method === 'HEAD' ? null : found.body, {headers: {'docker-content-digest': found.digest, 'content-type': 'application/vnd.oci.image.manifest.v1+json'}});
  }
  if (path.endsWith('/versions') && method === 'GET') return Response.json(new URL(url).searchParams.get('page') === '1' ? versions : []);
  if (method === 'DELETE') return new Response(null, {status: 204});
  return new Response(null, {status: 500});
 }) as typeof fetch;
 const client = registryClient({registry: 'https://registry.test', api: 'https://api.test', owner: 'bigospeedrun', name: 'site', user: 'u', token: 't', fetcher});
 assert.equal(await client.exists('inputs-a'), true);
 assert.equal(await client.exists('inputs-zzz'), false);
 assert.equal(await client.retag('inputs-a', 'main'), 'moved');
 assert.equal(manifests.main.body, '{"m":"a"}');
 assert.equal(await client.retag('inputs-a', 'main'), 'unchanged');
 const removed = await client.prune(30);
 // Versions 0-29 are the newest 30; 30-33 and the old untagged 99 go; 34 is tagged main.
 assert.deepEqual(removed.sort((a, b) => a - b), [30, 31, 32, 33, 99]);
});

test('the site server also listens on a Unix socket for Caddy', async () => {
 const root = mkdtempSync(join(tmpdir(), 'bos-socket-'));
 writeFileSync(join(root, 'index.html'), '<main>Home</main>');
 writeFileSync(join(root, '404.html'), '<main>Not found</main>');
 const socket = join(root, 'site.sock');
 writeFileSync(socket, 'stale');
 const server = await startSocketServer({root, socket});
 try {
  const status = await new Promise<number>(done => request({socketPath: socket, path: '/', headers: {host: 'bigospeedrun.com'}}, res => { res.resume(); done(res.statusCode!); }).end());
  assert.equal(status, 200);
 } finally { server.close(); rmSync(root, {recursive: true, force: true}); }
 assert.equal(existsSync(socket), false);
});
