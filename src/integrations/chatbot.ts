import type {AstroIntegration} from 'astro';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {createChatHandler} from '../lib/chat-handler.ts';
import {pageText, type ChatKnowledge} from '../lib/chat-knowledge.ts';

async function addPages(knowledge: ChatKnowledge, load: (path: string) => Promise<string>) {
  for (const path of ['/about', ...knowledge.problems.map(p => p.path)]) {
    knowledge.pages[path] = pageText(await load(path), path !== '/about');
  }
  knowledge.pages['/'] = 'Big O Speedrun tracks improved algorithmic bounds for classic problems.';
  return knowledge;
}

// Astro remains static. This bridge is for astro dev/preview only; Vercel runs
// api/chat.ts. The keyless bridge always names itself as a local demo.
function bridge(load: () => Promise<ChatKnowledge>) {
  const handler = createChatHandler({
    apiKey: process.env.ANTHROPIC_API_KEY, webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    chatLogWebhookUrl: process.env.DISCORD_CHAT_LOG_WEBHOOK_URL,
    localStub: process.env.VERCEL !== '1',
    knowledge: load,
  });
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/chat') return next();
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      // In local mode do not trust a visitor's forwarded address.
      headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'local');
      const init: RequestInit & {duplex?: string} = {method: req.method, headers, signal: abort.signal};
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>; init.duplex = 'half';
      }
      const response = await handler(new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, init));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        const reader = response.body.getReader();
        while (true) { const {done, value} = await reader.read(); if (done) break; if (res.destroyed) { await reader.cancel(); break; } res.write(value); }
      }
      res.end();
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  };
}

export default function chatbot(): AstroIntegration {
  return {name: 'bigospeedrun-chatbot', hooks: {
    'astro:config:setup': ({command, config, updateConfig}) => {
      // Separate caches let multiple development servers use one checkout.
      if (command === 'dev') updateConfig({vite: {
        cacheDir: fileURLToPath(new URL(`node_modules/.vite-${config.server.port}`, config.root)),
      }});
    },
    'astro:build:done': async ({dir}) => {
      const path = fileURLToPath(new URL('chat-knowledge.json', dir));
      const knowledge = JSON.parse(await readFile(path, 'utf8')) as ChatKnowledge;
      await addPages(knowledge, path => readFile(new URL(`.${path}/index.html`, dir), 'utf8'));
      await writeFile(path, JSON.stringify(knowledge));
    },
    'astro:server:setup': ({server}) => {
      server.middlewares.use(bridge(async () => {
        const address = server.httpServer?.address();
        if (!address || typeof address === 'string') throw new Error('Missing dev server');
        const origin = `http://127.0.0.1:${address.port}`;
        const response = await fetch(origin + '/chat-knowledge.json');
        if (!response.ok) throw new Error('Missing knowledge');
        return addPages(await response.json() as ChatKnowledge, async path => {
          const page = await fetch(origin + path);
          if (!page.ok) throw new Error('Missing page');
          return page.text();
        });
      }));
    },
  }};
}
