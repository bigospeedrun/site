import {buildSystemPrompt, isKnownPage, type ChatKnowledge} from './chat-knowledge.ts';

export const CHAT_MODEL = 'claude-sonnet-5-5';
export const FALLBACK_MODEL = 'claude-sonnet-4-6';
export const MAX_BODY_BYTES = 32_768;
export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_HISTORY = 20;
export const MAX_HISTORY_CHARS = 16_000;
export const CHAT_TIMEOUT_MS = 45_000;
const encoder = new TextEncoder();
export type ChatMessage = {role: 'user' | 'assistant'; content: string};
type Options = {
  // webhookUrl posts to Nil's private server; chatLogWebhookUrl posts to the
  // private chat log channel in the Big O Speedrun server.
  apiKey?: string; webhookUrl?: string; chatLogWebhookUrl?: string; localStub?: boolean;
  knowledge: () => Promise<ChatKnowledge>;
  fetcher?: typeof fetch; now?: () => number; timeoutMs?: number;
};

const json = (value: unknown, status = 200, headers = {}) => Response.json(value, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers},
});
const error = (status: number, message: string, headers = {}) => json({error: {message}}, status, headers);

export function createLimiter(now = Date.now) {
  const hits = new Map<string, number[]>();
  return (ip: string): number => {
    const time = now();
    for (const [key, times] of hits) if (times.at(-1)! <= time - 3_600_000) hits.delete(key);
    const times = (hits.get(ip) ?? []).filter(t => t > time - 3_600_000);
    const minute = times.filter(t => t > time - 60_000);
    if (minute.length >= 5) return Math.max(1, Math.ceil((minute[0] + 60_000 - time) / 1000));
    if (times.length >= 20) return Math.max(1, Math.ceil((times[0] + 3_600_000 - time) / 1000));
    // Bound memory without evicting active clients and resetting their limits.
    if (!hits.has(ip) && hits.size >= 10_000) return 60;
    hits.set(ip, [...times, time]);
    return 0;
  };
}

export async function readBody(req: Request): Promise<unknown> {
  if (Number(req.headers.get('content-length')) > MAX_BODY_BYTES) throw new RangeError();
  if (!req.body) throw new SyntaxError();
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      text += decoder.decode(value, {stream: true});
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export function validateMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_HISTORY) return false;
  let size = 0;
  return value.every((m, i) => {
    if (!m || m.role !== (i % 2 ? 'assistant' : 'user') || typeof m.content !== 'string') return false;
    size += m.content.length;
    return m.content.trim().length > 0 && m.content.length <= (m.role === 'user' ? MAX_MESSAGE_CHARS : 8_000);
  }) && value.at(-1).role === 'user' && size <= MAX_HISTORY_CHARS;
}

