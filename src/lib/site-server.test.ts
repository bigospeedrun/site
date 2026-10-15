import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {startSiteServer} from '../../server/site-server.ts';
import {createKnowledge} from './chat-knowledge.ts';

// A small prebuilt dist, so the test needs no Astro build.
const root = mkdtempSync(join(tmpdir(), 'site-server-'));
const write = (path: string, body: string) => { mkdirSync(join(root, path, '..'), {recursive: true}); writeFileSync(join(root, path), body); };
write('index.html', '<html><main>Home</main></html>');
write('about/index.html', '<html><main>About</main></html>');
write('404.html', '<html><main>Not found</main></html>');
write('_astro/app.Bx1.js', 'console.log(1)');
write('llms.txt', 'agents');
write('sources/run.lean', 'theorem t : True := trivial');
write('agent-pages.json', JSON.stringify({'/': {markdown: '# Home\n', html: '<main>Home</main>'}, '/about': {markdown: '# About\n', html: '<main>About</main>'}, '/404': {markdown: '# Not found\n', html: '<main>Not found</main>'}}));
const knowledge = createKnowledge([], '2026-10-16T00:00:00Z');
knowledge.pages = {'/': 'Home', '/about': 'The FAQ explains how to submit a result.'};
write('chat-knowledge.json', JSON.stringify(knowledge));
writeFileSync(join(root, '..', 'site-server-secret.txt'), 'outside the root');

// Stubbed Anthropic call: one streamed text event, as the API sends it.
let calls = 0;
const fetcher: typeof fetch = async () => { calls++; return new Response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Read the FAQ."}}\r\n\r\ndata: {"type":"message_stop"}\r\n\r\n', {headers: {'content-type': 'text/event-stream'}}); };
let server: Awaited<ReturnType<typeof startSiteServer>>, keyless: typeof server, base: string, keylessBase: string;
before(async () => {
 server = await startSiteServer({root, env: {ANTHROPIC_API_KEY: 'test-only-placeholder'}, fetcher, port: 0, host: '127.0.0.1'});
 keyless = await startSiteServer({root, env: {}, port: 0, host: '127.0.0.1'});
 base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 keylessBase = `http://127.0.0.1:${(keyless.address() as AddressInfo).port}`;
});
after(() => { server.close(); keyless.close(); rmSync(root, {recursive: true, force: true}); rmSync(join(root, '..', 'site-server-secret.txt'), {force: true}); });
const get = (path: string, headers: Record<string, string> = {}, init: RequestInit = {}) => fetch(base + path, {redirect: 'manual', ...init, headers});

test('pages, directories and the home page match Vercel status and headers', async () => {
 for (const path of ['/', '/about', '/about/', '/index.html']) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=63072000');
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.match(response.headers.get('etag')!, /^"[0-9a-f]{40}"$/);
 }
 assert.equal(await (await get('/about')).text(), '<html><main>About</main></html>');
 const etag = (await get('/')).headers.get('etag')!;
 const cached = await get('/', {'if-none-match': etag});
 assert.equal(cached.status, 304);
 assert.equal(await cached.text(), '');
 const head = await get('/', {}, {method: 'HEAD'});
 assert.equal(head.status, 200);
 assert.equal(await head.text(), '');
});

test('static files keep Vercel content types and the immutable cache for _astro', async () => {
 const script = await get('/_astro/app.Bx1.js');
 assert.equal(script.headers.get('content-type'), 'application/javascript; charset=utf-8');
 assert.equal(script.headers.get('cache-control'), 'public, max-age=31536000, immutable');
 assert.equal((await get('/llms.txt')).headers.get('content-type'), 'text/plain; charset=utf-8');
 assert.equal((await get('/sources/run.lean')).headers.get('content-type'), 'application/octet-stream');
 assert.equal((await get('/agent-pages.json')).status, 200);
 const post = await get('/', {}, {method: 'POST'});
 assert.equal(post.status, 405);
 assert.equal(post.headers.get('content-type'), null);
 assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('unknown paths and escapes get the 404 page with status 404', async () => {
 for (const path of ['/does-not-exist', '/about/nothing', '/%2e%2e/site-server-secret.txt', '/..%2fsite-server-secret.txt', '/%E0%A4%A']) {
  const response = await get(path);
  assert.equal(response.status, 404, path);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), '<html><main>Not found</main></html>');
 }
});

