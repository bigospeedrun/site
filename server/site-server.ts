// Self-hosted bigospeedrun.com: serves the prebuilt Astro dist with the routing of
// vercel.json, the headers the Vercel platform adds, and the two Vercel functions
// (/api/chat and /api/markdown). Vercel does not use this file.
// Run: node --experimental-strip-types server/site-server.ts [--root dist] [--port 3000] [--host 127.0.0.1]
// It expects a proxy (Caddy) in front that terminates TLS, redirects http to https and sets
// X-Forwarded-For to the client IP and X-Forwarded-Proto to https.
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {readFile, stat, unlink, chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, extname, sep} from 'node:path';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {agentResponse, type AgentPages} from '../src/lib/agent-pages.ts';
import {createChatHandler} from '../src/lib/chat-handler.ts';
import type {ChatKnowledge} from '../src/lib/chat-knowledge.ts';

// Content types as measured on Vercel production, 2026-10-16. Unknown types are binary.
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/vnd.microsoft.icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.zip': 'application/zip', '.pdf': 'application/pdf',
};
// Vercel adds these to every response on bigospeedrun.com.
const platformHeaders = {'Strict-Transport-Security': 'max-age=63072000', 'Vary': 'Accept'};
// vercel.json: page paths (no api/ or _astro/, no other file extension) go to the markdown
// function when the Accept header mentions text/markdown, before the filesystem.
const markdownFirst = /^\/((?!api\/|_astro\/)(?:[^.]*|.*\.html))$/;
const wantsMarkdown = (accept: string | null) => /text\/markdown/.test(accept ?? '');

export interface SiteOptions {root: string; env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: () => number}

export function createSiteHandler({root, env = process.env, fetcher, now}: SiteOptions) {
  const dist = resolve(root);
  let pages: Promise<AgentPages> | undefined;
  const markdown = async (request: Request, path: string) => agentResponse(request, await (pages ??= readFile(resolve(dist, 'agent-pages.json'), 'utf8').then(JSON.parse)), path);
  // One handler per process keeps the chat rate limit in memory across requests.
  const chat = createChatHandler({apiKey: env.ANTHROPIC_API_KEY, webhookUrl: env.DISCORD_WEBHOOK_URL, chatLogWebhookUrl: env.DISCORD_CHAT_LOG_WEBHOOK_URL,
    knowledge: async () => JSON.parse(await readFile(resolve(dist, 'chat-knowledge.json'), 'utf8')) as ChatKnowledge, fetcher, now});
  const etags = new Map<string, {mtime: number; etag: string}>();

  async function file(pathname: string): Promise<string | undefined> {
    const target = resolve(dist, '.' + pathname);
    if (target !== dist && !target.startsWith(dist + sep)) return;
    for (const candidate of pathname.endsWith('/') ? [resolve(target, 'index.html')] : [target, resolve(target, 'index.html')]) {
      try { if ((await stat(candidate)).isFile()) return candidate; }
      catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
    }
  }

  async function serveFile(request: Request, path: string, status = 200): Promise<Response> {
    const info = await stat(path);
    const body = await readFile(path);
    let cached = etags.get(path);
    if (!cached || cached.mtime !== info.mtimeMs) etags.set(path, cached = {mtime: info.mtimeMs, etag: `"${createHash('sha1').update(body).digest('hex')}"`});
    const immutable = path.startsWith(resolve(dist, '_astro') + sep);
    const headers = new Headers({'Content-Type': types[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate', 'ETag': cached.etag});
    // Vercel answers other methods with a bare 405; Allow is added, as HTTP requires it.
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {'Cache-Control': 'public, max-age=0, must-revalidate', 'Allow': 'GET, HEAD'}});
    if (status === 200 && request.headers.get('if-none-match') === cached.etag) return new Response(null, {status: 304, headers});
    headers.set('Content-Length', String(body.length));
    return new Response(request.method === 'HEAD' ? null : body, {status, headers});
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { pathname = '/404'; }
    const accept = request.headers.get('accept');
    const match = markdownFirst.exec(pathname);
    if (match && wantsMarkdown(accept)) return markdown(request, '/' + match[1]);
    if (pathname === '/api/chat') return chat(request);
    if (pathname === '/api/markdown') return markdown(request, '/' + (url.searchParams.get('agentPath') ?? ''));
    const found = await file(pathname);
    if (found) return serveFile(request, found);
    if (wantsMarkdown(accept)) return markdown(request, pathname.replace(/^\/+/, '/'));
    return serveFile(request, resolve(dist, '404.html'), 404);
  }

  return async (request: Request): Promise<Response> => {
    let response: Response;
    try { response = await route(request); }
    catch { response = new Response('The site could not serve this request.', {status: 500, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}}); }
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(platformHeaders)) headers.set(name, value);
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  };
}

// Node request -> Fetch Request. The proxy sets X-Forwarded-For and X-Forwarded-Proto; a
// request without them (a local health check) gets the socket address and http.
export function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'unknown');
  const proto = headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https' ? 'https' : 'http';
  const url = `${proto}://${headers.get('host') ?? 'localhost'}${req.url ?? '/'}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method ?? 'GET');
  return new Request(url, {method: req.method, headers, ...(hasBody ? {body: Readable.toWeb(req) as ReadableStream, duplex: 'half'} : {})} as RequestInit);
}

export async function send(response: Response, res: ServerResponse): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) { res.end(); return; }
  // Stream, so chat replies (Server-Sent Events) reach the visitor as they arrive.
  await new Promise<void>((done, fail) => Readable.fromWeb(response.body as never).on('error', fail).pipe(res).on('finish', done).on('error', fail));
}

export function startSiteServer(options: SiteOptions & {port: number; host: string}, handle = createSiteHandler(options)) {
  const server = siteServer(handle);
  return new Promise<typeof server>(done => server.listen(options.port, options.host, () => done(server)));
}

export function siteServer(handle: (request: Request) => Promise<Response>) {
  const server = createServer((req, res) => {
    handle(toRequest(req)).then(response => send(response, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  // Chat replies can take up to 45 s (CHAT_TIMEOUT_MS); keep a margin, as Vercel's maxDuration 60.
  server.requestTimeout = 65_000;
  return server;
}

// Self-hosted, Caddy on the host reaches the site through a Unix socket in a shared
// directory: the container's network is internal, so it publishes no port. The directory's
// owner and mode decide who may connect; the socket itself is open to them.
export async function startSocketServer(options: SiteOptions & {socket: string}, handle = createSiteHandler(options)) {
  const server = siteServer(handle);
  await unlink(options.socket).catch(() => {});
  await new Promise<void>(done => server.listen(options.socket, () => done()));
  await chmod(options.socket, 0o666);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name: string, fallback: string) => { const i = process.argv.lastIndexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
  const root = option('--root', 'dist'), socket = option('--socket', process.env.SITE_SOCKET ?? '');
  // TCP serves the container's health check; the socket, when set, serves Caddy. One
  // handler serves both, so the chat rate limit is one per process.
  const handle = createSiteHandler({root});
  const server = await startSiteServer({root, port: Number(option('--port', process.env.PORT ?? '3000')), host: option('--host', process.env.HOST ?? '127.0.0.1')}, handle);
  const socketServer = socket ? await startSocketServer({root, socket}, handle) : undefined;
  console.log(`bigospeedrun site server listening on ${JSON.stringify(server.address())}${socket ? ` and ${socket}` : ''}`);
  const stop = () => { socketServer?.close(); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
