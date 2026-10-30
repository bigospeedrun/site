import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connect, createServer, type AddressInfo, type Server} from 'node:net';
import {request} from 'node:http';
import {createEgressProxy, isPublic} from '../../ops/self-host/egress-proxy.mjs';

// The proxy runs for real on a local port. DNS is a stub: allowed names "resolve" to public
// test addresses, and dial() sends the checked address to a local echo server instead.
const listen = (server: Server) => new Promise<number>(done => server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)));
async function setup(answers: Record<string, string[]>, limits = {}) {
 // The proxy destroys its upstream socket at a close or a lifetime, which can reset the echo side of a busy tunnel:
 // an unhandled error event there fails whichever test is running (read ECONNRESET, 2026-10-30).
 const echo = createServer(socket => { socket.on('error', () => {}); socket.on('data', data => socket.write('echo:' + data)); });
 const echoPort = await listen(echo);
 const dialed: string[] = [];
 const proxy = createEgressProxy('api.anthropic.com:443,discord.com:443,hang.example:443', () => {}, {
  resolve: async (host: string) => { if (host === 'hang.example') return new Promise<string[]>(() => {}); return answers[host] ?? []; },
  dial: (address: string) => { dialed.push(address); return connect(echoPort, '127.0.0.1'); },
  ...limits,
 });
 const port = await listen(proxy as unknown as Server);
 // Opens a tunnel; resolves with the proxy's status line and the open socket.
 const tunnel = (target: string) => new Promise<{status: string; socket: ReturnType<typeof connect>}>(done => {
  const socket = connect(port, '127.0.0.1', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
  socket.once('data', chunk => done({status: String(chunk).split('\r\n')[0], socket}));
  socket.on('error', () => {});
 });
 return {tunnel, dialed, port, close: () => { proxy.close(); echo.close(); }};
}
const closed = (socket: ReturnType<typeof connect>) => new Promise<void>(done => socket.once('close', () => done()));

test('only public addresses count: private, loopback, link-local, CGNAT and mapped answers are refused', () => {
 for (const address of ['93.184.216.34', '160.79.104.10', '2606:4700::6810:84e5']) assert.equal(isPublic(address), true, address);
 for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.254',
  '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:93.184.216.34', '64:ff9b::a00:1', 'not-an-ip'])
  assert.equal(isPublic(address), false, address);
});

test('an allowed name tunnels to the checked public address only', async () => {
 const r = await setup({'api.anthropic.com': ['160.79.104.10'], 'discord.com': ['162.159.135.232', '10.0.0.5']});
 try {
  const ok = await r.tunnel('api.anthropic.com:443');
  assert.equal(ok.status, 'HTTP/1.1 200 Connection Established');
  ok.socket.write('ping');
  assert.equal(String(await new Promise(done => ok.socket.once('data', done))), 'echo:ping');
  assert.deepEqual(r.dialed, ['160.79.104.10']);
  ok.socket.destroy();
  // One private answer among public ones refuses the whole name.
  assert.equal((await r.tunnel('discord.com:443')).status, 'HTTP/1.1 403 Forbidden');
  assert.equal((await r.tunnel('example.com:443')).status, 'HTTP/1.1 403 Forbidden');
  assert.equal((await r.tunnel('api.anthropic.com:80')).status, 'HTTP/1.1 403 Forbidden');
  const plain = await new Promise<number>(done => request({host: '127.0.0.1', port: r.port, path: 'http://example.com/'}, res => { res.resume(); done(res.statusCode!); }).end());
  assert.equal(plain, 405);
  assert.deepEqual(r.dialed, ['160.79.104.10']);
 } finally { r.close(); }
});

test('a name that resolves inside is refused, and DNS has a time limit', async () => {
 const r = await setup({'api.anthropic.com': ['127.0.0.1'], 'discord.com': ['169.254.169.254']}, {dnsMs: 100});
 try {
  assert.equal((await r.tunnel('api.anthropic.com:443')).status, 'HTTP/1.1 403 Forbidden');
  assert.equal((await r.tunnel('discord.com:443')).status, 'HTTP/1.1 403 Forbidden');
  assert.equal((await r.tunnel('hang.example:443')).status, 'HTTP/1.1 502 Bad Gateway');
  assert.deepEqual(r.dialed, []);
 } finally { r.close(); }
});

test('the number of tunnels is limited; a closed tunnel frees its place', async () => {
 const r = await setup({'api.anthropic.com': ['160.79.104.10']}, {maxTunnels: 2});
 try {
  const first = await r.tunnel('api.anthropic.com:443'), second = await r.tunnel('api.anthropic.com:443');
  assert.equal(second.status, 'HTTP/1.1 200 Connection Established');
  assert.equal((await r.tunnel('api.anthropic.com:443')).status, 'HTTP/1.1 503 Service Unavailable');
  first.socket.destroy();
  await new Promise(done => setTimeout(done, 50));
  assert.equal((await r.tunnel('api.anthropic.com:443')).status, 'HTTP/1.1 200 Connection Established');
  second.socket.destroy();
 } finally { r.close(); }
});

// Each limit gets its own proxy, and the other limit is far away, so a slow machine cannot make
// one limit close the tunnel in place of the other. Only the lifetime test has a lower bound.
test('an idle tunnel closes long before its lifetime', async () => {
 const r = await setup({'api.anthropic.com': ['160.79.104.10']}, {idleMs: 150, lifetimeMs: 20_000});
 try {
  const idle = await r.tunnel('api.anthropic.com:443');
  const started = Date.now();
  await closed(idle.socket);
  assert.ok(Date.now() - started < 10_000, 'idle close');
 } finally { r.close(); }
});

test('a busy tunnel closes at its lifetime, not before', async () => {
 const r = await setup({'api.anthropic.com': ['160.79.104.10']}, {idleMs: 5_000, lifetimeMs: 600});
 try {
  // The lifetime clock starts inside the proxy, after this timestamp, so a slow tunnel setup cannot shorten the measurement.
  const begin = Date.now();
  const busy = await r.tunnel('api.anthropic.com:443');
  const traffic = setInterval(() => busy.socket.write('x'), 50);
  await closed(busy.socket);
  clearInterval(traffic);
  const lived = Date.now() - begin;
  assert.ok(lived >= 550 && lived < 4_000, `lifetime ${lived} ms`);
 } finally { r.close(); }
});