// Parse complete SSE frames, including split UTF-8 characters and CRLF. Both
// the client and the provider parser must reject missing completion events.
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
      if (buffer.length > 100_000) throw new Error('Invalid stream');
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (data) yield data;
      }
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createChatHandler(options: Options) {
  const fetcher = options.fetcher ?? fetch;
  const limit = createLimiter(options.now);
  const stub = Boolean(options.localStub && !options.apiKey);
  // Server logs name a webhook by this label, never by its URL.
  const webhooks = [{url: options.webhookUrl, label: 'Chat Discord webhook HTTP status:'}, {url: options.chatLogWebhookUrl, label: 'Chat log Discord webhook HTTP status:'}]
    .filter((hook): hook is {url: string; label: string} => Boolean(hook.url));
  const logging = Boolean(webhooks.length && !stub);
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === 'GET') return json({logging, stub, available: stub || Boolean(options.apiKey)});
    if (req.method !== 'POST') return error(405, 'Send a POST request.', {Allow: 'GET, POST'});
    const origin = req.headers.get('origin');
    if ((origin && origin !== url.origin) || req.headers.get('sec-fetch-site') === 'cross-site')
      return error(403, 'Open the chat from this site.');
    if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
      return error(415, 'Send a JSON request.');
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const retry = limit(ip);
    if (retry) return error(429, `Please wait ${retry} seconds before sending another message.`, {'Retry-After': String(retry)});
    let body: Record<string, unknown>;
    try {
      const parsed = await readBody(req);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError();
      body = parsed as Record<string, unknown>;
    } catch (e) { return error(e instanceof RangeError ? 413 : 400, 'The message is invalid or too long.'); }
    if (!validateMessages(body.messages)) return error(400, 'Send a short message with valid chat history.');
    // This flag makes the logging notice a prerequisite, including when runtime
    // configuration changes while a visitor has the panel open.
    if (logging && body.loggingNotice !== true) return error(409, 'Chat logging has changed. Reopen the chat to read the notice.');
    if (!stub && !options.apiKey) return error(503, 'The chat is not available yet. Please use the FAQ.');
    const messages = body.messages.map(({role, content}) => ({role, content}));
    if (stub) {
      const text = 'This is a local demo reply. The [FAQ](/about#faq) explains how results are reviewed. Each [problem page](/integer-multiplication) gives its statement, current bounds and evidence rules. No message was sent to an AI service.';
      return new Response(`data: ${JSON.stringify({text})}\n\ndata: [DONE]\n\n`, {headers: streamHeaders});
    }
    let knowledge: ChatKnowledge;
    try { knowledge = await options.knowledge(); }
    catch { return error(503, 'The site facts are not available. Please use the FAQ.'); }
    const page = typeof body.page === 'string' && isKnownPage(knowledge, body.page) ? body.page : '/';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? CHAT_TIMEOUT_MS);
    const abort = () => controller.abort();
    req.signal.addEventListener('abort', abort, {once: true});
    if (req.signal.aborted) abort();
    const cleanup = () => { clearTimeout(timeout); req.signal.removeEventListener('abort', abort); };
    // Each webhook gets the same entry and fails on its own.
    const log = async (text: string) => {
      if (!logging) return;
      const body = JSON.stringify({content: text.slice(0, 2000), allowed_mentions: {parse: []}});
      await Promise.all(webhooks.map(async ({url, label}) => {
        try {
          const response = await fetcher(url, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body, signal: AbortSignal.timeout(3_000),
          });
          console.info(label, response.status);
        } catch { /* Logging must not make chat fail. Never print webhook URLs. */ }
      }));
    };
    // The tag pairs a visitor entry with its reply when several visitors chat at once.
    const tag = exchangeTag();
    const requestModel = (model: string) => fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'x-api-key': options.apiKey!, 'anthropic-version': '2023-06-01'},
      body: JSON.stringify({model, max_tokens: 1000, stream: true, messages,
        ...(model === CHAT_MODEL ? {thinking: {type: 'between_tools'}} : {}),
        system: buildSystemPrompt(knowledge, page, logging)}),
      signal: controller.signal,
    });
    let upstream: Response;
    // One log line per failed provider call, so a 502 can be traced: the HTTP status and the
    // error type word only. Never the key, the message text or the visitor's message.
    let failureType: unknown;
    const logUpstreamFailure = (status: number | string) => {
      const type = typeof failureType === 'string' && /^[a-z_]{1,40}$/.test(failureType) ? failureType : 'unknown';
      console.warn('Chat provider call failed:', status, type);
    };
    try {
      upstream = await requestModel(CHAT_MODEL);
      // Only retry an unavailable model, not billing, throttle or network errors.
      if ([400, 403, 404].includes(upstream.status)) {
        const failure = await upstream.json().catch(() => null);
        failureType = failure?.error?.type;
        const unavailableType = ['not_found_error', 'permission_error'].includes(failure?.error?.type);
        if (/model/i.test(String(failure?.error?.message)) && (unavailableType || /not found|not exist|not available|invalid model|unknown model|access/i.test(String(failure?.error?.message)))) {
          failureType = undefined; // the fallback's own failure gets its own type
          upstream = await requestModel(FALLBACK_MODEL);
        }
      }
      if (!upstream.ok || !upstream.body) {
        if (failureType === undefined) failureType = (await upstream.json().catch(() => null))?.error?.type;
        await upstream.body?.cancel().catch(() => {});
        logUpstreamFailure(upstream.status);
        cleanup(); return error(502, 'The chat service is unavailable. Please try again later.');
      }
    } catch (e) { logUpstreamFailure(e instanceof Error && /^\w{1,40}$/.test(e.name) ? e.name : 'throw'); cleanup(); return error(502, 'The chat service is unavailable. Please try again later.'); }
    const visitorLog = log(`[bigospeedrun.com] Visitor ${tag}:\n${messages.at(-1)!.content}\nIP: ${ip}\nBrowser: ${(req.headers.get('user-agent') ?? '').slice(0, 100)}\nPage: ${page}`);
    let cancelled = false;
    return new Response(new ReadableStream<Uint8Array>({
      async start(output) {
        let fullText = '', completed = false;
        const send = (value: unknown) => { if (!cancelled) output.enqueue(encoder.encode(`data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`)); };
        try {
          for await (const data of sseData(upstream.body!)) {
            const event = JSON.parse(data);
            if (event.type === 'error') throw new Error('Provider error');
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
              fullText += event.delta.text;
              if (fullText.length > 8_000) throw new Error('Reply too long');
              send({text: event.delta.text});
            }
            if (event.type === 'message_stop') { completed = true; break; }
          }
          if (!completed || !fullText.trim()) throw new Error('Incomplete response');
          await visitorLog;
          await log(`[bigospeedrun.com] Bot ${tag}:\n${fullText}`);
          send('[DONE]');
        } catch {
          controller.abort();
          send({error: 'The reply was interrupted. Please try again.'});
        } finally {
          cleanup();
          if (!cancelled) output.close();
        }
      },
      cancel() { cancelled = true; controller.abort(); cleanup(); },
    }), {headers: streamHeaders});
  };
}

// Six lowercase hex characters, for example 3fa9c1.
export const exchangeTag = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('');

const streamHeaders = {'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
