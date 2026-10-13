import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createChatHandler} from '../src/lib/chat-handler.ts';
import type {ChatKnowledge} from '../src/lib/chat-knowledge.ts';

// Vercel bundles this public, generated file through includeFiles. Secrets are
// read here at runtime; this entry point is never imported by the browser.
let handler: ReturnType<typeof createChatHandler>;
let previousKey: string | undefined;
let previousWebhook: string | undefined;
let previousChatLog: string | undefined;
export default {fetch(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const chatLogWebhookUrl = process.env.DISCORD_CHAT_LOG_WEBHOOK_URL;
  // Keep rate-limit state across requests, and reload configuration only when
  // the function's runtime environment changes.
  if (!handler || apiKey !== previousKey || webhookUrl !== previousWebhook || chatLogWebhookUrl !== previousChatLog) {
    previousKey = apiKey; previousWebhook = webhookUrl; previousChatLog = chatLogWebhookUrl;
    handler = createChatHandler({apiKey, webhookUrl, chatLogWebhookUrl,
      knowledge: async () => JSON.parse(await readFile(join(process.cwd(), 'dist/chat-knowledge.json'), 'utf8')) as ChatKnowledge,
    });
  }
  return handler(request);
}};