test('Accept: text/markdown routes pages to the markdown view, as vercel.json does', async () => {
 const about = await get('/about', {accept: 'text/markdown'});
 assert.equal(about.status, 200);
 assert.equal(about.headers.get('content-type'), 'text/markdown; charset=utf-8');
 assert.equal(about.headers.get('cache-control'), 'private, no-store');
 assert.equal(about.headers.get('vary'), 'Accept');
 assert.equal(await about.text(), '# About\n');
 assert.equal(await (await get('/', {accept: 'text/markdown'})).text(), '# Home\n');
 assert.equal(await (await get('/about/index.html', {accept: 'text/markdown'})).text(), '# About\n');
 const missing = await get('/does-not-exist', {accept: 'text/markdown'});
 assert.equal(missing.status, 404);
 assert.equal(await missing.text(), '# Not found\n');
 // Vercel matches the header with a regex; the function then weighs q-values and may return HTML.
 const declined = await get('/about', {accept: 'text/markdown;q=0, text/html'});
 assert.equal(declined.headers.get('content-type'), 'text/html; charset=utf-8');
 assert.equal(declined.headers.get('cache-control'), 'private, no-store');
 // Files with another extension stay files.
 assert.equal((await get('/llms.txt', {accept: 'text/markdown'})).headers.get('content-type'), 'text/plain; charset=utf-8');
 assert.equal((await get('/_astro/app.Bx1.js', {accept: 'text/markdown'})).headers.get('cache-control'), 'public, max-age=31536000, immutable');
 assert.equal(await (await get('/api/markdown?agentPath=about')).text(), '<main>About</main>');
});

test('chat status, origin check, streamed reply and the per-IP rate limit', async () => {
 const status = await (await fetch(keylessBase + '/api/chat')).json();
 assert.deepEqual(status, {logging: false, stub: false, available: false});
 // fetch cannot set Host, so the site origin here is the test server. Behind Caddy it is
 // https://bigospeedrun.com: the proxy keeps Host and sets X-Forwarded-Proto: https.
 const origin = base.replace(/^http:/, 'https:');
 const post = (ip: string, from = origin) => fetch(base + '/api/chat', {method: 'POST', headers: {'content-type': 'application/json', origin: from, 'x-forwarded-proto': 'https', 'x-forwarded-for': ip},
  body: JSON.stringify({messages: [{role: 'user', content: 'How do I submit?'}], page: '/about'})});
 assert.equal((await post('203.0.113.9', 'https://evil.example')).status, 403);
 // Without X-Forwarded-Proto the request is http, so an https origin does not match.
 assert.equal((await fetch(base + '/api/chat', {method: 'POST', headers: {'content-type': 'application/json', origin, 'x-forwarded-for': '203.0.113.8'}, body: '{}'})).status, 403);
 const reply = await post('203.0.113.1');
 assert.equal(reply.status, 200);
 assert.match(reply.headers.get('content-type')!, /text\/event-stream/);
 assert.match(await reply.text(), /Read the FAQ\./);
 assert.equal(calls, 1);
 for (let i = 0; i < 4; i++) assert.equal((await post('203.0.113.1')).status, 200);
 const limited = await post('203.0.113.1');
 assert.equal(limited.status, 429);
 assert.match(limited.headers.get('retry-after')!, /^\d+$/);
 assert.equal(limited.headers.get('strict-transport-security'), 'max-age=63072000');
 // The limit is per client IP from X-Forwarded-For.
 assert.equal((await post('203.0.113.2')).status, 200);
 assert.equal(calls, 6);
 // Without the key the chat says it is unavailable, as on Vercel without the env.
 const keylessPost = await fetch(keylessBase + '/api/chat', {method: 'POST', headers: {'content-type': 'application/json', 'x-forwarded-for': '203.0.113.3'}, body: JSON.stringify({messages: [{role: 'user', content: 'Hi'}]})});
 assert.equal(keylessPost.status, 503);
});
